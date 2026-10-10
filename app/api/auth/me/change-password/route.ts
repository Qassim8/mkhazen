import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { createSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { requireLogin } from "@/lib/permissions-server";
import { apiError, readJson } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة").max(200),
    newPassword: z
      .string()
      .min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف")
      .max(200, "كلمة المرور الجديدة طويلة جدًا"),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية",
    path: ["newPassword"],
  });

export async function PUT(req: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const session = guard.session;

    const validation = changePasswordSchema.safeParse(await readJson(req));
    if (!validation.success) {
      return apiError(422, "VALIDATION_ERROR", validation.error.issues[0].message);
    }

    const limit = checkRateLimit(`change-password:${session.userId}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return apiError(429, "RATE_LIMITED", "محاولات كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.");
    }

    const { currentPassword, newPassword } = validation.data;

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, password")
      .eq("id", session.userId)
      .maybeSingle();

    if (userError) {
      console.error("change-password lookup:", userError);
      return apiError(503, "SERVICE_UNAVAILABLE", "تعذر الوصول لقاعدة البيانات، حاول مرة أخرى.");
    }

    if (!user) {
      return apiError(404, "NOT_FOUND", "المستخدم غير موجود");
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return apiError(400, "VALIDATION_ERROR", "كلمة المرور الحالية غير صحيحة");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const { data: updatedUser, error } = await supabaseAdmin
      .from("users")
      .update({ password: hashedPassword, isPasswordChanged: true })
      .eq("id", session.userId)
      .select("id, role, email, name")
      .single();

    if (error || !updatedUser) {
      console.error("change-password update:", error);
      return apiError(500, "INTERNAL_ERROR", "فشل التحديث في قاعدة البيانات");
    }

    // جلسة جديدة ببصمة كلمة السر الجديدة → أي جلسة قديمة على جهاز تاني بتبطل
    await createSession({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      isPasswordChanged: true,
      passwordHash: hashedPassword,
    });

    return NextResponse.json({
      message: "تم تغيير كلمة المرور بنجاح",
      role: updatedUser.role,
    });
  } catch (error) {
    console.error("change-password:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ في السيرفر");
  }
}

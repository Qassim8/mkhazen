import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { requireLogin } from "@/lib/permissions-server";
import { apiError, readJson } from "@/lib/api-response";
import { updateProfileSchema } from "@/lib/validations/auth.schemas";

export async function PUT(req: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;

    const validation = updateProfileSchema.safeParse(await readJson(req));
    if (!validation.success) {
      return apiError(422, "VALIDATION_ERROR", validation.error.issues[0].message);
    }

    const { name, email, phone } = validation.data;

    const { data: updatedUser, error } = await supabaseAdmin
      .from("users")
      .update({ name: name.trim(), email: email.trim(), phone: phone.trim() })
      .eq("id", guard.session.userId)
      .select("id, name, email, phone")
      .single();

    if (error) {
      if (error.code === "23505") {
        return apiError(409, "CONFLICT", "البريد الإلكتروني مستخدم بالفعل");
      }
      console.error("Profile update:", error);
      return apiError(500, "INTERNAL_ERROR", "فشل تحديث الملف الشخصي");
    }

    revalidateTag("employee-info", "default");

    return NextResponse.json({
      message: "تم تحديث البيانات بنجاح",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile update:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ في السيرفر");
  }
}

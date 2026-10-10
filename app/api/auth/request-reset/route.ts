import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { MESSAGES } from "@/lib/api-codes";
import { apiError, readJson } from "@/lib/api-response";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations/auth.schemas";

// نفس الرد سواء المستخدم موجود أو لأ → ما نكشفش مين مسجل في النظام
const GENERIC_RESPONSE = {
  message: "إذا كان الحساب مسجلًا في النظام فقد تم إرسال طلبك إلى الإدارة.",
};

export async function POST(req: Request) {
  try {
    const validation = forgotPasswordSchema.safeParse(await readJson(req));

    if (!validation.success) {
      return apiError(400, "VALIDATION_ERROR", "يرجى إدخال البريد الإلكتروني أو الاسم");
    }

    // 5 طلبات كل 15 دقيقة من نفس الـ IP (منع إغراق الإدارة بالإشعارات)
    const limit = checkRateLimit(`reset:${clientIp(req)}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { message: MESSAGES.RATE_LIMITED, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    // الإدخال بيدخل فلتر PostgREST: نشيل الرموز اللي ممكن تغيّر الاستعلام
    // (% _ للـ wildcard، و , ( ) * \ " لبنية الفلتر)
    const cleanInput = validation.data.identifier
      .trim()
      .toLowerCase()
      .replace(/[%_,()*\\"]/g, "")
      .slice(0, 120);

    if (!cleanInput) {
      return apiError(400, "VALIDATION_ERROR", "يرجى إدخال البريد الإلكتروني أو الاسم");
    }

    // 1. البحث عن الموظف (مطابقة كاملة بدون حساسية لحالة الأحرف)
    const { data: matches, error } = await supabaseAdmin
      .from("users")
      .select('id, name, role, "resetRequested"')
      .or(`email.ilike.${cleanInput},name.ilike.${cleanInput}`)
      .limit(2);

    if (error) {
      console.error("request-reset lookup:", error);
      return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
    }

    // أكتر من حساب بنفس الاسم أو مفيش حساب: نفس الرد العام من غير أي تعديل
    const user = matches && matches.length === 1 ? matches[0] : null;

    if (!user || user.resetRequested || String(user.role ?? "").toLowerCase() === "owner") {
      // المالك يُعاد تعيينه عن طريق الدعم الفني؛ والطلب المفتوح ما يتكررش
      return NextResponse.json(GENERIC_RESPONSE);
    }

    // 2. تحديث حالة الموظف
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ resetRequested: true })
      .eq("id", user.id);

    if (updateError) {
      console.error("request-reset update:", updateError);
      return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
    }

    // 3. الإشعار للإدارة كلها (المالك والمدير)
    const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
      target_roles: null,
      title: "طلب إعادة تعيين كلمة المرور",
      message: `طلب الموظف ${user.name} إعادة تعيين كلمة المرور الخاصة به.`,
      type: "RESET_PASSWORD",
      link: "/dashboard/employees?filter=resetRequested",
      metadata: { user_id: user.id },
    });

    if (notifyError) {
      console.error("request-reset notify:", notifyError);
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("request-reset:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء إرسال الطلب");
  }
}

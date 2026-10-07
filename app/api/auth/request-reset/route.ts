import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { identifier } = await req.json();

    if (!identifier || !identifier.trim()) {
      return NextResponse.json(
        { message: "يرجى إدخال البريد الإلكتروني أو الاسم" },
        { status: 400 },
      );
    }

    // الإدخال بيدخل فلتر PostgREST: نشيل الرموز اللي ممكن تغيّر الاستعلام (% , ( ) * \)
    const cleanInput = String(identifier)
      .trim()
      .toLowerCase()
      .replace(/[%,()*\\]/g, "");

    if (!cleanInput) {
      return NextResponse.json(
        { message: "يرجى إدخال البريد الإلكتروني أو الاسم" },
        { status: 400 },
      );
    }

    // 1. البحث عن الموظف
    const { data: user } = await supabaseAdmin
      .from("users")
      .select('id, name, email, role, "resetRequested"')
      .or(`email.ilike.${cleanInput},name.ilike.${cleanInput}`)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { message: "هذا المستخدم غير مسجل في النظام" },
        { status: 404 },
      );
    }

    // طلب مفتوح بالفعل: ما نكررش الإشعار (منع إغراق الإشعارات)
    if (user.resetRequested) {
      return NextResponse.json({
        message: "تم إرسال الطلب لمدير النظام بنجاح",
      });
    }

    // 2. تحديث حالة الموظف
    await supabaseAdmin
      .from("users")
      .update({ resetRequested: true })
      .eq("id", user.id);

    // 3. الإشعار للإدارة كلها (المالك والمدير)
    const requesterRole = String(user.role ?? "").toLowerCase();

    if (requesterRole === "owner") {
      return NextResponse.json({
        message: "حساب المالك يُعاد تعيينه عن طريق الدعم الفني للنظام.",
      });
    }

    await supabaseAdmin.from("notifications").insert({
      target_roles: null,
      title: "طلب إعادة تعيين كلمة المرور",
      message: `طلب الموظف ${user.name} إعادة تعيين كلمة المرور الخاصة به.`,
      type: "RESET_PASSWORD",
      link: "/dashboard/employees?filter=resetRequested",
      metadata: { user_id: user.id },
    });

    return NextResponse.json({
      message: "تم إرسال الطلب لمدير النظام بنجاح",
    });
  } catch {
    return NextResponse.json(
      { message: "حدث خطأ أثناء إرسال الطلب" },
      { status: 500 },
    );
  }
}

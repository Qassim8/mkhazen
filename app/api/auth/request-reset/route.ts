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

    const cleanInput = identifier.trim().toLowerCase();

    // 1. البحث عن الموظف
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .or(`email.ilike.${cleanInput},name.ilike.${cleanInput}`)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { message: "هذا المستخدم غير مسجل في النظام" },
        { status: 404 },
      );
    }

    // 2. تحديث حالة الموظف
    await supabaseAdmin
      .from("users")
      .update({ resetRequested: true })
      .eq("id", user.id);

    // 3. إنشاء إشعار موجه للأدمن
    await supabaseAdmin.from("notifications").insert({
      title: "طلب إعادة تعيين كلمة المرور",
      message: `طلب الموظف ${user.name} إعادة تعيين كلمة المرور الخاصة به.`,
      type: "RESET_PASSWORD",
      link: "/dashboard/employees?filter=resetRequested",
      metadata: { user_id: user.id },
    });

    return NextResponse.json({
      message: "تم إرسال الطلب لمدير النظام بنجاح",
    });
  } catch (error) {
    return NextResponse.json(
      { message: "حدث خطأ أثناء إرسال الطلب" },
      { status: 500 },
    );
  }
}

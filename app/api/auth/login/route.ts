import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations/auth.schemas";
import { createSession, isAccountActive } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = validation.data;

    // البحث عن الموظف/المستخدم في Supabase
    const { data: user, error } = await supabaseAdmin
      .from("users") // اسم الجدول لديك
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    // التأكد من أن الحساب نشط
    if (!isAccountActive(user.isActive)) {
      return NextResponse.json(
        { message: "هذا الحساب غير نشط، يرجى مراجعة الإدارة" },
        { status: 403 },
      );
    }

    // مطابقة كلمة المرور المشفّرة
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    // حفظ الجلسة
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isPasswordChanged: Boolean(user.isPasswordChanged),
    });

    return NextResponse.json(
      {
        message: "تم تسجيل الدخول بنجاح",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          position: user.position,
        },
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("Login Error:", err);
    return NextResponse.json(
      { message: "حدث خطأ أثناء تسجيل الدخول" },
      { status: 500 },
    );
  }
}

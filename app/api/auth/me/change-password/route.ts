import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, createSession } from "@/lib/auth"; // تأكد من استيراد دالة إنشاء الكوكي
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(req: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, password, role, position, email, name")
      .eq("id", session.userId)
      .single();

    if (!user) {
      return NextResponse.json(
        { message: "المستخدم غير موجود" },
        { status: 404 },
      );
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "كلمة المرور الحالية غير صحيحة" },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const { data: updatedUser, error } = await supabaseAdmin
      .from("users")
      .update({ password: hashedPassword, isPasswordChanged: true })
      .eq("id", session.userId)
      .select("id, role, position, email, name, isPasswordChanged")
      .single();

    if (error || !updatedUser) {
      return NextResponse.json(
        { message: "فشل التحديث في قاعدة البيانات" },
        { status: 400 },
      );
    }

    // ⭐️ إنشاء Session جديدة وتحديث الـ Cookie بقيمة true
    await createSession({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.position || updatedUser.role,
      isPasswordChanged: true,
    });

    return NextResponse.json({
      message: "تم تغيير كلمة المرور بنجاح",
      role: updatedUser.position || updatedUser.role,
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: "حدث خطأ في السيرفر" },
      { status: 500 },
    );
  }
}

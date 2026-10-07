import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function PUT(req: Request) {
  try {
    const session = await getSession();

    if (!session || !session.userId) {
      return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
    }

    const { name, email, phone } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json({ message: "الاسم مطلوب" }, { status: 400 });
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from("users")
      .update({ name: name.trim(), email: email.trim(), phone: phone })
      .eq("id", session.userId)
      .select("id, name, email, phone")
      .single();

    if (error) {
      return NextResponse.json(
        { message: "فشل تحديث الملف الشخصي" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "تم تحديث البيانات بنجاح",
      user: updatedUser,
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: "حدث خطأ في السيرفر" },
      { status: 500 },
    );
  }
}

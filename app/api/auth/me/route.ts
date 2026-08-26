// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/validations/auth.schemas";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, phone, role, shift, isPasswordChanged")
    .eq("id", session.userId)
    .single();

  if (error || !user) {
    return NextResponse.json(
      { message: "المستخدم غير موجود" },
      { status: 404 },
    );
  }

  return NextResponse.json(user, {
    headers: {
      "Cache-Control": "no-store, max-age=0", // لمنع المتصفح من كاش الكول في الـ Client
    },
  });
}

export async function PUT(req: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const { name, email, phone } = validation.data;
    const updateData: Record<string, any> = { name, email, phone };

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update(updateData)
      .eq("id", session.userId);

    if (updateError) {
      if (updateError.message.includes("duplicate key")) {
        return NextResponse.json(
          { message: "البريد الإلكتروني مستخدم بالفعل" },
          { status: 400 },
        );
      }
      throw updateError;
    }

    // إجبار Next.js على إلغاء كاش البيانات وإعادة تنشيط الصفحات
    revalidateTag("employee-info");
    revalidatePath("/dashboard", "layout");

    return NextResponse.json({ message: "تم تحديث بيانات الحساب بنجاح" });
  } catch (err: any) {
    console.error("Profile Update Error:", err);
    return NextResponse.json(
      { message: "فشل في تحديث بيانات الحساب" },
      { status: 500 },
    );
  }
}

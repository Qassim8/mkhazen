import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { categorySchema } from "@/lib/validations/category.schemas";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";

// 1️⃣ جلب جميع الفئات
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب الفئات", error: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = categorySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات الفئة غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert([
        {
          name: validation.data.name,
          description: validation.data.description || null,
          imageUrl: validation.data.imageUrl || null,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("categories-list", "default");

    return NextResponse.json(
      { message: "تمت إضافة الفئة بنجاح", data },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة الفئة", error: err.message },
      { status: 500 },
    );
  }
}

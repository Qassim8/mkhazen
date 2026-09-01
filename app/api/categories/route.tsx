import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { categorySchema } from "@/app/dashboard/categories/schemas/category.schemas";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";

// 1️⃣ جلب جميع الفئات
export async function GET() {
  try {
    // جلب الفئات مع عدد المنتجات المربوطة بها عن طريق تحديد العلاقة العكسية
    // ملاحظة: إذا كان اسم الحقل في جدول المنتجات categoryId أو category_id يتم حسابه تلقائياً
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select(
        `
        *,
        product_templates(count)
      `,
      )
      .order("createdAt", { ascending: false });

    // في حال فشل الاستعلام بسبب عدم تعريف Foreign Key في SupabaseSchema
    // نسحب الفئات بشكل مباشر لتجنب الـ Crash
    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from("categories")
        .select("*")
        .order("createdAt", { ascending: false });

      if (fallbackError) {
        return NextResponse.json(
          { message: fallbackError.message },
          { status: 400 },
        );
      }

      const formatted = (fallbackData || []).map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        imageUrl: cat.imageUrl,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
        productsCount: 0,
      }));

      return NextResponse.json({ data: formatted }, { status: 200 });
    }

    // تنسيق الاستجابة وتأمين جلب count بشكل صحيح
    const formattedCategories = (data || []).map((cat: any) => {
      const countVal = Array.isArray(cat.product_templates)
        ? cat.product_templates[0]?.count
        : cat.product_templates?.count;

      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        imageUrl: cat.imageUrl,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
        productsCount: countVal ?? 0,
      };
    });

    return NextResponse.json({ data: formattedCategories }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب الفئات", error: err.message },
      { status: 500 },
    );
  }
}

// 2️⃣ إضافة فئة جديدة
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

    revalidateTag("categories-list", "");

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

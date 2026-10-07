import { errorMessage } from "@/lib/errors";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAllResult } from "@/lib/supabase-fetch-all";
import { categorySchema } from "@/app/dashboard/categories/schemas/category.schemas";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { requireLogin } from "@/lib/permissions-server";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  product_templates?: { count: number }[] | { count: number } | null;
};

// 1️⃣ جلب جميع الفئات
export async function GET() {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;

  try {
    const { data, error } = await fetchAllResult<Record<string, unknown>>((from, to) =>
      supabaseAdmin
        .from("categories")
        .select(
          `
        *,
        product_templates(count)
      `,
        )
        .order("createdAt", { ascending: false })
        .order("id")
        .range(from, to),
    );

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

      const formatted = ((fallbackData || []) as CategoryRow[]).map((cat) => ({
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
    const formattedCategories = ((data || []) as CategoryRow[]).map((cat) => {
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
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب الفئات", error: errorMessage(err) },
      { status: 500 },
    );
  }
}

// 2️⃣ إضافة فئة جديدة
export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user || !can(user.role, "catalog.manage")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك" },
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

    const name = validation.data.name.trim();
    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert([
        {
          name,
          description: validation.data.description || null,
          imageUrl: validation.data.imageUrl || null,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error?.code === "23505") {
        return NextResponse.json(
          { message: "اسم الفئة موجود بالفعل" },
          { status: 409 },
        );
      }
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("categories-list", "default");

    return NextResponse.json(
      { message: "تمت إضافة الفئة بنجاح", data },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة الفئة", error: errorMessage(err) },
      { status: 500 },
    );
  }
}

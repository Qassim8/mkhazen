import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { productSchema } from "@/lib/validations/product.schemas";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const supplierId = searchParams.get("supplierId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("products")
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
        { count: "exact" },
      )
      .order("createdAt", { ascending: false })
      .range(from, to);

    // إضافة فلتر البحث (بالاسم، أو الـ SKU، أو البار كود)
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`,
      );
    }

    // الفلترة حسب الفئة
    if (categoryId) {
      query = query.eq("categoryId", categoryId);
    }

    // الفلترة حسب المورد
    if (supplierId) {
      query = query.eq("supplierId", supplierId);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        data,
        meta: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء جلب المنتجات", error: err.message },
      { status: 500 },
    );
  }
}

// 2. إنشاء منتج جديد
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // توليد SKU تلقائي في حال عدم إدخاله
    if (!body.sku) {
      body.sku = `PROD-${Date.now().toString().slice(-6)}`;
    }

    // توليد باركود تلقائي في حال عدم مسحه/إدخاله
    if (!body.barcode) {
      body.barcode = Math.floor(
        100000000000 + Math.random() * 900000000000,
      ).toString();
    }

    const validation = productSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المنتج غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert([validation.data])
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      )
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      { message: "تم إضافة المنتج بنجاح", data },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة المنتج", error: err.message },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { productSchema } from "@/app/dashboard/products/schemas/product.schemas";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const supplierId = searchParams.get("supplierId");
    const sortBy = searchParams.get("sortBy") || "createdAt-desc";
    const status = searchParams.get("status");

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("products").select(
      `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      { count: "exact" },
    );

    // 1. الفرز (Sorting)
    const [sortColumn, sortOrder] = sortBy.split("-");
    query = query.order(sortColumn || "createdAt", {
      ascending: sortOrder === "asc",
    });

    // 2. البحث النصي
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`,
      );
    }

    // 3. فلترة الفئة والمورد
    if (categoryId) query = query.eq("categoryId", categoryId);
    if (supplierId) query = query.eq("supplierId", supplierId);

    // 4. فلترة حالة المخزون (Status Filter)
    if (status === "outstock") {
      query = query.lte("stockQuantity", 0);
    } else if (status === "instock") {
      query = query.gt("stockQuantity", 0);
    }

    // تطبيق الـ Pagination
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { message: `خطأ أثناء جلب البيانات: ${error.message}` },
        { status: 400 },
      );
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
      {
        message: "خطأ غير متوقع في السيرفر أثناء جلب المنتجات",
        error: err.message,
      },
      { status: 500 },
    );
  }
}

// 2. إنشاء منتج جديد (محمي للأدمن فقط)
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "غير مصرح لك بإجراء هذه العملية. يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const body = await request.json();

    // تنظيف القيم الفارغة مثل "" إلى null في الـ body مباشرة
    Object.keys(body).forEach((key) => {
      if (body[key] === "") {
        body[key] = null;
      }
    });

    // توليد SKU تلقائي عند عدم إدخاله
    if (!body.sku) {
      body.sku = `PROD-${Date.now().toString().slice(-6)}`;
    }

    // توليد باركود تلقائي عند عدم إدخاله
    if (!body.barcode) {
      body.barcode = Math.floor(
        100000000000 + Math.random() * 900000000000,
      ).toString();
    }

    const validation = productSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المنتج المدخلة غير صحيحة",
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
      return NextResponse.json(
        { message: `فشل إنشاء المنتج: ${error.message}` },
        { status: 400 },
      );
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

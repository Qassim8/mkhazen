import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidateTag, revalidatePath } from "next/cache";
import { createProductSchema } from "@/app/dashboard/products/schemas/product.schemas";
import { getSession } from "@/lib/auth";

// 1. جلب المنتجات مع المتغيرات والفئة والمورد
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

    // إذا كان البحث نصياً يحتوي على SKU أو Barcode، نجلب معرفات الـ templates أولاً
    let matchingTemplateIdsFromVariants: string[] = [];
    if (search) {
      const { data: variantMatches } = await supabaseAdmin
        .from("product_variants")
        .select("templateId")
        .or(
          `sku.ilike.%${search}%,barcode.ilike.%${search}%,packBarcode.ilike.%${search}%`,
        );

      if (variantMatches && variantMatches.length > 0) {
        matchingTemplateIdsFromVariants = [
          ...new Set(variantMatches.map((v) => v.templateId)),
        ];
      }
    }

    // بناء الاستعلام الرئيسي
    let query = supabaseAdmin.from("product_templates").select(
      `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name),
        variants:product_variants(*)
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
      if (matchingTemplateIdsFromVariants.length > 0) {
        query = query.or(
          `name.ilike.%${search}%,id.in.(${matchingTemplateIdsFromVariants.join(",")})`,
        );
      } else {
        query = query.ilike("name", `%${search}%`);
      }
    }

    // 3. فلترة الفئة والمورد
    if (categoryId) query = query.eq("categoryId", categoryId);
    if (supplierId) query = query.eq("supplierId", supplierId);

    // 4. فلترة حالة المخزون
    if (status === "outstock" || status === "instock") {
      const { data: filteredVariants } = await supabaseAdmin
        .from("product_variants")
        .select("templateId")
        .filter("stockQuantity", status === "outstock" ? "lte" : "gt", 0);

      const templateIds = [
        ...new Set(filteredVariants?.map((v) => v.templateId) || []),
      ];

      if (templateIds.length > 0) {
        query = query.in("id", templateIds);
      } else {
        // إذا لم توجد أي نتيجة تطابق الشرط
        return NextResponse.json(
          {
            data: [],
            meta: { total: 0, page, limit, totalPages: 0 },
          },
          { status: 200 },
        );
      }
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

// 2. إنشاء منتج جديد مع متغيراته
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

    // تنظيف القيم النصية الفارغة "" إلى null
    if (body) {
      Object.keys(body).forEach((key) => {
        if (body[key] === "") body[key] = null;
      });
      if (Array.isArray(body.variants)) {
        body.variants = body.variants.map((v: any) => {
          Object.keys(v).forEach((k) => {
            if (v[k] === "") v[k] = null;
          });
          return v;
        });
      }
    }

    // التحقق من صحة البيانات باستخدام Schema
    const validation = createProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المنتج المدخلة غير صحيحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { variants, ...templateData } = validation.data;

    // 1. إضافة المنتج الرئيسي (Product Template)
    const { data: template, error: templateError } = await supabaseAdmin
      .from("product_templates")
      .insert([templateData])
      .select(
        `
        *,
        category:categories(id, name),
        supplier:suppliers(id, name)
      `,
      )
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { message: `فشل إنشاء المنتج الأساسي: ${templateError?.message}` },
        { status: 400 },
      );
    }

    // 2. إعداد المتغيرات
    const isSingleProduct = !template.hasVariants;
    const preparedVariants = variants.map((variant, idx) => ({
      templateId: template.id,
      sku: variant.sku || `SKU-${Date.now().toString().slice(-6)}-${idx + 1}`,
      barcode:
        variant.barcode ||
        Math.floor(100000000000 + Math.random() * 900000000000).toString(),
      packBarcode: variant.packBarcode || null,
      colorName: variant.colorName || null,
      colorCode: variant.colorCode || null,
      size: variant.size || null,
      length: variant.length ?? null,
      width: variant.width ?? null,
      purchasePrice: variant.purchasePrice,
      sellingPrice: variant.sellingPrice,
      minSellingPrice: variant.minSellingPrice ?? null,
      stockQuantity: variant.stockQuantity,
      minStockLevel: variant.minStockLevel,
      images: variant.images || [],
      isDefault: isSingleProduct ? true : (variant.isDefault ?? idx === 0),
      isActive: variant.isActive ?? true,
    }));

    // 3. إدراج المتغيرات في قاعدة البيانات
    const { data: insertedVariants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .insert(preparedVariants)
      .select();

    if (variantsError) {
      // Rollback
      await supabaseAdmin
        .from("product_templates")
        .delete()
        .eq("id", template.id);

      return NextResponse.json(
        { message: `فشل إنشاء متغيرات المنتج: ${variantsError.message}` },
        { status: 400 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      {
        message: "تم إضافة المنتج بنجاح",
        data: {
          ...template,
          variants: insertedVariants,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { message: "خطأ في السيرفر أثناء إضافة المنتج", error: err.message },
      { status: 500 },
    );
  }
}

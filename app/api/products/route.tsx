import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { createProductSchema } from "@/app/dashboard/products/schemas/product.schemas";

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),

  categoryId: z.string().uuid().optional(),

  supplierId: z.string().uuid().optional(),

  status: z.enum(["instock", "lowstock", "outstock"]).optional(),

  sortBy: z
    .enum(["createdAt-desc", "createdAt-asc", "name-asc", "name-desc"])
    .default("createdAt-desc"),

  page: z.coerce.number().int().positive().default(1),

  limit: z.coerce.number().int().positive().max(100).default(10),
});

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { message: "يرجى تسجيل الدخول أولاً." },
      { status: 401 },
    );
  }

  if (session.role !== "admin") {
    return NextResponse.json(
      { message: "هذه العملية مقتصرة على المدير." },
      { status: 403 },
    );
  }

  return null;
}

function sanitizeSearch(value: string) {
  return value.replace(/[(),]/g, " ").trim().slice(0, 100);
}

const productListSelect = `
  *,
  category:categories(id, name),
  supplier:suppliers(id, name),
  variants:product_variants(
    id,
    templateId,
    sku,
    barcode,
    packBarcode,
    colorName,
    colorCode,
    size,
    length,
    width,
    purchasePrice,
    sellingPrice,
    minSellingPrice,
    stockQuantity,
    minStockLevel,
    images,
    isDefault,
    isActive,
    createdAt,
    updatedAt
  )
`;

/* =========================================================
   GET /api/products
   Public
   ========================================================= */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = querySchema.safeParse({
      search: searchParams.get("search") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      supplierId: searchParams.get("supplierId") || undefined,
      status: searchParams.get("status") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "معاملات الطلب غير صحيحة.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      search = "",
      categoryId,
      supplierId,
      status,
      sortBy = "createdAt-desc",
      page,
      limit,
    } = parsed.data;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const safeSearch = sanitizeSearch(search);

    /* =====================================================
       Search inside variants
    ===================================================== */

    let matchingTemplateIdsFromVariants: string[] = [];

    if (safeSearch) {
      const { data: variantMatches, error } = await supabaseAdmin
        .from("product_variants")
        .select("templateId")
        .or(
          `sku.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%,packBarcode.ilike.%${safeSearch}%`,
        );

      if (error) {
        console.error("Variant search error:", error);

        return NextResponse.json(
          {
            message: "حدث خطأ أثناء البحث عن المنتجات.",
          },
          { status: 500 },
        );
      }

      matchingTemplateIdsFromVariants = [
        ...new Set((variantMatches ?? []).map((variant) => variant.templateId)),
      ];
    }

    /* =====================================================
       Stock filter

       We calculate for every template:

       totalStock
       totalMinStock

       using ACTIVE variants only.
    ===================================================== */

    let stockFilteredTemplateIds: string[] | null = null;

    if (status) {
      const { data: stockRows, error } = await supabaseAdmin
        .from("product_variants")
        .select('templateId, "stockQuantity", "minStockLevel", "isActive"');

      if (error) {
        console.error("Stock filter error:", error);

        return NextResponse.json(
          {
            message: "حدث خطأ أثناء فلترة المخزون.",
          },
          { status: 500 },
        );
      }

      const grouped = new Map<
        string,
        {
          totalStock: number;
          totalMinStock: number;
          activeCount: number;
        }
      >();

      for (const row of stockRows ?? []) {
        // المنتجات غير النشطة لا تدخل في حساب حالة المخزون
        if (!row.isActive) {
          continue;
        }

        const current = grouped.get(row.templateId) ?? {
          totalStock: 0,
          totalMinStock: 0,
          activeCount: 0,
        };

        current.activeCount += 1;

        current.totalStock += Number(row.stockQuantity ?? 0);

        current.totalMinStock += Number(row.minStockLevel ?? 0);

        grouped.set(row.templateId, current);
      }

      stockFilteredTemplateIds = [];

      for (const [templateId, info] of grouped) {
        /*
         * إذا لم توجد variants نشطة فلا نعتبر المنتج
         * متوفرًا أو منخفضًا أو نافدًا من خلال هذا الفلتر.
         */
        if (info.activeCount === 0) {
          continue;
        }

        const isOutOfStock = info.totalStock <= 0;

        const isLowStock =
          info.totalStock > 0 && info.totalStock <= info.totalMinStock;

        const isInStock = info.totalStock > info.totalMinStock;

        if (
          (status === "instock" && isInStock) ||
          (status === "lowstock" && isLowStock) ||
          (status === "outstock" && isOutOfStock)
        ) {
          stockFilteredTemplateIds.push(templateId);
        }
      }

      /*
       * لا توجد نتائج لهذا الفلتر.
       */
      if (stockFilteredTemplateIds.length === 0) {
        return NextResponse.json(
          {
            data: [],
            meta: {
              total: 0,
              page,
              limit,
              totalPages: 0,
            },
          },
          { status: 200 },
        );
      }
    }

    /* =====================================================
       Main query
    ===================================================== */

    let query = supabaseAdmin
      .from("product_templates")
      .select(productListSelect, {
        count: "exact",
      });

    /* =====================================================
       Search
    ===================================================== */

    if (safeSearch) {
      if (matchingTemplateIdsFromVariants.length > 0) {
        query = query.or(
          `name.ilike.%${safeSearch}%,id.in.(${matchingTemplateIdsFromVariants.join(",")})`,
        );
      } else {
        query = query.ilike("name", `%${safeSearch}%`);
      }
    }

    /* =====================================================
       Category
    ===================================================== */

    if (categoryId) {
      query = query.eq("categoryId", categoryId);
    }

    /* =====================================================
       Preferred Supplier
    ===================================================== */

    if (supplierId) {
      query = query.eq("supplierId", supplierId);
    }

    /* =====================================================
       Stock
    ===================================================== */

    if (stockFilteredTemplateIds) {
      query = query.in("id", stockFilteredTemplateIds);
    }

    /* =====================================================
       Sorting
    ===================================================== */

    const sortMap = {
      "createdAt-desc": {
        column: "createdAt",
        ascending: false,
      },

      "createdAt-asc": {
        column: "createdAt",
        ascending: true,
      },

      "name-asc": {
        column: "name",
        ascending: true,
      },

      "name-desc": {
        column: "name",
        ascending: false,
      },
    } as const;

    const sort = sortMap[sortBy];

    query = query.order(sort.column, {
      ascending: sort.ascending,
    });

    /* =====================================================
       Pagination
    ===================================================== */

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Products GET error:", error);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب المنتجات.",
        },
        { status: 500 },
      );
    }

    const total = count ?? 0;

    return NextResponse.json(
      {
        data: data ?? [],

        meta: {
          total,
          page,
          limit,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Products GET unexpected error:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر.",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST /api/products
   Admin only
   ========================================================= */

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin();

    if (authError) {
      return authError;
    }

    const body = await request.json();

    const validation = createProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات المنتج غير صحيحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { variants, ...templateData } = validation.data;

    /*
     * hasVariants:
     * لا يأتي من المستخدم.
     *
     * يتم حسابه من عدد الـ variants
     * داخل transaction في PostgreSQL.
     */

    const { data: productId, error } = await supabaseAdmin.rpc(
      "create_product",
      {
        p_payload: {
          ...templateData,
          variants,
        },
      },
    );

    if (error) {
      console.error("Create product RPC error:", error);

      if (error.code === "23505") {
        return NextResponse.json(
          {
            message:
              "تعذر إنشاء المنتج بسبب تكرار SKU أو Barcode أو Pack Barcode.",
          },
          { status: 409 },
        );
      }

      if (error.code === "22023" || error.code === "23503") {
        return NextResponse.json({ message: error.message }, { status: 422 });
      }

      return NextResponse.json(
        { message: "فشل إنشاء المنتج." },
        { status: 500 },
      );
    }

    const { data: product, error: fetchError } = await supabaseAdmin
      .from("product_templates")
      .select(productListSelect)
      .eq("id", productId)
      .single();

    if (fetchError || !product) {
      console.error("Created product fetch error:", fetchError);

      return NextResponse.json(
        {
          message: "تم إنشاء المنتج لكن تعذر استرجاع بياناته.",
        },
        { status: 500 },
      );
    }

    revalidateTag("products-list", "default");
    revalidatePath("/dashboard/products");

    return NextResponse.json(
      {
        message: "تم إضافة المنتج بنجاح.",
        data: product,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Products POST unexpected error:", error);

    return NextResponse.json(
      { message: "خطأ غير متوقع أثناء إنشاء المنتج." },
      { status: 500 },
    );
  }
}

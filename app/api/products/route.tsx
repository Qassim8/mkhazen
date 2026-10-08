import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { requireLogin } from "@/lib/permissions-server";
import { fetchAll, pageByAllowedIds } from "@/lib/supabase-fetch-all";
import { can } from "@/lib/permissions";
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

  if (!can(session.role, "catalog.manage")) {
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
   أي مستخدم مسجّل (الكاشير والتفصيل بيستخدموه)
   ========================================================= */

export async function GET(request: Request) {
  const guard = await requireLogin();
  if (!guard.ok) return guard.response;

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

    const safeSearch = sanitizeSearch(search);

    const sortMap = {
      "createdAt-desc": { column: "createdAt", ascending: false },
      "createdAt-asc": { column: "createdAt", ascending: true },
      "name-asc": { column: "name", ascending: true },
      "name-desc": { column: "name", ascending: false },
    } as const;

    const sort = sortMap[sortBy];

    const eqFilters: [string, string][] = [];
    if (categoryId) eqFilters.push(["categoryId", categoryId]);
    if (supplierId) eqFilters.push(["supplierId", supplierId]);

    /* =====================================================
       فلاتر بتتحسب في الكود (البحث في الباركود/SKU + حالة المخزون).
       كل القراءات على دفعات (حد الـ 1000 صف)، والنتيجة قائمة IDs
       بتتقسم صفحات في الكود بدل .in() بقائمة طويلة في الرابط.
    ===================================================== */

    let searchIds: Set<string> | null = null;

    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      const [nameMatches, variantMatches] = await Promise.all([
        fetchAll<{ id: string }>((rangeFrom, rangeTo) =>
          supabaseAdmin
            .from("product_templates")
            .select("id")
            .ilike("name", pattern)
            .order("id")
            .range(rangeFrom, rangeTo),
        ),
        fetchAll<{ templateId: string }>((rangeFrom, rangeTo) =>
          supabaseAdmin
            .from("product_variants")
            .select('id, "templateId"')
            .or(
              `sku.ilike.${pattern},barcode.ilike.${pattern},packBarcode.ilike.${pattern}`,
            )
            .order("id")
            .range(rangeFrom, rangeTo),
        ),
      ]);

      searchIds = new Set([
        ...nameMatches.map((row) => row.id),
        ...variantMatches.map((row) => row.templateId),
      ]);
    }

    let stockIds: Set<string> | null = null;

    if (status) {
      const stockRows = await fetchAll<{
        templateId: string;
        stockQuantity: number | string | null;
        minStockLevel: number | string | null;
        isActive: boolean | null;
      }>((rangeFrom, rangeTo) =>
        supabaseAdmin
          .from("product_variants")
          .select(
            'id, "templateId", "stockQuantity", "minStockLevel", "isActive"',
          )
          .order("id")
          .range(rangeFrom, rangeTo),
      );

      const grouped = new Map<
        string,
        { totalStock: number; totalMinStock: number }
      >();

      for (const row of stockRows) {
        // المنتجات غير النشطة لا تدخل في حساب حالة المخزون
        if (!row.isActive) continue;

        const current = grouped.get(row.templateId) ?? {
          totalStock: 0,
          totalMinStock: 0,
        };
        current.totalStock += Number(row.stockQuantity ?? 0);
        current.totalMinStock += Number(row.minStockLevel ?? 0);
        grouped.set(row.templateId, current);
      }

      stockIds = new Set();

      for (const [templateId, info] of grouped) {
        const isOutOfStock = info.totalStock <= 0;
        const isLowStock =
          info.totalStock > 0 && info.totalStock <= info.totalMinStock;
        const isInStock = info.totalStock > info.totalMinStock;

        if (
          (status === "instock" && isInStock) ||
          (status === "lowstock" && isLowStock) ||
          (status === "outstock" && isOutOfStock)
        ) {
          stockIds.add(templateId);
        }
      }
    }

    const allowed =
      searchIds && stockIds
        ? new Set([...searchIds].filter((id) => stockIds.has(id)))
        : (searchIds ?? stockIds);

    let data: unknown[];
    let total: number;

    if (allowed) {
      const result = await pageByAllowedIds<{ id: string }>({
        allowed,
        page,
        limit,
        orderedIds: (rangeFrom, rangeTo) => {
          let idsQuery = supabaseAdmin.from("product_templates").select("id");
          for (const [column, value] of eqFilters)
            idsQuery = idsQuery.eq(column, value);
          return idsQuery
            .order(sort.column, { ascending: sort.ascending })
            .order("id")
            .range(rangeFrom, rangeTo);
        },
        fetchRows: (ids) =>
          supabaseAdmin
            .from("product_templates")
            .select(productListSelect)
            .in("id", ids),
      });

      data = result.rows;
      total = result.total;
    } else {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // احسب العدد أولًا قبل استخدام range().
      // PostgREST يعيد PGRST103 عندما يكون offset خارج عدد النتائج.
      let countQuery = supabaseAdmin
        .from("product_templates")
        .select("id", { count: "exact", head: true });
      for (const [column, value] of eqFilters)
        countQuery = countQuery.eq(column, value);

      const { count: exactCount, error: countError } = await countQuery;

      if (countError) {
        console.error("Products count error:", countError);
        return NextResponse.json(
          { message: "حدث خطأ أثناء جلب عدد المنتجات." },
          { status: 500 },
        );
      }

      total = exactCount ?? 0;

      // قد يحتفظ الكاش/الواجهة بصفحة قديمة بعد حذف منتجات أو تغيير الفلاتر.
      // إذا كانت الصفحة خارج العدد الحالي، أعد مصفوفة فارغة بدل إرسال offset غير صالح.
      if (total === 0 || from >= total) {
        data = [];
      } else {
        const safeTo = Math.min(to, total - 1);

        let query = supabaseAdmin
          .from("product_templates")
          .select(productListSelect);
        for (const [column, value] of eqFilters)
          query = query.eq(column, value);

        const result = await query
          .order(sort.column, { ascending: sort.ascending })
          .order("id")
          .range(from, safeTo);

        if (result.error) {
          console.error("Products GET error:", result.error);
          return NextResponse.json(
            { message: "حدث خطأ أثناء جلب المنتجات." },
            { status: 500 },
          );
        }

        data = result.data ?? [];
      }
    }

    return NextResponse.json(
      {
        data,
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { posProductSearchSchema } from "@/app/dashboard/pos/schemas/pos.schemas";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import { dbErrorResponse } from "@/lib/api-response";


export async function GET(req: NextRequest) {
  const guard = await requirePermission("sales.pos");
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(req.url);

    // التحقق من المدخلات عبر Schema
    const parseResult = posProductSearchSchema.safeParse({
      search: searchParams.get("search") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const { search, categoryId, page, limit } = parseResult.data;
    const offset = (page - 1) * limit;

    // استعلام المنتجات بالربط بين product_variants و product_templates
    let query = supabaseAdmin
      .from("product_variants")
      .select(
        `
        id,
        sku,
        barcode,
        packBarcode,
        colorName,
        colorCode,
        size,
        purchasePrice,
        sellingPrice,
        minSellingPrice,
        stockQuantity,
        images,
        isDefault,
        template:product_templates!inner (
          id,
          name,
          description,
          categoryId,
          sellingUnit,
          images,
          isActive
        )
      `,
        { count: "exact" },
      )
      .eq("isActive", true)
      .eq("template.isActive", true);

    // 1. تصفية القسم
    if (categoryId) {
      query = query.eq("template.categoryId", categoryId);
    }

    // 2. البحث النصي الموحد (Barcode / PackBarcode / SKU / Name)
    // النص بيدخل فلتر .or() كنص → لازم يتنظف (فاصلة أو قوس في البحث كانت بتوقع الاستعلام)
    const term = sanitizeSearchTerm(search);
    if (term) {
      query = query.or(
        `barcode.eq.${term},packBarcode.eq.${term},sku.eq.${term},template.name.ilike.%${term}%`,
      );
    }

    // الترقيم والترتيب
    query = query
      .range(offset, offset + limit - 1)
      .order("createdAt", { ascending: false });

    const { data, count, error } = await query;

    // صفحة بعد آخر النتائج (البحث اتغير أو منتجات اتعطلت) → قائمة فاضية مش خطأ
    if (error?.code === "PGRST103") {
      return NextResponse.json({
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      });
    }

    if (error) {
      return dbErrorResponse(error, "GET /api/sales/products", "تعذر تحميل المنتجات.");
    }

    return NextResponse.json({
      data,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: unknown) {
    return dbErrorResponse(err, "GET /api/sales/products", "تعذر تحميل المنتجات.");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { posProductSearchSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
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
    let query = supabase
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
    if (search) {
      const term = search.trim();
      query = query.or(
        `barcode.eq.${term},packBarcode.eq.${term},sku.eq.${term},template.name.ilike.%${term}%`,
      );
    }

    // الترقيم والترتيب
    query = query
      .range(offset, offset + limit - 1)
      .order("createdAt", { ascending: false });

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    const message = err;
    return NextResponse.json(
      { error: message || "خطأ غير متوقع" },
      { status: 500 },
    );
  }
}

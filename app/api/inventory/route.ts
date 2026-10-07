import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط",
        },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(Number(searchParams.get("page")) || 1, 1);

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit")) || 50, 1),
      MAX_LIMIT,
    );

    const search = searchParams.get("search")?.trim() || "";

    const status = searchParams.get("status") || "ALL";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("product_variants")
      .select(
        `
          id,
          "templateId",
          sku,
          barcode,
          "packBarcode",
          "colorName",
          "colorCode",
          size,
          "purchasePrice",
          "sellingPrice",
          "minSellingPrice",
          "stockQuantity",
          "minStockLevel",
          "isActive",
          product_templates (
            id,
            name,
            "purchaseUnit",
            "sellingUnit",
            "conversionFactor",
            "isActive"
          )
        `,
        {
          count: "exact",
        },
      )
      .eq("isActive", true);

    if (status === "OUT_OF_STOCK") {
      query = query.lte("stockQuantity", 0);
    }

    if (status === "LOW_STOCK") {
      query = query
        .gt("stockQuantity", 0)
        .filter("stockQuantity", "lte", "minStockLevel");
    }

    if (status === "IN_STOCK") {
      query = query.gt("stockQuantity", 0);
    }

    if (search) {
      query = query.or(
        [
          `sku.ilike.%${search}%`,
          `barcode.ilike.%${search}%`,
          `packBarcode.ilike.%${search}%`,
        ].join(","),
      );
    }

    const { data, count, error } = await query
      .order("stockQuantity", {
        ascending: true,
      })
      .order("id", {
        ascending: true,
      })
      .range(from, to);

    if (error) {
      console.error("Inventory GET:", error);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب المخزون",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: data ?? [],

      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("Inventory GET unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

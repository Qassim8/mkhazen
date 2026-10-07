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
      Math.max(Number(searchParams.get("limit")) || 20, 1),
      MAX_LIMIT,
    );

    const type = searchParams.get("type") || "ALL";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("inventory_movements").select(
      `
          id,
          movement_type,
          quantity,
          unit_cost,
          reference,
          notes,
          created_at,
          template_id,
          variant_id,
          purchase_order_id,
          created_by,

          product_variants (
            id,
            sku,
            barcode,
            "colorName",
            size,

            product_templates (
              id,
              name,
              "sellingUnit",
              "purchaseUnit"
            )
          ),

          purchase_orders (
            id,
            order_number
          ),

          users:created_by (
            id,
            name
          )
        `,
      {
        count: "exact",
      },
    );

    if (type && type !== "ALL") {
      query = query.eq("movement_type", type);
    }

    const { data, count, error } = await query
      .order("created_at", {
        ascending: false,
      })
      .range(from, to);

    if (error) {
      console.error("Inventory movements GET:", error);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب حركات المخزون",
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
    console.error("Inventory movements unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

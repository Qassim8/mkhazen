import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { supabaseAdmin } from "@/lib/supabase";
import { fetchAllResult } from "@/lib/supabase-fetch-all";
import { can } from "@/lib/permissions";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: Props) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "catalog.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const { id: variantId } = await params;

    if (!variantId) {
      return NextResponse.json(
        {
          message: "معرف المتغير مطلوب",
        },
        { status: 400 },
      );
    }

    /* =====================================================
       VARIANT
    ===================================================== */

    const { data: variant, error: variantError } = await supabaseAdmin
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
          length,
          width,
          "stockQuantity",
          "minStockLevel",
          "purchasePrice",
          "sellingPrice",
          "minSellingPrice",
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
      )
      .eq("id", variantId)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        {
          message: "المتغير غير موجود",
        },
        { status: 404 },
      );
    }

    /* =====================================================
       MOVEMENTS
    ===================================================== */

    // السجل كامل على دفعات (مش آخر 100 حركة بس)
    const { data: movements, error: movementsError } = await fetchAllResult((from, to) =>
      supabaseAdmin
      .from("inventory_movements")
      .select(
        `
          id,
          movement_type,
          quantity,
          unit_cost,
          reference,
          notes,
          created_at,
          purchase_order_id,
          purchase_orders (
            order_number
          )
        `,
      )
      .eq("variant_id", variantId)
      .order("created_at", {
        ascending: false,
      })
      .order("id")
      .range(from, to),
    );

    if (movementsError) {
      console.error("Inventory movements GET:", movementsError);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب حركات المخزون",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      variant,
      movements: movements ?? [],
    });
  } catch (error: unknown) {
    console.error("Inventory detail GET unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

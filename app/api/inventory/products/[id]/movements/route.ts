import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json(
        { message: "غير مصرح بالدخول" },
        { status: 401 },
      );
    }

    const { id: variantId } = await params;

    // 1. جلب بيانات المنتج الحالية
    const { data: variant, error: productError } = await supabaseAdmin
      .from("product_variants")
      .select(
        `
        id,
        "templateId",
        sku,
        barcode,
        "colorName",
        "colorCode",
        size,
        length,
        width,
        "stockQuantity",
        "minStockLevel",
        "purchasePrice",
        "sellingPrice",
        product_templates (
          id,
          name,
          "conversionFactor"
        )
      `,
      )
      .eq("id", variantId)
      .single();

    if (productError || !variant) {
      return NextResponse.json(
        { message: "المنتج غير موجود" },
        { status: 404 },
      );
    }

    // 2. جلب سجل حركات هذا المنتج مرتبة من الأحدث للأقدم
    const { data: movements, error: movementsError } = await supabaseAdmin
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
      .eq("template_id", variantId)
      .order("created_at", { ascending: false });

    if (movementsError) {
      return NextResponse.json(
        { message: movementsError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      variant,
      movements: movements || [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

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

    const { id: productId } = await params;

    // 1. جلب بيانات المنتج الحالية
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, barcode, stockQuantity, minStockLevel, conversionFactor",
      )
      .eq("id", productId)
      .single();

    if (productError || !product) {
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
        purchase_orders (order_number)
      `,
      )
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (movementsError) {
      return NextResponse.json(
        { message: movementsError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      product,
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const orderId = params.id;

    const { data: order, error } = await supabase
      .from("sales_orders")
      .select(
        `
        id,
        order_number,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        payment_method,
        payment_status,
        status,
        notes,
        created_at,
        branch:branches (
          id,
          name
        ),
        cashier:users!sales_orders_cashier_id_fkey (
          id,
          name,
          email
        ),
        items:sales_order_items (
          id,
          quantity,
          unit_price,
          total_price,
          variant:product_variants (
            sku,
            barcode,
            colorName,
            size,
            template:product_templates (
              name
            )
          )
        )
      `,
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: "الفاتورة غير موجودة" },
        { status: 404 },
      );
    }

    // تنسيق الفاتورة للعرض المباشر
    const formattedReceipt = {
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      branchName: (order.branch as any)?.name || "الفرع الرئيسي",
      cashierName: (order.cashier as any)?.name || "الكاشير",
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount),
      taxAmount: Number(order.tax_amount),
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method,
      items: order.items.map((item: any) => ({
        productName: item.variant?.template?.name || "",
        sku: item.variant?.sku,
        colorName: item.variant?.colorName,
        size: item.variant?.size,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
      })),
    };

    return NextResponse.json({ receipt: formattedReceipt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

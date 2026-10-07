import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;

  try {
    const { id: orderId } = await params;

    const { data: order, error } = await supabase
      .from("sales_orders")
      .select(
        `
        id,
        order_number,
        order_type,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        payment_method,
        payment_status,
        status,
        notes,
        created_at,
        completed_at,
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
          unit_cost,
          total_price,
          is_gift,
          gift_note,
          variant:product_variants (
            sku,
            barcode,
            colorName,
            size,
            template:product_templates (
              name
            )
          )
        ),
        payments:sales_order_payments (
          id,
          amount,
          payment_date,
          payment_method,
          reference,
          notes,
          created_by,
          created_at
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

    if (order.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "الفاتورة غير مكتملة" },
        { status: 404 },
      );
    }

    const paidAmount = Number(
      (order.total_amount ?? 0),
    );

    const formattedReceipt = {
      id: order.id,
      orderNumber: order.order_number,
      orderType: order.order_type,
      createdAt: order.created_at,
      completedAt: order.completed_at ?? null,
      branchName: (order.branch as any)?.name || "الفرع الرئيسي",
      cashierName: (order.cashier as any)?.name || "الكاشير",
      customerName: null,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount),
      discountPercentage:
        Number(order.subtotal) > 0
          ? Number(
              ((Number(order.discount_amount) / Number(order.subtotal)) * 100).toFixed(2),
            )
          : 0,
      taxAmount: Number(order.tax_amount),
      totalAmount: Number(order.total_amount),
      paidAmount,
      remainingAmount: 0,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      status: order.status,
      notes: order.notes ?? null,
      items: (order.items ?? []).map((item: any) => ({
        productName: item.variant?.template?.name || "",
        sku: item.variant?.sku ?? null,
        colorName: item.variant?.colorName ?? null,
        size: item.variant?.size ?? null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
        isGift: Boolean(item.is_gift),
        giftNote: item.gift_note ?? null,
      })),
      payments: (order.payments ?? []).map((payment: any) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        reference: payment.reference ?? null,
        notes: payment.notes ?? null,
        createdBy: payment.created_by ?? null,
        createdAt: payment.created_at,
      })),
    };

    return NextResponse.json({ receipt: formattedReceipt });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "حدث خطأ أثناء قراءة الفاتورة" },
      { status: 500 },
    );
  }
}

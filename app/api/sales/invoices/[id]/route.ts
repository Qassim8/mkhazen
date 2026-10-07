import { errorMessage } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { one, type Relation, type SaleItemRow, type SalePaymentRow } from "../../_lib/sale-rows";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;

  const guard = await requirePermission("sales.pos");
  if (!guard.ok) return guard.response;

  try {
    const { id: orderId } = await params;

    const { data: order, error } = await supabaseAdmin
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
        cashier:users!cashier_id (
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
      branchName: one(order.branch as Relation<{ name?: string | null }>)?.name || "الفرع الرئيسي",
      cashierName: one(order.cashier as Relation<{ name?: string | null }>)?.name || "الكاشير",
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
      items: ((order.items ?? []) as unknown as SaleItemRow[]).map((item) => ({
        productName: one(one(item.variant)?.template)?.name || "",
        sku: one(item.variant)?.sku ?? null,
        colorName: one(item.variant)?.colorName ?? null,
        size: one(item.variant)?.size ?? null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
        isGift: Boolean(item.is_gift),
        giftNote: item.gift_note ?? null,
      })),
      payments: ((order.payments ?? []) as unknown as SalePaymentRow[]).map((payment) => ({
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: errorMessage(err, "حدث خطأ أثناء قراءة الفاتورة") },
      { status: 500 },
    );
  }
}

import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        {
          error: "معرف الفاتورة مطلوب",
        },
        { status: 400 },
      );
    }

    // ---------------------------------------------
    // Order
    // ---------------------------------------------

    const { data: order, error: orderError } = await supabaseAdmin
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

          customer_id,

          tailor_id,

          items:sales_order_items (
            id,
            template_id,
            variant_id,
            quantity,
            unit_price,
            unit_cost,
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

    if (orderError || !order) {
      return NextResponse.json(
        {
          error: "الفاتورة غير موجودة",
        },
        { status: 404 },
      );
    }

    // ---------------------------------------------
    // Payments
    // ---------------------------------------------

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("sales_order_payments")
      .select(
        `
          id,
          amount,
          payment_date,
          payment_method,
          reference,
          notes,
          created_at,

          createdBy:users!sales_order_payments_created_by_fkey (
            id,
            name
          )
          `,
      )
      .eq("sales_order_id", orderId)
      .order("payment_date", {
        ascending: true,
      });

    if (paymentsError) {
      return NextResponse.json(
        {
          error: `فشل قراءة دفعات الفاتورة: ${paymentsError.message}`,
        },
        { status: 500 },
      );
    }

    // ---------------------------------------------
    // Calculate payment summary
    // ---------------------------------------------

    const paidAmount = (payments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    const remainingAmount = Math.max(
      Number(order.total_amount) - paidAmount,
      0,
    );

    // ---------------------------------------------
    // Format receipt
    // ---------------------------------------------

    const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;

    const cashier = Array.isArray(order.cashier)
      ? order.cashier[0]
      : order.cashier;

    const formattedReceipt = {
      id: order.id,

      orderNumber: order.order_number,

      orderType: order.order_type,

      createdAt: order.created_at,

      completedAt: order.completed_at,

      branchName: branch?.name ?? "الفرع الرئيسي",

      cashierName: cashier?.name ?? "الكاشير",

      customerId: order.customer_id,

      tailorId: order.tailor_id,

      subtotal: Number(order.subtotal),

      discountAmount: Number(order.discount_amount),

      taxAmount: Number(order.tax_amount),

      totalAmount: Number(order.total_amount),

      paidAmount: Number(paidAmount.toFixed(2)),

      remainingAmount: Number(remainingAmount.toFixed(2)),

      paymentMethod: order.payment_method,

      paymentStatus: order.payment_status,

      status: order.status,

      notes: order.notes,

      items: (order.items ?? []).map((item: any) => {
        const variant = Array.isArray(item.variant)
          ? item.variant[0]
          : item.variant;

        const template = Array.isArray(variant?.template)
          ? variant.template[0]
          : variant?.template;

        return {
          id: item.id,

          productName: template?.name ?? "",

          sku: variant?.sku ?? null,

          barcode: variant?.barcode ?? null,

          colorName: variant?.colorName ?? null,

          size: variant?.size ?? null,

          quantity: Number(item.quantity),

          unitPrice: Number(item.unit_price),

          unitCost: Number(item.unit_cost),

          totalPrice: Number(item.total_price),
        };
      }),

      payments: (payments ?? []).map((payment: any) => {
        const createdBy = Array.isArray(payment.createdBy)
          ? payment.createdBy[0]
          : payment.createdBy;

        return {
          id: payment.id,

          amount: Number(payment.amount),

          paymentDate: payment.payment_date,

          paymentMethod: payment.payment_method,

          reference: payment.reference ?? null,

          notes: payment.notes ?? null,

          createdBy: createdBy?.name ?? null,

          createdAt: payment.created_at,
        };
      }),
    };

    return NextResponse.json({
      receipt: formattedReceipt,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "حدث خطأ أثناء قراءة الفاتورة";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import type { SaleItemRow, SalePaymentRow } from "../_lib/sale-rows";

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function getCalculatedPaymentStatus(
  totalAmount: number,
  paidAmount: number,
): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= 0) {
    return "UNPAID";
  }

  if (paidAmount >= totalAmount) {
    return "PAID";
  }

  return "PARTIAL";
}

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        {
          error: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام",
        },
        { status: 500 },
      );
    }

    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }

    const { id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json(
        { error: "معرف الفاتورة مطلوب" },
        { status: 400 },
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("sales_orders")
      .select(
        `
          id,
          order_number,
          branch_id,
          order_type,
          customer_id,
          tailor_id,
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
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json(
        {
          error: `فشل قراءة الفاتورة: ${orderError.message}`,
        },
        { status: 500 },
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "الفاتورة غير موجودة" },
        { status: 404 },
      );
    }

    if (order.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "لا يمكن إصدار إيصال نهائي لطلب غير مكتمل.",
        },
        { status: 400 },
      );
    }

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
          created_by,
          created_at,
          createdBy:users!created_by (
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

    const subtotal = Number(order.subtotal);
    const discountAmount = Number(order.discount_amount);
    const taxAmount = Number(order.tax_amount);
    const totalAmount = Number(order.total_amount);

    const paidAmount = Number(
      (payments ?? [])
        .reduce((sum, payment) => sum + Number(payment.amount), 0)
        .toFixed(2),
    );

    const remainingAmount = Number(
      Math.max(totalAmount - paidAmount, 0).toFixed(2),
    );

    const branch = getSingleRelation(order.branch);
    const cashier = getSingleRelation(order.cashier);

    const formattedReceipt = {
      id: order.id,
      orderNumber: order.order_number,
      orderType: order.order_type,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      branchName: branch?.name ?? "الفرع الرئيسي",
      cashierName: cashier?.name ?? null,
      customerName: null,
      subtotal,
      discountAmount,
      discountPercentage:
        subtotal > 0
          ? Number(((discountAmount / subtotal) * 100).toFixed(2))
          : 0,
      taxAmount,
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentMethod: order.payment_method,
      paymentStatus: getCalculatedPaymentStatus(totalAmount, paidAmount),
      status: order.status,
      notes: order.notes,
      items: ((order.items ?? []) as unknown as SaleItemRow[]).map((item) => {
        const variant = getSingleRelation(item.variant);
        const template = getSingleRelation(variant?.template);

        return {
          productName: template?.name ?? "منتج",
          sku: variant?.sku ?? null,
          colorName: variant?.colorName ?? null,
          size: variant?.size ?? null,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price),
        };
      }),
      payments: ((payments ?? []) as unknown as SalePaymentRow[]).map((payment) => {
        const createdBy = getSingleRelation(payment.createdBy);

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
    console.error("GET /api/sales/invoices/[id] error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء قراءة الفاتورة",
      },
      { status: 500 },
    );
  }
}

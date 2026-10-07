import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

function calculatePaymentStatus(
  totalAmount: number,
  paidAmount: number,
): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= totalAmount) return "PAID";
  return "PARTIAL";
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { error: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام" },
        { status: 500 },
      );
    }

    const session = await getSession();

    if (!session || String(session.role).toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "عذراً، صفحة المبيعات مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "معرف البيع مطلوب" }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("sales_orders")
      .select(
        `
          id,
          order_number,
          branch_id,
          cashier_id,
          order_type,
          customer_id,
          tailor_id,
          tailoring_purpose,
          tailoring_status,
          intake_date,
          expected_delivery_date,
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
          updated_at,
          items:sales_order_items (
            id,
            sales_order_id,
            template_id,
            variant_id,
            quantity,
            unit_price,
            total_price,
            created_at,
            variant:product_variants (
              id,
              sku,
              barcode,
              packBarcode,
              colorName,
              colorCode,
              size,
              template:product_templates (
                id,
                name
              )
            )
          )
        `,
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json(
        { error: `فشل جلب البيع: ${orderError.message}` },
        { status: 500 },
      );
    }

    if (!order) {
      return NextResponse.json({ error: "البيع غير موجود" }, { status: 404 });
    }

    if (
      order.status !== "COMPLETED" ||
      (order.order_type === "TAILORING" &&
        (order.tailoring_purpose !== "CUSTOMER" ||
          order.tailoring_status !== "RECEIVED"))
    ) {
      return NextResponse.json(
        { error: "هذا السجل ليس بيعًا مكتملًا صالحًا للعرض في المبيعات" },
        { status: 404 },
      );
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("sales_order_payments")
      .select(
        `
          id,
          sales_order_id,
          amount,
          payment_date,
          payment_method,
          reference,
          notes,
          created_by,
          created_at,
          createdBy:users!fk_sales_payment_user (
  id,
  name,
  email
)
        `,
      )
      .eq("sales_order_id", id)
      .order("payment_date", { ascending: true });

    if (paymentsError) {
      return NextResponse.json(
        { error: `فشل جلب دفعات البيع: ${paymentsError.message}` },
        { status: 500 },
      );
    }

    const [customerResult, tailorResult, cashierResult] = await Promise.all([
      order.customer_id
        ? supabaseAdmin
            .from("customers")
            .select("id, name, whatsapp_number")
            .eq("id", order.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.tailor_id
        ? supabaseAdmin
            .from("users")
            .select("id, name, email, phone")
            .eq("id", order.tailor_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.cashier_id
        ? supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", order.cashier_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const relationError =
      customerResult.error || tailorResult.error || cashierResult.error;

    if (relationError) {
      return NextResponse.json(
        { error: `فشل تحميل بيانات البيع المرتبطة: ${relationError.message}` },
        { status: 500 },
      );
    }

    const totalAmount = Number(order.total_amount);
    const subtotal = Number(order.subtotal);
    const discountAmount = Number(order.discount_amount);
    const taxAmount = Number(order.tax_amount);
    const paidAmount = Number(
      (payments ?? [])
        .reduce((sum, payment) => sum + Number(payment.amount), 0)
        .toFixed(2),
    );
    const remainingAmount = Number(
      Math.max(totalAmount - paidAmount, 0).toFixed(2),
    );

    const data = {
      id: order.id,
      orderNumber: order.order_number,
      branchId: order.branch_id,
      orderType: order.order_type,
      tailoringPurpose: order.tailoring_purpose,
      tailoringStatus: order.tailoring_status,
      customerId: order.customer_id,
      tailorId: order.tailor_id,
      cashierId: order.cashier_id,
      intakeDate: order.intake_date,
      expectedDeliveryDate: order.expected_delivery_date,
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
      paymentStatus: calculatePaymentStatus(totalAmount, paidAmount),
      status: order.status,
      notes: order.notes,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      updatedAt: order.updated_at,
      customer: customerResult.data
        ? {
            id: customerResult.data.id,
            name: customerResult.data.name,
            whatsappNumber: customerResult.data.whatsapp_number,
          }
        : null,
      tailor: tailorResult.data
        ? {
            id: tailorResult.data.id,
            name: tailorResult.data.name,
            phone: tailorResult.data.phone ?? null,
            email: tailorResult.data.email ?? null,
          }
        : null,
      cashier: cashierResult.data
        ? {
            id: cashierResult.data.id,
            name: cashierResult.data.name,
            email: cashierResult.data.email ?? null,
          }
        : null,
      items: (order.items ?? []).map((item: any) => {
        const variant = singleRelation(item.variant);
        const template = singleRelation(variant?.template);

        return {
          id: item.id,
          salesOrderId: item.sales_order_id,
          templateId: item.template_id,
          variantId: item.variant_id,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price),
          product: {
            id: template?.id ?? null,
            name: template?.name ?? "",
            sku: variant?.sku ?? null,
            barcode: variant?.barcode ?? null,
            packBarcode: variant?.packBarcode ?? null,
            colorName: variant?.colorName ?? null,
            colorCode: variant?.colorCode ?? null,
            size: variant?.size ?? null,
          },
        };
      }),
      payments: (payments ?? []).map((payment: any) => {
        const createdBy = singleRelation(payment.createdBy);

        return {
          id: payment.id,
          amount: Number(payment.amount),
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          reference: payment.reference ?? null,
          notes: payment.notes ?? null,
          createdBy: payment.created_by ?? null,
          createdByName: createdBy?.name ?? null,
          createdAt: payment.created_at,
        };
      }),
    };

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error("GET /api/sales/orders/[id] error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء جلب البيع",
      },
      { status: 500 },
    );
  }
}

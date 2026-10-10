import { supabaseAdmin } from "@/lib/supabase";

import {
  PaymentMethod,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import { MAIN_BRANCH_ID } from "@/lib/constants";

/* =========================================================
   STATUS FLOW
========================================================= */

export const allowedStatusTransitions: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  DRAFT: ["APPROVED", "CANCELLED"],

  APPROVED: ["RECEIVED"],

  RECEIVED: [],

  CANCELLED: ["DRAFT"],
};

/* =========================================================
   PERMISSIONS
========================================================= */

export function canEditPurchaseOrder(status: PurchaseOrderStatus) {
  return status === "DRAFT";
}

export function canDeletePurchaseOrder(status: PurchaseOrderStatus) {
  return status === "DRAFT";
}

export {
  getPurchasePaymentStatus,
  normalizeConversionFactor,
  calculatePurchaseTotal,
  allocateDeliveryCost,
} from "./purchase-costs";
import { getPurchasePaymentStatus } from "./purchase-costs";

/* =========================================================
   MAP ORDER
========================================================= */

type RawPurchaseOrder = Record<string, unknown>;

export function mapPurchaseOrder(rawOrder: RawPurchaseOrder): PurchaseOrder {
  const supplier = rawOrder.suppliers as {
    id?: string;
    name?: string;
  } | null;

  const rawItems = (rawOrder.purchase_order_items ??
    rawOrder.items ??
    []) as Record<string, unknown>[];

  const rawPayments = (rawOrder.purchase_order_payments ??
    rawOrder.payments ??
    []) as Record<string, unknown>[];

  const items: PurchaseOrderItem[] = rawItems.map((item) => {
    const template = item.product_templates as {
      id?: string;
      name?: string;
    } | null;

    const variant = item.product_variants as {
      id?: string;
      sku?: string;
      colorName?: string;
      size?: string;
    } | null;

    const quantity = Number(item.quantity ?? 0);

    const unitCost = Number(item.unit_cost ?? item.unitCost ?? 0);

    const allocatedDeliveryCost = Number(
      item.allocated_delivery_cost ?? item.allocatedDeliveryCost ?? 0,
    );

    const effectiveUnitCost = Number(
      item.effective_unit_cost ?? item.effectiveUnitCost ?? 0,
    );

    return {
      id: String(item.id),

      purchaseOrderId: String(rawOrder.id),

      templateId: String(item.template_id ?? item.templateId ?? ""),

      variantId: String(item.variant_id ?? item.variantId ?? ""),

      productName: template?.name ?? "منتج غير معروف",

      sku: variant?.sku ?? "",

      colorName: variant?.colorName ?? null,

      size: variant?.size ?? null,

      quantity,

      receivedQuantity: Number(
        item.received_quantity ?? item.receivedQuantity ?? 0,
      ),

      unitCost,

      allocatedDeliveryCost,

      effectiveUnitCost,

      subtotal: Number(item.subtotal ?? quantity * unitCost),

      createdAt: item.created_at ? String(item.created_at) : undefined,
    };
  });

  const payments: PurchaseOrderPayment[] = rawPayments.map((payment) => ({
    id: String(payment.id),

    purchaseOrderId: String(rawOrder.id),

    amount: Number(payment.amount ?? 0),

    paymentDate: String(payment.payment_date ?? payment.paymentDate ?? ""),

    paymentMethod: (payment.payment_method ??
      payment.paymentMethod ??
      null) as PaymentMethod | null,

    reference: (payment.reference ?? null) as string | null,

    notes: (payment.notes ?? null) as string | null,

    createdBy: (payment.created_by ?? null) as string | null,

    createdAt: String(payment.created_at ?? payment.createdAt ?? ""),
  }));

  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const totalAmount = Number(
    rawOrder.total_amount ?? rawOrder.totalAmount ?? 0,
  );

  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  return {
    id: String(rawOrder.id),

    orderNumber: String(rawOrder.order_number ?? rawOrder.orderNumber ?? ""),

    supplierId: (rawOrder.supplier_id ?? rawOrder.supplierId ?? null) as
      | string
      | null,

    supplierName: supplier?.name ?? "غير محدد",

    status: (rawOrder.status as PurchaseOrderStatus) ?? "DRAFT",

    purchaseType:
      (rawOrder.purchase_type as "DIRECT" | "WORKFLOW" | "OPENING") ?? "WORKFLOW",

    orderDate: String(rawOrder.order_date ?? rawOrder.orderDate ?? ""),

    expectedDate: (rawOrder.expected_date ?? rawOrder.expectedDate ?? null) as
      | string
      | null,

    subtotal: Number(rawOrder.subtotal ?? 0),

    deliveryCost: Number(rawOrder.delivery_cost ?? rawOrder.deliveryCost ?? 0),

    discountAmount: Number(
      rawOrder.discount_amount ?? rawOrder.discountAmount ?? 0,
    ),

    totalAmount,

    notes: (rawOrder.notes ?? null) as string | null,

    createdBy: (rawOrder.created_by ?? null) as string | null,

    receivedBy: (rawOrder.received_by ?? null) as string | null,

    journalEntryId: (rawOrder.journal_entry_id ?? null) as string | null,

    items,

    payments,

    paidAmount: Number(paidAmount.toFixed(2)),

    remainingAmount: Number(remainingAmount.toFixed(2)),

    paymentStatus: getPurchasePaymentStatus(totalAmount, paidAmount),

    createdAt: String(rawOrder.created_at ?? rawOrder.createdAt ?? ""),

    updatedAt: String(rawOrder.updated_at ?? rawOrder.updatedAt ?? ""),
  };
}

/* =========================================================
   SELECT
========================================================= */

export const PURCHASE_ORDER_SELECT = `
  *,
  suppliers (
    id,
    name
  ),
  purchase_order_items (
    id,
    purchase_order_id,
    template_id,
    variant_id,
    quantity,
    received_quantity,
    unit_cost,
    allocated_delivery_cost,
    effective_unit_cost,
    subtotal,
    created_at,
    product_templates (
      id,
      name
    ),
    product_variants (
      id,
      sku,
      colorName,
      size
    )
  ),
  purchase_order_payments (
    id,
    purchase_order_id,
    amount,
    payment_date,
    payment_method,
    reference,
    notes,
    created_by,
    created_at
  )
`;

/* =========================================================
   FETCH ONE ORDER
========================================================= */

export async function fetchPurchaseOrderById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return {
      data: null,
      error,
    };
  }

  return {
    data: mapPurchaseOrder(data as RawPurchaseOrder),
    error: null,
  };
}

/* =========================================================
   RECORD PURCHASE PAYMENT
   ذرّي في قاعدة البيانات (record_purchase_payment): قفل الطلب + فحص المتبقي
   + فحص رصيد الخزينة/البنك بالدولار + الدفعة + القيد في معاملة واحدة.
========================================================= */

export class PurchaseRpcError extends Error {
  readonly dbError: unknown;
  constructor(dbError: { message?: string } | null | undefined) {
    super(dbError?.message || "تعذر تنفيذ العملية");
    this.name = "PurchaseRpcError";
    this.dbError = dbError;
  }
}

export async function recordPurchasePayment(params: {
  purchaseOrderId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  createdBy: string;
}) {
  const paymentTimestamp = new Date(params.paymentDate);

  if (Number.isNaN(paymentTimestamp.getTime())) {
    throw new Error("تاريخ الدفعة غير صالح");
  }

  const { data, error } = await supabaseAdmin.rpc("record_purchase_payment", {
    p_order_id: params.purchaseOrderId,
    p_user_id: params.createdBy,
    p_branch_id: MAIN_BRANCH_ID,
    p_amount: Number(params.amount.toFixed(2)),
    p_payment_date: paymentTimestamp.toISOString(),
    p_payment_method: params.paymentMethod === "BANK" ? "BANK" : "CASH",
    p_reference: params.reference || null,
    p_notes: params.notes || null,
  });

  if (error) {
    throw new PurchaseRpcError(error);
  }

  return data as Record<string, unknown>;
}


/* =========================================================
   NOTIFICATION
========================================================= */

export async function notifyOwnerForDraft(
  orderNumber: string,
  orderId: string,
) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    title: "طلب شراء بانتظار الموافقة",

    message: `تم إنشاء مسودة طلب الشراء ${orderNumber}. يرجى مراجعتها واعتمادها.`,

    type: "PURCHASE_ORDER",

    link: `/dashboard/orders/${orderId}`,

    // طلبات الاعتماد للمالك فقط
    target_roles: ["owner"],

    metadata: {
      key: `PO_APPROVAL:${orderId}`,
      purchase_order_id: orderId,
    },
  });

  if (error) {
    console.error("Failed to notify owner:", error);
  }
}

/* =========================================================
   PROCESS RECEIPT
   ذرّي في قاعدة البيانات (receive_purchase_order): قفل الطلب، تحديث رصيد
   ومتوسط تكلفة كل صنف، حركات المخزون، بيانات الاستلام، قيد الشراء
   (مدين المخزون / دائن الموردين)، وتحويل الحالة لـ RECEIVED — كله أو ولا حاجة.

   purchase_order_items.quantity = وحدات شراء
   product_variants.stockQuantity = وحدات بيع (× conversionFactor)
   effective_unit_cost = تكلفة وحدة البيع شاملة التوصيل وناقص الخصم
========================================================= */

export async function processPurchaseReceipt(orderId: string, userId: string) {
  const { data, error } = await supabaseAdmin.rpc("receive_purchase_order", {
    p_order_id: orderId,
    p_user_id: userId,
    p_branch_id: MAIN_BRANCH_ID,
  });

  if (error) {
    throw new PurchaseRpcError(error);
  }

  return data as {
    order_id: string;
    order_number: string;
    status: "RECEIVED";
    items_count: number;
    journal_entry_id: string;
    total_amount: number | string;
  };
}


/* =========================================================
   إشعارات قرار المالك (للمدير) + قفل إشعار طلب الاعتماد
========================================================= */

export async function notifyPurchaseDecision(
  orderNumber: string,
  orderId: string,
  decision: "APPROVED" | "CANCELLED",
) {
  // إشعار "بانتظار الاعتماد" عند المالك اتحسم → يتقفل
  await supabaseAdmin
    .from("notifications")
    .update({ isRead: true })
    .eq("metadata->>key", `PO_APPROVAL:${orderId}`)
    .eq("isRead", false);

  const { error } = await supabaseAdmin.from("notifications").insert({
    title: decision === "APPROVED" ? "تم اعتماد طلب الشراء" : "تم رفض طلب الشراء",
    message:
      decision === "APPROVED"
        ? `اعتمد المالك طلب الشراء ${orderNumber}، ويمكن استلامه الآن.`
        : `رفض المالك طلب الشراء ${orderNumber} وتم إلغاؤه.`,
    type: "PURCHASE_ORDER",
    link: `/dashboard/orders/${orderId}`,
    // قرارات المالك للمدير فقط
    target_roles: ["admin"],
    metadata: { purchase_order_id: orderId, decision },
  });

  if (error) {
    console.error("Failed to notify purchase decision:", error);
  }
}

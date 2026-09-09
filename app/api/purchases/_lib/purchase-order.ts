import { supabaseAdmin } from "@/lib/supabase";

import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
  PaymentMethod,
} from "@/app/dashboard/orders/schemas/orders.schemas";

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

  CANCELLED: [],
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

/* =========================================================
   CALCULATE TOTAL
========================================================= */

export function calculatePurchaseTotal(
  items: {
    quantity: number;
    unitCost: number;
  }[],
  deliveryCost = 0,
  discountAmount = 0,
) {
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  const total =
    itemsSubtotal + Number(deliveryCost || 0) - Number(discountAmount || 0);

  return Number(Math.max(0, total).toFixed(2));
}

/* =========================================================
   ALLOCATE DELIVERY COST EQUALLY

   Example:
   Delivery = 90
   Items = 3

   Each item gets:
   allocatedDeliveryCost = 30

   If item quantity = 10:
   delivery/unit = 3

   effective unit cost:
   unitCost + 3
========================================================= */

export function allocateDeliveryCost(
  deliveryCost: number,
  items: {
    quantity: number;
    unitCost: number;
  }[],
) {
  if (deliveryCost <= 0 || items.length === 0) {
    return items.map((item) => ({
      ...item,
      allocatedDeliveryCost: 0,
      effectiveUnitCost: item.unitCost,
    }));
  }

  const deliveryPerItem = deliveryCost / items.length;

  return items.map((item) => {
    const deliveryPerUnit =
      item.quantity > 0 ? deliveryPerItem / item.quantity : 0;

    return {
      ...item,
      allocatedDeliveryCost: Number(deliveryPerItem.toFixed(2)),

      effectiveUnitCost: Number((item.unitCost + deliveryPerUnit).toFixed(2)),
    };
  });
}

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
      item.effective_unit_cost ??
        item.effectiveUnitCost ??
        (unitCost + allocatedDeliveryCost / Math.max(quantity, 1)).toFixed(2),
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
      (rawOrder.purchase_type as "DIRECT" | "WORKFLOW") ?? "WORKFLOW",

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

    link: "/dashboard/orders",

    metadata: {
      purchase_order_id: orderId,
    },
  });

  if (error) {
    console.error("Failed to notify owner:", error);
  }
}

/* =========================================================
   PROCESS RECEIPT
========================================================= */

export async function processPurchaseReceipt(orderId: string, userId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("purchase_orders")
    .select("status, purchase_type")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("طلب الشراء غير موجود");
  }

  if (order.status !== "APPROVED") {
    throw new Error("لا يمكن استلام هذا الطلب في حالته الحالية");
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", orderId);

  if (itemsError || !items || items.length === 0) {
    throw new Error("لم يتم العثور على بنود لطلب الشراء هذا");
  }

  /*
   * Prevent duplicate receipt.
   */
  const alreadyReceived = items.some(
    (item) => Number(item.received_quantity ?? 0) > 0,
  );

  if (alreadyReceived) {
    throw new Error("تم استلام بنود هذا الطلب مسبقًا");
  }

  for (const item of items) {
    const { data: variant, error: variantFetchError } = await supabaseAdmin
      .from("product_variants")
      .select('id, "stockQuantity"')
      .eq("id", item.variant_id)
      .single();

    if (variantFetchError || !variant) {
      throw new Error(`تعذر العثور على متغيّر المنتج (${item.variant_id})`);
    }

    const currentStock = Number(variant.stockQuantity ?? 0);

    const receivedQuantity = Number(item.quantity ?? 0);

    const newStock = currentStock + receivedQuantity;

    const { error: updateError } = await supabaseAdmin
      .from("product_variants")
      .update({
        stockQuantity: newStock,
      })
      .eq("id", item.variant_id);

    if (updateError) {
      throw new Error(`فشل تحديث المخزون: ${updateError.message}`);
    }

    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        template_id: item.template_id,

        variant_id: item.variant_id,

        purchase_order_id: orderId,

        movement_type: "PURCHASE",

        quantity: receivedQuantity,

        unit_cost: Number(item.effective_unit_cost ?? item.unit_cost ?? 0),

        reference: `PO-${orderId}`,

        created_by: userId,
      });

    if (movementError) {
      throw new Error(`فشل تسجيل حركة المخزون: ${movementError.message}`);
    }

    const { error: receivedUpdateError } = await supabaseAdmin
      .from("purchase_order_items")
      .update({
        received_quantity: receivedQuantity,
      })
      .eq("id", item.id);

    if (receivedUpdateError) {
      throw new Error(
        `فشل تحديث كمية الاستلام: ${receivedUpdateError.message}`,
      );
    }
  }
}

import { supabaseAdmin } from "@/lib/supabase";

import {
  PaymentMethod,
  PaymentStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import type { AccountingAccount } from "@/app/dashboard/accounting/schemas/accounting.schema";

import {
  createJournalEntry,
  getAccountBalance,
} from "@/app/api/accounting/_lib/accounting";

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

/* =========================================================
   PAYMENT STATUS
========================================================= */

export function getPurchasePaymentStatus(
  totalAmount: number,
  paidAmount: number,
): PaymentStatus {
  if (paidAmount <= 0) {
    return "UNPAID";
  }

  if (paidAmount >= totalAmount) {
    return "PAID";
  }

  return "PARTIAL";
}

/* =========================================================
   NORMALIZE CONVERSION FACTOR
========================================================= */

export function normalizeConversionFactor(value: unknown) {
  const factor = Number(value ?? 1);

  if (!Number.isFinite(factor) || factor <= 0) {
    return 1;
  }

  return factor;
}

/* =========================================================
   CALCULATE PURCHASE TOTAL
=========================================================

   quantity:
   purchase-unit quantity

   unitCost:
   purchase-unit cost

   Example:
   1 carton × 600 = 600

   Delivery and discount are order-level amounts.
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
   ALLOCATE PURCHASE COSTS
=========================================================

   IMPORTANT UNIT DESIGN:

   quantity:
   purchase units

   unitCost:
   price per purchase unit

   conversionFactor:
   how many selling units exist inside one purchase unit

   Example:

   1 carton
   carton = 10 pieces
   carton cost = 600

   => selling quantity = 10 pieces
   => base piece cost = 600 / 10 = 60

   Delivery:
   50 / 10 = 5 per piece

   Effective piece cost:
   60 + 5 = 65

   effectiveUnitCost is therefore ALWAYS:
   COST PER SELLING UNIT
========================================================= */

export function allocateDeliveryCost(
  deliveryCost: number,
  items: {
    quantity: number;
    unitCost: number;
    conversionFactor?: number;
  }[],
  discountAmount = 0,
) {
  if (items.length === 0) {
    return [];
  }

  const safeDelivery = Math.max(0, Number(deliveryCost || 0));

  const safeDiscount = Math.max(0, Number(discountAmount || 0));

  const totalPurchaseSubtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  const totalSellingQuantity = items.reduce((sum, item) => {
    const factor = normalizeConversionFactor(item.conversionFactor);

    return sum + item.quantity * factor;
  }, 0);

  const deliveryPerSellingUnit =
    totalSellingQuantity > 0 ? safeDelivery / totalSellingQuantity : 0;

  return items.map((item) => {
    const factor = normalizeConversionFactor(item.conversionFactor);

    const purchaseQuantity = Number(item.quantity || 0);

    const purchaseUnitCost = Number(item.unitCost || 0);

    const purchaseLineSubtotal = purchaseQuantity * purchaseUnitCost;

    const sellingQuantity = purchaseQuantity * factor;

    /* -------------------------------------------------------
       Base cost per selling unit

       Example:
       600 / 10 = 60
    ------------------------------------------------------- */

    const baseSellingUnitCost =
      factor > 0 ? purchaseUnitCost / factor : purchaseUnitCost;

    /* -------------------------------------------------------
       Shipping allocated to this line

       Example:
       10 pieces × 5 = 50
    ------------------------------------------------------- */

    const allocatedDeliveryCost = deliveryPerSellingUnit * sellingQuantity;

    /* -------------------------------------------------------
       Discount allocated proportionally by purchase value
    ------------------------------------------------------- */

    const discountShare =
      totalPurchaseSubtotal > 0
        ? (purchaseLineSubtotal / totalPurchaseSubtotal) * safeDiscount
        : 0;

    const discountPerSellingUnit =
      sellingQuantity > 0 ? discountShare / sellingQuantity : 0;

    /* -------------------------------------------------------
       Final cost per selling unit
    ------------------------------------------------------- */

    const effectiveUnitCost =
      baseSellingUnitCost + deliveryPerSellingUnit - discountPerSellingUnit;

    return {
      ...item,

      conversionFactor: factor,

      sellingQuantity: Number(sellingQuantity.toFixed(2)),

      allocatedDeliveryCost: Number(allocatedDeliveryCost.toFixed(2)),

      effectiveUnitCost: Number(Math.max(0, effectiveUnitCost).toFixed(2)),
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
========================================================= */

export async function recordPurchasePayment(params: {
  purchaseOrderId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  createdBy: string | null;
}) {
  const {
    purchaseOrderId,
    amount,
    paymentDate,
    paymentMethod,
    reference,
    notes,
    createdBy,
  } = params;

  const { data: order, error: orderError } =
    await fetchPurchaseOrderById(purchaseOrderId);

  if (orderError || !order) {
    throw new Error("طلب الشراء غير موجود");
  }

  if (order.status !== "APPROVED" && order.status !== "RECEIVED") {
    if (order.status === "DRAFT") {
      throw new Error("لا يمكن تسجيل دفعة قبل اعتماد طلب الشراء");
    }

    throw new Error("لا يمكن تسجيل دفعة على طلب شراء ملغي");
  }

  const normalizedAmount = Number(amount.toFixed(2));

  const paymentTimestamp = new Date(paymentDate);

  if (Number.isNaN(paymentTimestamp.getTime())) {
    throw new Error("تاريخ الدفعة غير صالح");
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("مبلغ الدفعة يجب أن يكون أكبر من صفر");
  }

  const paidAmount = order.paidAmount ?? 0;

  const remainingAmount = Math.max(0, order.totalAmount - paidAmount);

  if (normalizedAmount > remainingAmount) {
    throw new Error(
      `مبلغ الدفعة أكبر من المبلغ المتبقي (${remainingAmount.toFixed(2)} $)`,
    );
  }

  const account = paymentMethod === "BANK" ? "BANK" : "CASH";

  // المشتريات والموردين بالدولار دائمًا → نفحص رصيد الدولار فقط
  const availableBalance = await getAccountBalance(account, "USD");

  if (normalizedAmount > availableBalance) {
    const accountLabel = account === "BANK" ? "البنك" : "الخزينة";

    throw new Error(
      `الرصيد غير كافٍ في ${accountLabel} (دولار). الرصيد الحالي ${availableBalance.toFixed(
        2,
      )} $ — يمكنك تحويل جنيه إلى دولار من صفحة المحاسبة`,
    );
  }

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("purchase_order_payments")
    .insert({
      purchase_order_id: purchaseOrderId,

      amount: normalizedAmount,

      payment_date: paymentTimestamp.toISOString(),

      payment_method: paymentMethod,

      reference: reference || null,

      notes: notes || null,

      created_by: createdBy,
    })
    .select()
    .single();

  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? "تعذر تسجيل الدفعة");
  }

  try {
    await createJournalEntry({
      entryType: "PURCHASE_PAYMENT",

      amount: normalizedAmount,

      description: `دفعة للمورد عن طلب الشراء ${order.orderNumber}`,

      reference: reference || null,

      purchaseOrderId,

      debitAccount: "SUPPLIERS" as AccountingAccount,

      creditAccount: account,

      createdBy,
    });
  } catch (journalError) {
    await supabaseAdmin
      .from("purchase_order_payments")
      .delete()
      .eq("id", payment.id);

    throw journalError instanceof Error
      ? journalError
      : new Error("تعذر إنشاء القيد المحاسبي للدفعة");
  }

  return payment;
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
=========================================================

   IMPORTANT:

   purchase_order_items.quantity
   = PURCHASE UNIT quantity

   product_variants.stockQuantity
   = SELLING UNIT quantity

   Example:
   quantity = 1 carton
   conversionFactor = 10

   received stock = 10 pieces

   effective_unit_cost
   = cost per piece

========================================================= */

export async function processPurchaseReceipt(orderId: string, userId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("purchase_orders")
    .select(
      `
        id,
        order_number,
        status,
        purchase_type,
        subtotal,
        delivery_cost,
        discount_amount,
        total_amount,
        journal_entry_id
      `,
    )
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
    .select(
      `
        *,
        product_templates (
          id,
          purchaseUnit,
          sellingUnit,
          conversionFactor
        )
      `,
    )
    .eq("purchase_order_id", orderId);

  if (itemsError || !items || items.length === 0) {
    throw new Error("لم يتم العثور على بنود لطلب الشراء هذا");
  }

  const alreadyReceived = items.some(
    (item) => Number(item.received_quantity ?? 0) > 0,
  );

  if (alreadyReceived) {
    throw new Error("تم استلام بنود هذا الطلب مسبقًا");
  }

  const { count: existingMovementCount, error: movementCheckError } =
    await supabaseAdmin
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", orderId)
      .eq("movement_type", "PURCHASE");

  if (movementCheckError) {
    throw new Error(
      `تعذر التحقق من حركات استلام الطلب: ${movementCheckError.message}`,
    );
  }

  if ((existingMovementCount ?? 0) > 0) {
    throw new Error("تم تسجيل حركة استلام لهذا الطلب مسبقًا");
  }

  /* =======================================================
     ALLOCATE COSTS AGAIN AT RECEIPT TIME
  ======================================================= */

  const allocationItems = items.map((item) => {
    const template = Array.isArray(item.product_templates)
      ? item.product_templates[0]
      : item.product_templates;

    return {
      id: item.id,

      quantity: Number(item.quantity ?? 0),

      unitCost: Number(item.unit_cost ?? 0),

      conversionFactor: normalizeConversionFactor(template?.conversionFactor),
    };
  });

  const allocated = allocateDeliveryCost(
    Number(order.delivery_cost ?? 0),
    allocationItems,
    Number(order.discount_amount ?? 0),
  );

  /* =======================================================
     UPDATE STOCK + MOVEMENTS
  ======================================================= */

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    const costData = allocated[index];

    if (!costData) {
      throw new Error("تعذر حساب تكلفة أحد بنود الاستلام");
    }

    const { data: variant, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select('id, "stockQuantity", "averageCost", "purchasePrice"')
      .eq("id", item.variant_id)
      .single();

    if (variantError || !variant) {
      throw new Error(`تعذر العثور على متغيّر المنتج (${item.variant_id})`);
    }

    const currentStock = Number(variant.stockQuantity ?? 0);

    const receivedPurchaseQuantity = Number(item.quantity ?? 0);

    const conversionFactor = normalizeConversionFactor(
      costData.conversionFactor,
    );

    const receivedSellingQuantity = Number(
      (receivedPurchaseQuantity * conversionFactor).toFixed(2),
    );

    if (receivedSellingQuantity <= 0) {
      throw new Error("الكمية المحولة إلى وحدة البيع غير صالحة");
    }

    const effectiveUnitCost = Number(costData.effectiveUnitCost ?? 0);

    /*
     * averageCost is per SELLING UNIT.
     */

    const currentAverageCost =
      currentStock > 0
        ? Number(
            variant.averageCost ??
              Number(variant.purchasePrice ?? 0) / conversionFactor,
          )
        : 0;

    const newStock = currentStock + receivedSellingQuantity;

    const newAverageCost =
      newStock > 0
        ? Number(
            (
              (currentStock * currentAverageCost +
                receivedSellingQuantity * effectiveUnitCost) /
              newStock
            ).toFixed(2),
          )
        : effectiveUnitCost;

    /*
     * purchasePrice stays in PURCHASE UNIT.
     *
     * Example:
     * carton = 600
     *
     * purchasePrice remains 600
     * averageCost becomes 65
     */

    const latestPurchasePrice = Number(
      item.unit_cost ?? variant.purchasePrice ?? 0,
    );

    const { data: updatedVariant, error: updateError } = await supabaseAdmin
      .from("product_variants")
      .update({
        stockQuantity: newStock,

        averageCost: newAverageCost,

        purchasePrice: latestPurchasePrice,

        updatedAt: new Date().toISOString(),
      })
      .eq("id", item.variant_id)
      .eq("stockQuantity", currentStock)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedVariant) {
      throw new Error(
        updateError?.message ??
          "تعذر تحديث المخزون لأن الرصيد تغير بواسطة عملية أخرى",
      );
    }

    /* =====================================================
       INVENTORY MOVEMENT

       quantity = SELLING UNITS
       unit_cost = COST PER SELLING UNIT
    ===================================================== */

    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        template_id: item.template_id,

        variant_id: item.variant_id,

        purchase_order_id: orderId,

        movement_type: "PURCHASE",

        quantity: receivedSellingQuantity,

        unit_cost: effectiveUnitCost,

        reference: `PO-${order.order_number}`,

        created_by: userId,
      });

    if (movementError) {
      throw new Error(`فشل تسجيل حركة المخزون: ${movementError.message}`);
    }

    /* =====================================================
       UPDATE PURCHASE ITEM

       received_quantity remains in PURCHASE UNIT.

       effective_unit_cost becomes SELLING-UNIT cost.
    ===================================================== */

    const { error: receivedError } = await supabaseAdmin
      .from("purchase_order_items")
      .update({
        received_quantity: receivedPurchaseQuantity,

        allocated_delivery_cost: costData.allocatedDeliveryCost,

        effective_unit_cost: effectiveUnitCost,
      })
      .eq("id", item.id);

    if (receivedError) {
      throw new Error(`فشل تحديث بيانات الاستلام: ${receivedError.message}`);
    }
  }

  /* =======================================================
     PURCHASE JOURNAL

     DR INVENTORY
     CR SUPPLIERS

     The journal amount remains
     the ACTUAL supplier transaction total.

     Example:
     600 + 50 = 650

     It must NOT become 65.
  ======================================================= */

  const totalAmount = Number(order.total_amount ?? 0);

  if (totalAmount <= 0) {
    throw new Error("لا يمكن إنشاء قيد شراء بمبلغ صفر");
  }

  let journalEntryId = order.journal_entry_id ?? null;

  if (!journalEntryId) {
    const { data: existingJournal, error: existingJournalError } =
      await supabaseAdmin
        .from("journal_entries")
        .select("id")
        .eq("purchase_order_id", orderId)
        .eq("entry_type", "PURCHASE")
        .eq("branch_id", MAIN_BRANCH_ID)
        .maybeSingle();

    if (existingJournalError) {
      throw new Error(
        `تعذر التحقق من القيد المحاسبي: ${existingJournalError.message}`,
      );
    }

    if (existingJournal) {
      journalEntryId = existingJournal.id;
    }
  }

  if (!journalEntryId) {
    const journalEntry = await createJournalEntry({
      entryType: "PURCHASE",

      amount: Number(totalAmount.toFixed(2)),

      description: `شراء ${order.order_number}`,

      reference: `PO-${order.order_number}`,

      purchaseOrderId: orderId,

      debitAccount: "INVENTORY",

      creditAccount: "SUPPLIERS" as AccountingAccount,

      createdBy: userId,
    });

    journalEntryId = journalEntry.id;
  }

  const { error: linkError } = await supabaseAdmin
    .from("purchase_orders")
    .update({
      journal_entry_id: journalEntryId,
    })
    .eq("id", orderId);

  if (linkError) {
    throw new Error(`تعذر ربط قيد الشراء بطلب الشراء: ${linkError.message}`);
  }
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

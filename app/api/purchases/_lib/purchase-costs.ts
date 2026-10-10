/**
 * دوال حساب تكلفة المشتريات (نقية — من غير قاعدة بيانات) عشان تتختبر لوحدها.
 * نفس المنطق متنفذ في دالة قاعدة البيانات receive_purchase_order
 * (database/migrations/20261009_01_atomic_purchases_and_idempotency.sql)
 * والاختبار database/tests/purchases.db.test.ts بيتأكد إن الاتنين متطابقين.
 */

import type { PaymentStatus } from "@/app/dashboard/orders/schemas/orders.schemas";

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


import { supabaseAdmin } from "@/lib/supabase";
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from "@/app/dashboard/orders/schemas/orders.schemas";

export const allowedStatusTransitions: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

export function canEditPurchaseOrder(status: string) {
  return status === "DRAFT";
}

export function canDeletePurchaseOrder(status: string) {
  return status === "DRAFT";
}

export function calculatePurchaseTotal(
  items: { quantity: number; unitCost: number }[],
  deliveryCost = 0,
  discountAmount = 0,
) {
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );
  const total =
    itemsSubtotal + Number(deliveryCost || 0) - Number(discountAmount || 0);
  return Number(total.toFixed(2));
}

type RawPurchaseOrder = Record<string, unknown>;

export function mapPurchaseOrder(rawOrder: RawPurchaseOrder): PurchaseOrder {
  const supplier = rawOrder.suppliers as { name?: string } | null;
  const rawItems = (rawOrder.purchase_order_items ||
    rawOrder.items ||
    []) as Record<string, unknown>[];

  const items: PurchaseOrderItem[] = rawItems.map((item) => {
    const template = item.product_templates as { name?: string } | null;
    const variant = item.product_variants as {
      sku?: string;
      colorName?: string;
      size?: string;
    } | null;

    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost ?? item.unitCost ?? 0);
    const allocatedDeliveryCost = Number(item.allocated_delivery_cost ?? 0);
    const effectiveUnitCost = Number(
      item.effective_unit_cost ?? unitCost + allocatedDeliveryCost,
    );

    return {
      id: String(item.id),
      purchaseOrderId: String(rawOrder.id),
      templateId: String(item.template_id ?? item.templateId ?? ""),
      variantId: String(item.variant_id ?? item.variantId ?? ""),
      productName: template?.name || "منتج غير معروف",
      sku: variant?.sku || "",
      colorName: variant?.colorName || null,
      size: variant?.size || null,
      quantity,
      unitCost,
      allocatedDeliveryCost,
      effectiveUnitCost,
      subtotal: Number(item.subtotal ?? quantity * unitCost),
      receivedQuantity: Number(
        item.received_quantity ?? item.receivedQuantity ?? 0,
      ),
    };
  });

  return {
    id: String(rawOrder.id),
    orderNumber: String(rawOrder.order_number ?? rawOrder.orderNumber ?? ""),
    supplierId: (rawOrder.supplier_id ?? rawOrder.supplierId ?? null) as
      | string
      | null,
    supplierName: supplier?.name || "غير محدد",
    status: (rawOrder.status as PurchaseOrderStatus) || "DRAFT",
    purchaseType:
      (rawOrder.purchase_type as "DIRECT" | "WORKFLOW") || "WORKFLOW",
    orderDate: String(rawOrder.order_date ?? rawOrder.orderDate ?? ""),
    expectedDate: (rawOrder.expected_date ?? rawOrder.expectedDate ?? null) as
      | string
      | null,
    subtotal: Number(rawOrder.subtotal ?? 0),
    deliveryCost: Number(rawOrder.delivery_cost ?? rawOrder.deliveryCost ?? 0),
    discountAmount: Number(
      rawOrder.discount_amount ?? rawOrder.discountAmount ?? 0,
    ),
    totalAmount: Number(rawOrder.total_amount ?? rawOrder.totalAmount ?? 0),
    notes: (rawOrder.notes ?? null) as string | null,
    createdBy: (rawOrder.created_by ?? null) as string | null,
    receivedBy: (rawOrder.received_by ?? null) as string | null,
    journalEntryId: (rawOrder.journal_entry_id ?? null) as string | null,
    items,
    createdAt: String(rawOrder.created_at ?? rawOrder.createdAt ?? ""),
    updatedAt: String(rawOrder.updated_at ?? rawOrder.updatedAt ?? ""),
  };
}

export const PURCHASE_ORDER_SELECT = `
  *,
  suppliers (id, name),
  purchase_order_items (
    id,
    template_id,
    variant_id,
    quantity,
    received_quantity,
    unit_cost,
    allocated_delivery_cost,
    effective_unit_cost,
    subtotal,
    product_templates (id, name),
    product_variants (id, sku, colorName, size)
  )
`;

export async function fetchPurchaseOrderById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  return { data: mapPurchaseOrder(data as RawPurchaseOrder), error: null };
}

export async function notifyOwnerForDraft(
  orderNumber: string,
  orderId: string,
) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    title: "طلب شراء بانتظار الموافقة",
    message: `تم إنشاء مسودة طلب الشراء ${orderNumber}. يرجى مراجعتها واعتمادها.`,
    type: "PURCHASE_ORDER",
    link: "/dashboard/orders",
    metadata: { purchase_order_id: orderId },
  });

  if (error) {
    console.error("Failed to notify owner about purchase draft:", error);
  }
}

export async function processPurchaseReceipt(orderId: string, userId: string) {
  // 1. جلب بنود طلب الشراء
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", orderId);

  if (itemsError || !items || items.length === 0) {
    throw new Error("لم يتم العثور على بنود لطلب الشراء هذا");
  }

  // 2. تحديث المخزون وإنشاء حركة لكل بند
  for (const item of items) {
    // جلب المخزون الحالي
    const { data: variant, error: variantFetchError } = await supabaseAdmin
      .from("product_variants")
      .select('id, "stockQuantity"')
      .eq("id", item.variant_id)
      .single();

    if (variantFetchError || !variant) {
      throw new Error(
        `تعذر العثور على متغيّر المنتج المرفق للطلب (${item.variant_id})`,
      );
    }

    const currentStock = Number(variant.stockQuantity || 0);
    const newStock = currentStock + Number(item.quantity);

    // تحديث المخزون
    const { error: updateError } = await supabaseAdmin
      .from("product_variants")
      .update({
        stockQuantity: newStock,
      })
      .eq("id", item.variant_id);

    if (updateError) {
      throw new Error(`فشل تحديث المخزون للمتغير: ${updateError.message}`);
    }

    // تسجيل حركة المخزون
    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        template_id: item.template_id,
        variant_id: item.variant_id,
        purchase_order_id: orderId,
        movement_type: "PURCHASE",
        quantity: item.quantity,
        unit_cost: item.effective_unit_cost ?? item.unit_cost ?? 0,
        reference: `PO-${orderId}`,
        created_by: userId,
      });

    if (movementError) {
      throw new Error(`فشل تسجيل حركة المخزون: ${movementError.message}`);
    }
  }
}

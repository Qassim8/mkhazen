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
  DIRECT: [],
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
) {
  const itemsTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );
  return Number((itemsTotal + Number(deliveryCost || 0)).toFixed(2));
}

type RawPurchaseOrder = Record<string, unknown>;

export function mapPurchaseOrder(rawOrder: RawPurchaseOrder): PurchaseOrder {
  const supplier = rawOrder.suppliers as { name?: string } | null;
  const rawItems = (rawOrder.purchase_order_items ||
    rawOrder.items ||
    []) as Record<string, unknown>[];

  const items: PurchaseOrderItem[] = rawItems.map((item) => {
    const product = item.products as {
      name?: string;
      barcode?: string;
    } | null;
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost ?? item.unitCost ?? 0);
    return {
      id: String(item.id),
      purchaseOrderId: String(rawOrder.id),
      productId: String(item.product_id ?? item.productId ?? ""),
      productName: product?.name,
      productBarcode: product?.barcode,
      quantity,
      unitCost,
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
    orderDate: String(rawOrder.order_date ?? rawOrder.orderDate ?? ""),
    expectedDate: (rawOrder.expected_date ?? rawOrder.expectedDate ?? null) as
      | string
      | null,
    deliveryCost: Number(rawOrder.delivery_cost ?? rawOrder.deliveryCost ?? 0),
    totalAmount: Number(rawOrder.total_amount ?? rawOrder.totalAmount ?? 0),
    notes: (rawOrder.notes ?? null) as string | null,
    items,
    createdAt: String(rawOrder.created_at ?? rawOrder.createdAt ?? ""),
    updatedAt: String(rawOrder.updated_at ?? rawOrder.updatedAt ?? ""),
  };
}

const PURCHASE_ORDER_SELECT = `
  *,
  suppliers (id, name),
  purchase_order_items (
    id,
    product_id,
    quantity,
    unit_cost,
    subtotal,
    received_quantity,
    products (id, name, barcode)
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

// async function processReceiptInApp(poId: string) {
//   const { data: order, error: orderError } = await supabaseAdmin
//     .from("purchase_orders")
//     .select("id, order_number, delivery_cost, total_amount, supplier_id, status")
//     .eq("id", poId)
//     .single();

//   if (orderError || !order) {
//     throw new Error("طلب الشراء غير موجود");
//   }

//   const { data: existingMovement, error: movementLookupError } = await supabaseAdmin
//     .from("inventory_movements")
//     .select("id")
//     .eq("purchase_order_id", poId)
//     .eq("movement_type", "STOCK_IN")
//     .limit(1)
//     .maybeSingle();

//   if (!movementLookupError && existingMovement) {
//     const { data: existingJournal } = await supabaseAdmin
//       .from("journal_entries")
//       .select("id")
//       .eq("purchase_order_id", poId)
//       .limit(1)
//       .maybeSingle();

//     if (existingJournal) {
//       return;
//     }
//   } else {
//   const { data: items, error: itemsError } = await supabaseAdmin
//     .from("purchase_order_items")
//     .select("id, product_id, quantity, unit_cost, received_quantity")
//     .eq("purchase_order_id", poId);

//   if (itemsError || !items?.length) {
//     throw new Error("لا توجد بنود لاستلامها في طلب الشراء");
//   }

//   for (const item of items) {
//     const pendingQty = Number(item.quantity) - Number(item.received_quantity || 0);
//     if (pendingQty <= 0) {
//       continue;
//     }
//     const { data: product, error: productError } = await supabaseAdmin
//       .from("products")
//       .select("id, stockQuantity, conversionFactor")
//       .eq("id", item.product_id)
//       .single();

//     if (productError || !product) {
//       throw new Error("تعذر تحديث مخزون أحد المنتجات");
//     }

//     const conversion = Number(product.conversionFactor) || 1;
//     const stockAdd = Math.ceil(pendingQty * conversion);

//     const { error: stockError } = await supabaseAdmin
//       .from("products")
//       .update({
//         stockQuantity: Number(product.stockQuantity || 0) + stockAdd,
//       })
//       .eq("id", item.product_id);

//     if (stockError) {
//       throw new Error(stockError.message);
//     }

//     await supabaseAdmin
//       .from("purchase_order_items")
//       .update({ received_quantity: item.quantity })
//       .eq("id", item.id);

//     const { error: movementError } = await supabaseAdmin
//       .from("inventory_movements")
//       .insert({
//       product_id: item.product_id,
//       purchase_order_id: poId,
//       movement_type: "STOCK_IN",
//       quantity: stockAdd,
//       unit_cost: item.unit_cost,
//       reference: order.order_number,
//       notes: "استلام مشتريات",
//     });

//     if (movementError) {
//       throw new Error(movementError.message);
//     }
//   }
//   }

//   const { error: journalError } = await supabaseAdmin
//     .from("journal_entries")
//     .insert({
//       description:
//         order.status === "DIRECT"
//           ? `قيد شراء مباشر ${order.order_number}`
//           : `قيد استلام طلب شراء ${order.order_number}`,
//       reference: order.order_number,
//       debit_account: "المخزون / البضاعة",
//       credit_account: order.supplier_id
//         ? "الموردون (ذمم دائنة)"
//         : "الخزينة النقدية",
//       amount: Number(order.total_amount || 0),
//       purchase_order_id: poId,
//     });

//   if (journalError) {
//     throw new Error(journalError.message);
//   }
// }

async function processReceiptInApp(poId: string) {
  // 1. جلب بيانات الطلب (للحصول على رقم الطلب للـ reference)
  const { data: order, error: orderError } = await supabaseAdmin
    .from("purchase_orders")
    .select("id, order_number")
    .eq("id", poId)
    .single();

  if (orderError || !order) {
    throw new Error("طلب الشراء غير موجود");
  }

  // 2. جلب بنود طلب الشراء شاملاً unit_cost
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("purchase_order_items")
    .select("id, product_id, quantity, unit_cost, received_quantity")
    .eq("purchase_order_id", poId);

  if (itemsError || !items?.length) {
    throw new Error("لا توجد بنود لاستلامها في طلب الشراء");
  }

  // 3. التكرار على البنود وتحديث المخزون وتسجيل الحركة
  for (const item of items) {
    const pendingQty =
      Number(item.quantity) - Number(item.received_quantity || 0);

    if (pendingQty <= 0) {
      continue;
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, stockQuantity, conversionFactor")
      .eq("id", item.product_id)
      .single();

    if (productError || !product) {
      throw new Error("تعذر تحديث مخزون أحد المنتجات (المنتج غير موجود)");
    }

    const conversion = Number(product.conversionFactor) || 1;
    const stockAdd = Math.ceil(pendingQty * conversion);

    // تحديث كمية المنتج
    const { error: stockError } = await supabaseAdmin
      .from("products")
      .update({
        stockQuantity: Number(product.stockQuantity || 0) + stockAdd,
      })
      .eq("id", item.product_id);

    if (stockError) {
      throw new Error(`خطأ أثناء تحديث المخزون: ${stockError.message}`);
    }

    // تسجيل حركة المخزن (STOCK_IN)
    const { error: movementError } = await supabaseAdmin
      .from("inventory_movements")
      .insert({
        product_id: item.product_id,
        purchase_order_id: poId,
        movement_type: "STOCK_IN",
        quantity: stockAdd,
        unit_cost: Number(item.unit_cost || 0),
        reference: order.order_number,
        notes: "استلام طلب شراء",
      });

    if (movementError) {
      console.error("Failed to insert movement:", movementError);
    }

    // تحديث الكمية المستلمة في بند الطلب
    await supabaseAdmin
      .from("purchase_order_items")
      .update({ received_quantity: item.quantity })
      .eq("id", item.id);
  }
}

export async function processPurchaseReceipt(poId: string) {
  // تشغيل الاستلام المباشر للمخزون فقط دون قيود محاسبية
  await processReceiptInApp(poId);
}

// export async function processPurchaseReceipt(poId: string) {
//   const { error: rpcError } = await supabaseAdmin.rpc(
//     "process_purchase_order_receipt",
//     { po_id: poId },
//   );

//   if (!rpcError) {
//     return;
//   }

//   const missingFn = /could not find|does not exist|schema cache/i.test(
//     rpcError.message,
//   );
//   if (!missingFn) {
//     throw new Error(rpcError.message);
//   }

//   await processReceiptInApp(poId);
// }

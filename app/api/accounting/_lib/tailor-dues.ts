/** تحويل صفوف دوال مستحقات الخياطين (get_tailor_dues / get_tailor_dues_orders) */
import type {
  TailorDuesOrderRow,
  TailorDuesPaymentRow,
  TailorDuesRow,
} from "@/app/dashboard/accounting/schemas/accounting.schema";

export function mapTailorDuesRow(raw: Record<string, unknown>): TailorDuesRow {
  return {
    tailorId: String(raw.tailor_id ?? ""),
    tailorName: String(raw.tailor_name ?? ""),
    tailorPhone: raw.tailor_phone != null ? String(raw.tailor_phone) : null,
    ordersCount: Number(raw.orders_count ?? 0),
    openOrdersCount: Number(raw.open_orders_count ?? 0),
    costSdg: Number(raw.cost_sdg ?? 0),
    paidSdg: Number(raw.paid_sdg ?? 0),
    advancesSdg: Number(raw.advances_sdg ?? 0),
    remainingSdg: Number(raw.remaining_sdg ?? 0),
  };
}

export function mapTailorDuesOrderRow(raw: Record<string, unknown>): TailorDuesOrderRow {
  return {
    salesOrderId: String(raw.sales_order_id ?? ""),
    orderNumber: String(raw.order_number ?? ""),
    itemName: raw.tailoring_item_name != null ? String(raw.tailoring_item_name) : null,
    purpose: raw.tailoring_purpose === "PRODUCTION" ? "PRODUCTION" : "CUSTOMER",
    orderCreatedAt: String(raw.order_created_at ?? ""),
    costRecognizedAt: String(raw.cost_recognized_at ?? ""),
    costSdg: Number(raw.cost_sdg ?? 0),
    paidSdg: Number(raw.paid_sdg ?? 0),
    advancesSdg: Number(raw.advances_sdg ?? 0),
    remainingSdg: Number(raw.remaining_sdg ?? 0),
  };
}

export function mapTailorDuesPaymentRow(
  raw: Record<string, unknown>,
  orderNumbers: Map<string, string>,
): TailorDuesPaymentRow {
  const salesOrderId = raw.sales_order_id != null ? String(raw.sales_order_id) : null;
  const rate = Number(raw.exchange_rate_used ?? 0);
  const amountUsd = Number(raw.amount ?? 0);
  return {
    id: String(raw.id ?? ""),
    createdAt: String(raw.created_at ?? ""),
    salesOrderId,
    orderNumber: salesOrderId ? orderNumbers.get(salesOrderId) ?? null : null,
    paymentType:
      raw.payment_type === "ADVANCE" || raw.payment_type === "DUES_ADVANCE"
        ? raw.payment_type
        : "SETTLEMENT",
    paymentMethod: raw.payment_method === "BANK" ? "BANK" : "CASH",
    // دفعات قديمة بالدولار: نحولها بسعرها
    amountSdg:
      raw.currency === "SDG" && raw.amount_original != null
        ? Number(raw.amount_original)
        : Number((amountUsd * rate).toFixed(2)),
    amountUsd,
    notes: raw.notes != null ? String(raw.notes) : null,
  };
}

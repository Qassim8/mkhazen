import { serverFetch } from "@/lib/api-client";

import type {
  CreateTailoringOrderInput,
  PayTailorPaymentInput,
  ProductionCompletionInput,
  UpdateTailoringOrderApiInput,
  CancelTailoringOrderInput,
  RefundCustomerAdvanceInput,
  TailoringOrder,
  TailoringPurpose,
  TailoringStatus,
} from "../schemas/tailoring.schemas";

const API_BASE_URL = "/api/tailoring";

export interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RawTailoringOrder extends Record<string, unknown> {}

function mapMeasurements(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = String(row.label ?? "").trim();
      const numericValue = Number(row.value);
      const unit = row.unit === "M" ? "M" : "CM";

      if (!label || !Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
      }

      return { label, value: numericValue, unit: unit as "CM" | "M" };
    })
    .filter(
      (item): item is { label: string; value: number; unit: "CM" | "M" } =>
        item !== null,
    );
}

function calculateMeasurementMetersFromRaw(value: unknown) {
  return Number(
    mapMeasurements(value)
      .reduce(
        (sum, row) => sum + (row.unit === "CM" ? row.value / 100 : row.value),
        0,
      )
      .toFixed(2),
  );
}

function mapTailoringOrder(raw: RawTailoringOrder): TailoringOrder {
  const purpose: TailoringPurpose =
    raw.tailoring_purpose === "PRODUCTION" ? "PRODUCTION" : "CUSTOMER";
  const paid = Number(raw.paid_amount ?? 0);
  const total = Number(raw.total_amount ?? 0);
  const tailoringCost = Number(raw.tailoring_cost ?? 0);
  const fabricCost = Number(raw.fabric_cost ?? raw.tailoring_fabric_cost ?? 0);
  const productionTotalCost =
    raw.production_total_cost == null ? null : Number(raw.production_total_cost);
  const totalCost = Number(
    (productionTotalCost ?? fabricCost + tailoringCost).toFixed(2),
  );
  const tailorPaidAmount = Number(raw.tailor_paid_amount ?? 0);
  const measurements = mapMeasurements(raw.measurements);
  const measurementMeters = Number(
    Number(
      raw.measurement_meters ?? calculateMeasurementMetersFromRaw(raw.measurements),
    ).toFixed(2),
  );

  const producedQuantity =
    raw.produced_quantity == null ? null : Number(raw.produced_quantity);
  const producedProduct =
    raw.produced_product_name && raw.produced_product_variant_id
      ? {
          templateId: String(raw.produced_product_template_id ?? ""),
          variantId: String(raw.produced_product_variant_id),
          name: String(raw.produced_product_name),
          sku: raw.produced_product_sku ? String(raw.produced_product_sku) : null,
          barcode: raw.produced_product_barcode
            ? String(raw.produced_product_barcode)
            : null,
          quantity: producedQuantity ?? 0,
          sellingPrice: Number(raw.produced_product_selling_price ?? 0),
          averageCost: Number(raw.produced_product_average_cost ?? 0),
        }
      : null;

  const customerId = raw.customer_id ? String(raw.customer_id) : null;

  return {
    id: String(raw.id ?? ""),
    orderNumber: String(raw.order_number ?? ""),
    tailoringItemName: String(raw.tailoring_item_name ?? `طلب تفصيل ${String(raw.order_number ?? "")}`),
    tailoringItemDescription: raw.tailoring_item_description ? String(raw.tailoring_item_description) : null,
    cancellationReason: raw.cancellation_reason ? String(raw.cancellation_reason) : null,
    convertedToProductAt: raw.converted_to_product_at ? String(raw.converted_to_product_at) : null,
    customerAdvanceAvailable: Number(Number(raw.customer_advance_available ?? 0).toFixed(2)),
    customerAdvanceTransferredIn: Number(Number(raw.customer_advance_transferred_in ?? 0).toFixed(2)),
    customerAdvanceTransferredOut: Number(Number(raw.customer_advance_transferred_out ?? 0).toFixed(2)),
    customerAdvanceRefunded: Number(Number(raw.customer_advance_refunded ?? 0).toFixed(2)),
    customerAdvanceMovements: Array.isArray(raw.customer_advance_movements)
      ? raw.customer_advance_movements.map((movement) => {
          const row = movement as Record<string, unknown>;
          return {
            direction: (row.direction ?? "IN") as "IN" | "OUT" | "REFUND",
            amount: Number(row.amount ?? 0),
            relatedOrderId: row.related_order_id ? String(row.related_order_id) : null,
            relatedOrderNumber: row.related_order_number ? String(row.related_order_number) : null,
            createdAt: String(row.created_at ?? ""),
          };
        })
      : [],
    tailoringPurpose: purpose,
    cashierId: raw.cashier_id ? String(raw.cashier_id) : null,
    customerId,
    customer: raw.customer_name
      ? {
          id: String(raw.customer_id ?? ""),
          name: String(raw.customer_name ?? ""),
          whatsappNumber: String(raw.customer_whatsapp ?? ""),
          measurements: raw.customer_measurements
            ? mapMeasurements(raw.customer_measurements)
            : undefined,
        }
      : undefined,
    tailorId: String(raw.tailor_id ?? ""),
    tailor: raw.tailor_name
      ? {
          id: String(raw.tailor_id ?? ""),
          name: String(raw.tailor_name ?? ""),
          phone: raw.tailor_phone ? String(raw.tailor_phone) : null,
        }
      : undefined,
    tailorName: raw.tailor_name ? String(raw.tailor_name) : undefined,
    tailorPhone: raw.tailor_phone ? String(raw.tailor_phone) : null,
    tailoringStatus: (raw.tailoring_status ?? "NEW") as TailoringStatus,
    intakeDate: String(raw.intake_date ?? ""),
    expectedDeliveryDate: String(raw.expected_delivery_date ?? ""),
    measurements,
    measurementMeters,
    maxFabricQuantity: Number(
      Number(raw.max_fabric_quantity ?? measurementMeters + 1).toFixed(2),
    ),
    fabricVariantId: raw.fabric_variant_id ? String(raw.fabric_variant_id) : null,
    fabricQuantity:
      raw.fabric_quantity != null ? Number(raw.fabric_quantity) : null,
    fabric: raw.fabric_name
      ? {
          id: String(raw.fabric_variant_id ?? ""),
          name: String(raw.fabric_name),
          sku: raw.fabric_sku ? String(raw.fabric_sku) : null,
          sellingUnit: raw.fabric_selling_unit ? String(raw.fabric_selling_unit) : null,
          stockQuantity: Number(raw.fabric_stock_quantity ?? 0),
        }
      : null,
    fabricCost,
    tailoringCost,
    totalCost,
    grossProfit: purpose === "CUSTOMER" ? Number((total - totalCost).toFixed(2)) : null,
    tailoringMaterialJournalEntryId: raw.tailoring_material_journal_entry_id
      ? String(raw.tailoring_material_journal_entry_id)
      : null,
    tailoringLaborJournalEntryId: raw.tailoring_labor_journal_entry_id
      ? String(raw.tailoring_labor_journal_entry_id)
      : null,
    customerAdvanceJournalEntryId: raw.customer_advance_journal_entry_id
      ? String(raw.customer_advance_journal_entry_id)
      : null,
    tailoringCogsJournalEntryId: raw.tailoring_cogs_journal_entry_id
      ? String(raw.tailoring_cogs_journal_entry_id)
      : null,
    tailoringCostRecognized:
      purpose === "PRODUCTION"
        ? Boolean(raw.production_labor_journal_entry_id ?? raw.tailoring_labor_journal_entry_id)
        : Boolean(raw.tailoring_labor_journal_entry_id ?? raw.tailoring_cogs_journal_entry_id),
    tailorPaidAmount: Number(tailorPaidAmount.toFixed(2)),
    tailorRemainingAmount: Number(
      Math.max(tailoringCost - tailorPaidAmount, 0).toFixed(2),
    ),
    totalAmount: total,
    paidAmount: Number(paid.toFixed(2)),
    remainingAmount: Number(Math.max(total - paid, 0).toFixed(2)),
    paymentStatus: (raw.payment_status ??
      (paid >= total && total > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID")) as
      | "UNPAID"
      | "PARTIAL"
      | "PAID",
    paymentMethod:
      raw.payment_method === "BANK_TRANSFER"
        ? "BANK_TRANSFER"
        : raw.payment_method === "MIXED"
          ? "MIXED"
          : "CASH",
    productionTotalCost,
    producedQuantity,
    productionMaterialJournalEntryId: raw.production_material_journal_entry_id
      ? String(raw.production_material_journal_entry_id)
      : null,
    productionLaborJournalEntryId: raw.production_labor_journal_entry_id
      ? String(raw.production_labor_journal_entry_id)
      : null,
    productionInventoryJournalEntryId: raw.production_inventory_journal_entry_id
      ? String(raw.production_inventory_journal_entry_id)
      : null,
    producedProduct,
    notes: raw.notes != null ? String(raw.notes) : null,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? raw.created_at ?? ""),
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
    payments: Array.isArray(raw.payments)
      ? raw.payments.map((payment) => {
          const row = payment as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            amount: Number(row.amount ?? 0),
            paymentDate: String(row.payment_date ?? ""),
            paymentMethod: (row.payment_method ?? "CASH") as
              | "CASH"
              | "CARD"
              | "BANK_TRANSFER",
            reference: row.reference ? String(row.reference) : null,
            notes: row.notes ? String(row.notes) : null,
            journalEntryId: row.journal_entry_id
              ? String(row.journal_entry_id)
              : null,
          };
        })
      : undefined,
    tailorPayments: Array.isArray(raw.tailor_payments)
      ? raw.tailor_payments.map((payment) => {
          const row = payment as Record<string, unknown>;
          return {
            id: String(row.id ?? ""),
            amount: Number(row.amount ?? 0),
            paymentType: (row.payment_type ?? "SETTLEMENT") as "ADVANCE" | "SETTLEMENT",
            paymentMethod: (row.payment_method ?? "CASH") as "CASH" | "BANK",
            notes: row.notes ? String(row.notes) : null,
            createdAt: String(row.created_at ?? ""),
            journalEntryId: row.journal_entry_id
              ? String(row.journal_entry_id)
              : null,
          };
        })
      : undefined,
  };
}

export async function createTailoringOrder(payload: CreateTailoringOrderInput) {
  return serverFetch<{
    message: string;
    data: {
      id: string;
      order_number: string;
      tailoring_purpose: TailoringPurpose;
      customer_id: string | null;
      cashier_id: string;
      tailor_id: string;
      total_amount: number;
      deposit_amount: number;
      remaining_amount: number;
      tailoring_cost: number;
      tailoring_fabric_cost: number;
      payment_method: "CASH" | "BANK_TRANSFER" | null;
      tailoring_status: "NEW";
      measurement_meters: number;
      max_fabric_quantity: number;
    };
  }>(`${API_BASE_URL}/orders`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTailoringOrders(params?: {
  status?: TailoringStatus | "ALL";
  purpose?: TailoringPurpose | "ALL";
  search?: string;
  tailorId?: string;
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID" | "ALL";
  fromDate?: string;
  toDate?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ data: TailoringOrder[]; meta: Meta }> {
  const response = await serverFetch<{
    data: RawTailoringOrder[];
    meta: Meta;
  }>(`${API_BASE_URL}/orders`, {
    method: "GET",
    params: {
      search: params?.search,
      purpose:
        params?.purpose && params.purpose !== "ALL" ? params.purpose : undefined,
      tailorId: params?.tailorId,
      fromDate: params?.fromDate,
      toDate: params?.toDate,
      status:
        params?.status && params.status !== "ALL" ? params.status : undefined,
      paymentStatus:
        params?.paymentStatus && params.paymentStatus !== "ALL"
          ? params.paymentStatus
          : undefined,
      overdue: params?.overdue ? "true" : undefined,
      page: params?.page ?? 1,
      limit: params?.limit ?? 15,
    },
    next: { tags: ["tailoring-orders"] },
  });

  return { data: response.data.map(mapTailoringOrder), meta: response.meta };
}

export async function getTailoringOrderById(id: string) {
  const response = await serverFetch<{ data: RawTailoringOrder }>(
    `${API_BASE_URL}/orders/${id}`,
    {
      method: "GET",
      next: { tags: ["tailoring-orders", `tailoring-order-${id}`] },
    },
  );

  return { data: mapTailoringOrder(response.data) };
}

export async function updateTailoringStatus(
  id: string,
  status: "UNDER_TAILORING" | "READY_FOR_PICKUP",
) {
  return serverFetch(`${API_BASE_URL}/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function completeTailoringPickup(
  id: string,
  paymentMethod: "CASH" | "BANK_TRANSFER",
) {
  return serverFetch(`${API_BASE_URL}/orders/${id}/pickup`, {
    method: "POST",
    body: JSON.stringify({ paymentMethod }),
  });
}

export async function completeTailoringProduction(
  id: string,
  payload: ProductionCompletionInput,
) {
  return serverFetch<{
    message: string;
    data: {
      id: string;
      order_number: string;
      product_template_id: string;
      product_variant_id: string;
      product_name: string;
      produced_quantity: number;
      production_total_cost: number;
      unit_cost: number;
      tailoring_cost: number;
      fabric_cost: number;
      production_labor_journal_entry_id: string;
      production_inventory_journal_entry_id: string;
      tailoring_status: "RECEIVED";
    };
  }>(`${API_BASE_URL}/orders/${id}/production-receive`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function payTailorPayment(payload: PayTailorPaymentInput) {
  return serverFetch(`${API_BASE_URL}/commission-payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTailoringOrder(
  id: string,
  payload: UpdateTailoringOrderApiInput,
) {
  return serverFetch<unknown>(`${API_BASE_URL}/orders/${id}/edit`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function cancelTailoringOrder(
  id: string,
  payload: CancelTailoringOrderInput,
) {
  return serverFetch<{
    message: string;
    data: {
      id: string;
      order_number: string;
      tailoring_status: "CANCELLED";
      cancellation_reason: string;
    };
  }>(`${API_BASE_URL}/orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function refundCustomerAdvance(
  id: string,
  payload: RefundCustomerAdvanceInput,
) {
  return serverFetch<{
    message: string;
    data: {
      id: string;
      sales_order_id: string;
      amount: number;
      remaining_advance: number;
      journal_entry_id: string;
    };
  }>(`${API_BASE_URL}/orders/${id}/refund`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function convertTailoringToProduct(
  id: string,
  payload: ProductionCompletionInput,
) {
  return serverFetch<{
    message: string;
    data: {
      id: string;
      order_number: string;
      product_template_id: string;
      product_variant_id: string;
      product_name: string;
      produced_quantity: number;
      production_total_cost: number;
      unit_cost: number;
      tailoring_cost: number;
      fabric_cost: number;
      production_labor_journal_entry_id: string | null;
      tailoring_labor_journal_entry_id: string | null;
      tailor_advance_apply_journal_entry_id: string | null;
      production_inventory_journal_entry_id: string;
      converted_to_product_at: string;
      tailoring_status: "CANCELLED";
      cancellation_reason: string;
    };
  }>(`${API_BASE_URL}/orders/${id}/convert-to-product`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createOverdueNotifications() {
  return serverFetch(`${API_BASE_URL}/overdue-notifications`, {
    method: "POST",
  });
}

export const payTailorCommission = payTailorPayment;

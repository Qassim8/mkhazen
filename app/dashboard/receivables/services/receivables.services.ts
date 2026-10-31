import { serverFetch } from "@/lib/api-client";

/**
 * تصنيفات الذمم:
 *  POS_CREDIT            ديون فواتير الكاشير بالتقسيط (ديون فعلية)
 *  TAILORING_IN_PROGRESS متبقي على طلبات تفصيل لم تُسلَّم (مبالغ متوقعة، ليست ديونًا)
 * (لا يوجد "تفصيل مُسلَّم وعليه متبقٍ": التسليم يحصّل كامل المتبقي)
 */
export type ReceivableKind = "POS_CREDIT" | "TAILORING_IN_PROGRESS";
export type ReceivableKindFilter = "ALL" | ReceivableKind;

/** ما تحتاجه نوافذ التحصيل والتعديل من الصف (يطابقه ReceivableRow وصفوف صفحة العميل) */
export interface CollectTarget {
  order_id: string;
  order_number: string;
  customer_name: string | null;
  remaining_sdg: number | null;
}

/** صف من /api/sales/receivables (snake_case كما يرجع من الـ API) */
export interface ReceivableRow extends CollectTarget {
  kind: ReceivableKind;
  customer_id: string | null;
  customer_phone: string | null;
  created_at: string;
  due_date: string | null;
  is_overdue: boolean;
  payment_status: string;
  /** حالة طلب التفصيل (NEW / UNDER_TAILORING / READY_FOR_PICKUP) */
  status_code: string | null;
  /** التحصيل متاح الآن (فاتورة آجلة، أو طلب تفصيل جاهز للاستلام) */
  can_collect: boolean;
  total_amount: number | null;
  paid_amount: number | null;
  sale_rate: number | null;
  current_rate: number | null;
  remaining_usd_at_sale: number | null;
  remaining_usd_now: number | null;
  loss_usd: number | null;
  loss_pct: number | null;
  equivalent_sdg_today: number | null;
  /** للمالك والمدير فقط */
  expected_profit_usd?: number | null;
  loss_pct_of_profit?: number | null;
  deferred_cost_usd?: number | null;
}

export interface ReceivableBucket {
  count: number;
  overdue_count: number;
  remaining_sdg: number;
  usd_at_sale: number;
  usd_now: number;
  loss_usd: number;
}

export interface ReceivablesSummary {
  pos_credit: ReceivableBucket;
  tailoring_in_progress: ReceivableBucket;
  total: ReceivableBucket;
  /** للمالك والمدير فقط */
  deferred_cost_usd_open?: number;
  deferred_cogs_usd?: number;
}

export interface ReceivablesResponse {
  data: ReceivableRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary?: ReceivablesSummary;
}

export async function getReceivables(params: {
  page?: number;
  limit?: number;
  search?: string;
  overdue?: boolean;
  kind?: ReceivableKindFilter;
  customerId?: string;
}): Promise<ReceivablesResponse> {
  return serverFetch<ReceivablesResponse>("/api/sales/receivables", {
    method: "GET",
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      search: params.search || undefined,
      overdue: params.overdue ? "true" : undefined,
      kind: params.kind && params.kind !== "ALL" ? params.kind : undefined,
      customerId: params.customerId || undefined,
    },
    cache: "no-store",
  });
}

export interface CreditPaymentResult {
  message: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  amount: number;
  remainingAmount: number;
  overpaidAmount: number;
  closed: boolean;
}

export async function recordCreditPayment(
  orderId: string,
  payload: { amount: number; paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER"; notes?: string | null },
  options: { idempotencyKey?: string } = {},
): Promise<CreditPaymentResult> {
  return serverFetch<CreditPaymentResult>(`/api/sales/orders/${orderId}/credit-payments`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

export async function adjustCreditRemaining(
  orderId: string,
  payload: { newRemaining: number; reason: string },
  options: { idempotencyKey?: string } = {},
): Promise<{ message: string; oldRemaining: number; newRemaining: number }> {
  return serverFetch(`/api/sales/orders/${orderId}/credit-adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

export async function closeCreditBadDebt(
  orderId: string,
  payload: { notes?: string | null },
  options: { idempotencyKey?: string } = {},
): Promise<{ message: string; writtenOffSdg: number }> {
  return serverFetch(`/api/sales/orders/${orderId}/close-credit`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

export interface CreditHistory {
  orderId: string;
  orderNumber: string;
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    notes: string | null;
    amountUsd: number | null;
    exchangeRate: number | null;
    createdByName: string | null;
  }[];
  /** للمالك والمدير فقط */
  adjustments: {
    id: string;
    type: "ADJUST" | "BAD_DEBT";
    oldRemaining: number;
    newRemaining: number;
    reason: string | null;
    createdAt: string;
    createdByName: string | null;
  }[];
}

export async function getCreditHistory(orderId: string): Promise<CreditHistory> {
  const response = await serverFetch<{ data: CreditHistory }>(`/api/sales/orders/${orderId}/credit-history`, {
    method: "GET",
    cache: "no-store",
  });
  return response.data;
}

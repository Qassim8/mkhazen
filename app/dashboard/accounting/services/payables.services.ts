import { serverFetch } from "@/lib/api-client";

const API_BASE_URL = "/api/accounting/payables";

/** مستحق على المحل: متبقي أصل أو مصروف سُجّل بقيمته الكاملة ويُدفع على أجزاء */
export interface PayableRow {
  id: string;
  sourceType: "ASSET" | "EXPENSE";
  sourceId: string | null;
  expenseAccount: string | null;
  description: string;
  currency: "USD" | "SDG";
  totalAmount: number;
  /** دفعه المالك من ماله (لم يُخصم من الخزنة) */
  ownerPaid: number;
  /** المدفوع من الخزينة/البنك (الآن + الدفعات اللاحقة) */
  paidAmount: number;
  remainingAmount: number;
  dueDate: string | null;
  status: "OPEN" | "PAID";
  recognitionEntryId: string | null;
  createdAt: string;
  createdByName: string | null;
  isOverdue: boolean;
}

export interface PayablesSummaryBucket {
  count: number;
  overdue_count: number;
  remaining_sdg: number;
  remaining_usd: number;
  book_usd: number;
}

export interface PayablesSummary {
  assets: PayablesSummaryBucket;
  expenses: PayablesSummaryBucket;
  total: PayablesSummaryBucket;
}

export interface PayablesResponse {
  data: PayableRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: PayablesSummary;
}

export async function getPayables(params: {
  page?: number;
  limit?: number;
  status?: "OPEN" | "PAID" | "ALL";
  type?: "ASSET" | "EXPENSE" | "ALL";
  search?: string;
  overdue?: boolean;
}): Promise<PayablesResponse> {
  return serverFetch<PayablesResponse>(API_BASE_URL, {
    method: "GET",
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      status: params.status && params.status !== "OPEN" ? params.status : undefined,
      type: params.type && params.type !== "ALL" ? params.type : undefined,
      search: params.search || undefined,
      overdue: params.overdue ? "true" : undefined,
    },
    cache: "no-store",
  });
}

export interface PayableDetail extends Omit<PayableRow, "isOverdue" | "createdByName"> {
  fxEntryId: string | null;
  recognitionEntryNumber: string | null;
  fxEntryNumber: string | null;
  createdByName: string | null;
  payments: {
    id: string;
    amount: number;
    amountUsd: number | null;
    exchangeRate: number | null;
    method: "CASH" | "BANK";
    journalEntryId: string | null;
    journalEntryNumber: string | null;
    notes: string | null;
    createdAt: string;
    createdByName: string | null;
  }[];
}

export async function getPayable(id: string): Promise<PayableDetail> {
  const response = await serverFetch<{ data: PayableDetail }>(`${API_BASE_URL}/${id}`, {
    method: "GET",
    cache: "no-store",
  });
  return response.data;
}

export interface PayablePaymentResult {
  message: string;
  data: {
    payment_id: string;
    journal_entry_id: string;
    amount: number;
    remaining_amount: number;
    status: "OPEN" | "PAID";
    fx_entry_id: string | null;
  };
}

export async function payPayable(
  id: string,
  payload: { amount: number; method: "CASH" | "BANK"; notes?: string | null },
  options: { idempotencyKey?: string } = {},
): Promise<PayablePaymentResult> {
  return serverFetch<PayablePaymentResult>(`${API_BASE_URL}/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

import type { ReceivablesBucket } from "@/lib/credit";
import { serverFetch } from "@/lib/api-client";

import {
  AccountingAccount,
  AccountingQueryInput,
  Asset,
  AssetInput,
  CorrectManualJournalEntryInput,
  CorrectManualJournalEntryResult,
  CreateManualJournalEntryInput,
  CurrencyExchangeInput,
  JournalEntry,
  JournalEntryType,
  PayTailorDuesInput,
  TailorDuesRow,
  TailorStatement,
} from "../schemas/accounting.schema";

const API_BASE_URL = "/api/accounting";

export interface AccountingEntriesResponse {
  data: JournalEntry[];

  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AccountingEntryResponse {
  data: JournalEntry;
}

export interface AccountingSummary {
  currency: "USD";
  exchangeRate: number | null;
  revenue: number;
  expenses: number;
  profit: number;
  suppliersDebt: number;
  capital: number;
  cashUsd: number;
  cashSdg: number;
  bankUsd: number;
  bankSdg: number;
  totalLiquidityUsd: number;
  assets: number;
  inventory: number;
}

export interface AccountingSummaryResponse {
  data: AccountingSummary;
}

export interface ManualJournalEntryResponse {
  message?: string;
  data?: JournalEntry;
}

export interface AssetsResponse {
  data: Asset[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  totalValue: number;
}

export interface AssetResponse {
  message?: string;
  data: Asset;
}

export type GetAccountingEntriesParams = Partial<AccountingQueryInput>;

export async function getAccountingEntries(
  params?: GetAccountingEntriesParams,
): Promise<AccountingEntriesResponse> {
  return serverFetch<AccountingEntriesResponse>(API_BASE_URL, {
    method: "GET",

    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,

      entryType:
        params?.entryType && params.entryType !== "ALL"
          ? params.entryType
          : undefined,

      year: params?.year,
      search: params?.search,
    },

    next: {
      tags: ["accounting-entries"],
    },
  });
}

export async function getAccountingEntryById(
  id: string,
): Promise<AccountingEntryResponse> {
  return serverFetch<AccountingEntryResponse>(`${API_BASE_URL}/${id}`, {
    method: "GET",

    next: {
      tags: ["accounting-entries", `accounting-entry-${id}`],
    },
  });
}

export async function getAccountingSummary(): Promise<AccountingSummaryResponse> {
  return serverFetch<AccountingSummaryResponse>(`${API_BASE_URL}/summary`, {
    method: "GET",

    next: {
      tags: ["accounting-summary"],
    },
  });
}

export async function createManualJournalEntry(
  payload: CreateManualJournalEntryInput,
  options: { idempotencyKey?: string } = {},
): Promise<ManualJournalEntryResponse> {
  return serverFetch<ManualJournalEntryResponse>(`${API_BASE_URL}/manual`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

/** تفاصيل قيد (من /api/accounting/entries/[id]) — عرض فقط */
export interface EntryDetail {
  id: string;
  entryNumber: string;
  entryType: JournalEntryType;
  description: string | null;
  reference: string | null;
  createdAt: string;
  debitAccount: string;
  debitLabel: string;
  creditAccount: string;
  creditLabel: string;
  amount: number;
  currency: "USD" | "SDG";
  exchangeRateUsed: number | null;
  amountUsd: number | null;
  createdById: string | null;
  createdByName: string | null;
  correctionOfId: string | null;
  isCorrectionReversal: boolean;
}

export interface EntryLinkedDocument {
  kind: string;
  title: string;
  number: string | null;
  summary: string;
  href: string | null;
}

export interface EntryDetailResponse {
  data: {
    entry: EntryDetail;
    documents: EntryLinkedDocument[];
    relatedEntries: EntryDetail[];
  };
}

export async function getAccountingEntryDetail(id: string): Promise<EntryDetailResponse> {
  return serverFetch<EntryDetailResponse>(`${API_BASE_URL}/entries/${id}`, {
    method: "GET",
    cache: "no-store",
  });
}

export interface CorrectManualJournalEntryResponse {
  message?: string;
  data?: CorrectManualJournalEntryResult;
}

export async function correctManualJournalEntry(
  entryId: string,
  payload: CorrectManualJournalEntryInput,
  options: { idempotencyKey?: string } = {},
): Promise<CorrectManualJournalEntryResponse> {
  return serverFetch<CorrectManualJournalEntryResponse>(
    `${API_BASE_URL}/manual/${entryId}/correct`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    },
  );
}

/* =========================================================
   مستحقات وسلف الخياطين
========================================================= */

export interface TailorDuesResponse {
  data: TailorDuesRow[];
  totals: { remainingSdg: number; advancesSdg: number };
}

export async function getTailorDues(): Promise<TailorDuesResponse> {
  return serverFetch<TailorDuesResponse>(`${API_BASE_URL}/tailor-dues`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getTailorStatement(
  tailorId: string,
): Promise<{ data: TailorStatement }> {
  return serverFetch<{ data: TailorStatement }>(
    `${API_BASE_URL}/tailor-dues/${tailorId}`,
    { method: "GET", cache: "no-store" },
  );
}

export async function payTailorDues(
  payload: PayTailorDuesInput,
  options: { idempotencyKey?: string } = {},
) {
  return serverFetch<{ message?: string; data?: Record<string, unknown> }>(
    `${API_BASE_URL}/tailor-dues`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    },
  );
}

function mapAsset(raw: Record<string, unknown>): Asset {
  return {
    id: String(raw.id ?? ""),
    branchId: String(raw.branch_id ?? ""),
    createdBy: raw.created_by != null ? String(raw.created_by) : null,
    name: String(raw.name ?? ""),
    category: String(raw.category ?? "OTHER") as Asset["category"],
    purchaseValue: Number(raw.purchase_value ?? 0),
    purchaseValueUsd: Number(raw.purchase_value_usd ?? raw.purchase_value ?? 0),
    currency: raw.currency === "SDG" ? "SDG" : "USD",
    exchangeRateUsed:
      raw.exchange_rate_used != null ? Number(raw.exchange_rate_used) : null,
    purchaseDate: String(raw.purchase_date ?? ""),
    paymentMethod: (raw.payment_method === "BANK" || raw.payment_method === "OPENING"
      ? raw.payment_method
      : "CASH") as Asset["paymentMethod"],
    reference: raw.reference != null ? String(raw.reference) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    createdAt: String(raw.created_at ?? ""),
    payable: mapAssetPayable(raw.payable),
  };
}

function mapAssetPayable(raw: unknown): Asset["payable"] {
  if (!raw || typeof raw !== "object") return null;
  const payable = raw as Record<string, unknown>;

  return {
    id: String(payable.id ?? ""),
    ownerPaid: Number(payable.owner_paid ?? 0),
    paidAmount: Number(payable.paid_amount ?? 0),
    remainingAmount: Number(payable.remaining_amount ?? 0),
    dueDate: payable.due_date != null ? String(payable.due_date) : null,
    status: payable.status === "PAID" ? "PAID" : "OPEN",
  };
}

export async function getAssets(params?: {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<AssetsResponse> {
  const response = await serverFetch<{
    data: Record<string, unknown>[];
    meta: AssetsResponse["meta"];
    totalValue: number;
  }>(`${API_BASE_URL}/assets`, {
    method: "GET",

    params: {
      search: params?.search,
      category:
        params?.category && params.category !== "ALL"
          ? params.category
          : undefined,
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
    },

    next: {
      tags: ["accounting-assets"],
    },
  });

  return {
    data: (response.data ?? []).map(mapAsset),
    meta: response.meta,
    totalValue: response.totalValue,
  };
}

export async function getAssetById(id: string): Promise<AssetResponse> {
  const response = await serverFetch<{
    data: Record<string, unknown>;
  }>(`${API_BASE_URL}/assets/${id}`, {
    method: "GET",

    next: {
      tags: ["accounting-assets", `accounting-asset-${id}`],
    },
  });

  return {
    data: mapAsset(response.data),
  };
}

export async function createAsset(
  payload: AssetInput,
  options: { idempotencyKey?: string } = {},
): Promise<AssetResponse> {
  const response = await serverFetch<{
    message?: string;
    data: Record<string, unknown>;
  }>(`${API_BASE_URL}/assets`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });

  return {
    message: response.message,
    data: mapAsset(response.data),
  };
}

export const ACCOUNT_LABELS: Record<AccountingAccount, string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  CAPITAL: "رأس المال",
  INVENTORY: "المخزون",
  WORK_IN_PROGRESS: "أعمال قيد التنفيذ",
  DEFERRED_COGS: "تكلفة بضاعة مباعة بالآجل",
  SUPPLIERS: "الموردون",
  OTHER_PAYABLES: "مستحقات أخرى",
  EMPLOYEE_ADVANCES: "سلف الموظفين",
  CUSTOMER_ADVANCES: "عربون العملاء",
  TAILOR_ADVANCES: "سلف الخياطين",
  TAILORS_PAYABLE: "مستحقات الخياطين",
  SALES: "المبيعات",
  COGS: "تكلفة البضاعة المباعة",
  ASSETS: "الأصول",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  UTILITIES: "خدمات ومرافق",
  RENTS: "الإيجارات",
  OTHER_EXPENSE: "مصروفات أخرى",
  OTHER_INCOME: "إيرادات أخرى",
  GIFTS: "هدايا للعملاء",
  CURRENCY_EXCHANGE: "تحويل عملة",
};

export const ENTRY_TYPE_LABELS: Record<JournalEntryType, string> = {
  CAPITAL: "رأس مال",
  PURCHASE: "شراء",
  PURCHASE_PAYMENT: "دفع للمورد",
  SALE: "بيع",
  SALE_PAYMENT: "دفع للخزينة",
  CUSTOMER_ADVANCE: "عربون عميل",
  CUSTOMER_ADVANCE_REFUND: "استرداد عربون",
  TAILOR_ADVANCE: "سلفة خياط",
  TAILOR_COST: "تكلفة تفصيل",
  TAILOR_ADVANCE_APPLICATION: "تسوية سلفة خياط",
  TAILOR_PAYMENT: "دفع للخياط",
  TAILOR_DUES_PAYMENT: "سداد مستحقات خياط",
  TAILOR_DUES_ADVANCE: "سلفة خياط",
  TAILORING_MATERIAL: "مواد تفصيل",
  PRODUCTION: "إنتاج",
  COGS: "تكلفة البضاعة المباعة",
  EXPENSE: "مصروف",
  ASSET: "أصل",
  PAYABLE_PAYMENT: "دفعة مستحق",
  EMPLOYEE_ADVANCE: "سلفة موظف",
  INVENTORY_ADJUSTMENT: "تسوية مخزون",
  SALES_RETURN: "مرتجع مبيعات",
  GIFT: "هدية",
  CURRENCY_EXCHANGE: "تحويل عملة",
  OTHER: "أخرى",
};

/** كل الأرقام بالدولار ما عدا cashSdg و bankSdg */
export interface AccountingOverviewCards {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  realizedFx: number;
  netProfit: number;
  supplierDebts: number;
  tailorsPayable: number;
  /** مستحقات أخرى على المحل: متبقي أصول/مصروفات (رصيد OTHER_PAYABLES) */
  otherPayables?: number;
  customerAdvances: number;
  capital: number;
  cashUsd: number;
  cashSdg: number;
  bankUsd: number;
  bankSdg: number;
  totalLiquidityUsd: number;
  unrealizedFxUsd: number;
  assets: number;
  inventory: number;
  workInProgress: number;
  /** رصيد DEFERRED_COGS: تكلفة بضاعة مباعة بالآجل لم يُحصَّل ثمنها بعد (أصل) */
  deferredCogs?: number;
  tailorAdvances: number;
  /** سلف الموظفين (رصيد EMPLOYEE_ADVANCES): أصل */
  employeeAdvances?: number;
}

export interface AccountingOverviewMonth {
  month: number;
  label: string;
  revenue: number;
  cogs: number;
  expenses: number;
  profit: number;
}

export interface AccountingOverviewExpense {
  account: AccountingAccount;
  label: string;
  value: number;
}

/** ديون العملاء: الفواتير الآجلة المفتوحة (لقطة حالية، المتبقي بالجنيه) */
export interface AccountingReceivables {
  posCredit: ReceivablesBucket;
  tailoringInProgress: ReceivablesBucket;
  total: ReceivablesBucket;
  openCount: number;
  overdueCount: number;
  totalRemainingSdg: number;
  totalUsdAtSale: number;
  totalUsdNow: number;
  totalLossUsd: number;
}

export interface AccountingPayablesBucket {
  count: number;
  overdueCount: number;
  remainingSdg: number;
  remainingUsdNative: number;
  /** الرصيد الدفتري بالدولار (حساب OTHER_PAYABLES) */
  bookUsd: number;
}

/** المستحقات على المحل: متبقي الأصول والمصروفات (جدول المستحقات) وديون الموردين (المشتريات) */
export interface AccountingPayables {
  assets: AccountingPayablesBucket;
  expenses: AccountingPayablesBucket;
  supplierDebts: number;
  totalUsd: number;
}

export interface AccountingOverview {
  year: number;
  /** السنوات المالية المتاحة (الأحدث أولًا) */
  years?: number[];
  currency?: "USD";
  exchangeRate?: number | null;
  cards: AccountingOverviewCards;
  receivables?: AccountingReceivables;
  payables?: AccountingPayables;
  monthly: AccountingOverviewMonth[];
  expenseBreakdown: AccountingOverviewExpense[];
}

export interface AccountingOverviewResponse {
  data: AccountingOverview;
}

export async function getAccountingOverview(
  year?: number,
): Promise<AccountingOverviewResponse> {
  return serverFetch<AccountingOverviewResponse>(`${API_BASE_URL}/overview`, {
    method: "GET",

    params: {
      year,
    },

    next: {
      tags: [
        "accounting-overview",
        `accounting-overview-${year ?? new Date().getFullYear()}`,
      ],
    },
  });
}

/* =========================================================
   CURRENCY EXCHANGE (تحويل جنيه ⇄ دولار)
========================================================= */

export async function createCurrencyExchange(
  payload: CurrencyExchangeInput,
  options: { idempotencyKey?: string } = {},
) {
  return serverFetch<{
    message: string;
    data: {
      reference: string;
      actual_rate: number;
      system_rate: number;
      fx_result_usd: number;
    };
  }>(`${API_BASE_URL}/exchange`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
  });
}

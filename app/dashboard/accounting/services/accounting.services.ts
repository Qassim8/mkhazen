import { serverFetch } from "@/lib/api-client";

import {
  AccountingAccount,
  AccountingQueryInput,
  Asset,
  AssetInput,
  CreateManualJournalEntryInput,
  CurrencyExchangeInput,
  JournalEntry,
  JournalEntryType,
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
): Promise<ManualJournalEntryResponse> {
  return serverFetch<ManualJournalEntryResponse>(`${API_BASE_URL}/manual`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
    paymentMethod: (raw.payment_method === "BANK"
      ? "BANK"
      : "CASH") as Asset["paymentMethod"],
    reference: raw.reference != null ? String(raw.reference) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    createdAt: String(raw.created_at ?? ""),
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

export async function createAsset(payload: AssetInput): Promise<AssetResponse> {
  const response = await serverFetch<{
    message?: string;
    data: Record<string, unknown>;
  }>(`${API_BASE_URL}/assets`, {
    method: "POST",
    body: JSON.stringify(payload),
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
  SUPPLIERS: "الموردون",
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
  TAILORING_MATERIAL: "مواد تفصيل",
  PRODUCTION: "إنتاج",
  COGS: "تكلفة البضاعة المباعة",
  EXPENSE: "مصروف",
  ASSET: "أصل",
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
  tailorAdvances: number;
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

export interface AccountingOverview {
  year: number;
  currency?: "USD";
  exchangeRate?: number | null;
  cards: AccountingOverviewCards;
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

export async function createCurrencyExchange(payload: CurrencyExchangeInput) {
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
  });
}

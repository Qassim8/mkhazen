import { serverFetch } from "@/lib/api-client";

import {
  AccountingAccount,
  AccountingQueryInput,
  Asset,
  AssetInput,
  CreateManualJournalEntryInput,
  JournalEntry,
  JournalEntryType,
} from "../schemas/accounting.schema";

/* =========================================================
   API
========================================================= */

const API_BASE_URL = "/api/accounting";

/* =========================================================
   RESPONSE TYPES
========================================================= */

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
  revenue: number;
  expenses: number;
  netProfit: number;

  supplierDebts: number;

  bank: number;
  cash: number;

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
}

export interface AssetResponse {
  message?: string;
  data: Asset;
}

/* =========================================================
   ACCOUNTING ENTRIES
========================================================= */

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

/* =========================================================
   GET ONE JOURNAL ENTRY
========================================================= */

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

/* =========================================================
   ACCOUNTING SUMMARY
========================================================= */

export async function getAccountingSummary(): Promise<AccountingSummaryResponse> {
  return serverFetch<AccountingSummaryResponse>(`${API_BASE_URL}/summary`, {
    method: "GET",

    next: {
      tags: ["accounting-summary"],
    },
  });
}

/* =========================================================
   MANUAL JOURNAL ENTRY
========================================================= */

export async function createManualJournalEntry(
  payload: CreateManualJournalEntryInput,
): Promise<ManualJournalEntryResponse> {
  return serverFetch<ManualJournalEntryResponse>(`${API_BASE_URL}/manual`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   ASSETS
========================================================= */

export interface AssetsResponse {
  data: Asset[];
}

export interface AssetResponse {
  message?: string;
  data: Asset;
}

function mapAsset(raw: Record<string, unknown>): Asset {
  return {
    id: String(raw.id ?? ""),

    branchId: String(raw.branch_id ?? ""),

    createdBy: raw.created_by != null ? String(raw.created_by) : null,

    name: String(raw.name ?? ""),

    category: String(raw.category ?? "OTHER") as Asset["category"],

    purchaseValue: Number(raw.purchase_value ?? 0),

    purchaseDate: String(raw.purchase_date ?? ""),

    paymentMethod: (raw.payment_method === "BANK"
      ? "BANK"
      : "CASH") as Asset["paymentMethod"],

    reference: raw.reference != null ? String(raw.reference) : null,

    notes: raw.notes != null ? String(raw.notes) : null,

    createdAt: String(raw.created_at ?? ""),
  };
}

export async function getAssets(): Promise<AssetsResponse> {
  const response = await serverFetch<{
    data: Record<string, unknown>[];
  }>(`${API_BASE_URL}/assets`, {
    method: "GET",

    next: {
      tags: ["accounting-assets"],
    },
  });

  return {
    data: (response.data ?? []).map(mapAsset),
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

/* =========================================================
   ACCOUNT LABELS
========================================================= */

export const ACCOUNT_LABELS: Record<AccountingAccount, string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  INVENTORY: "المخزون",
  SUPPLIERS: "الموردون",
  CAPITAL: "رأس المال",
  SALES: "المبيعات",
  ELECTRICITY: "الكهرباء",
  WATER: "الماء",
  INTERNET: "الإنترنت",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  ASSETS: "الأصول",
  OTHER_EXPENSE: "مصروفات أخرى",
  OTHER_INCOME: "إيرادات أخرى",
};

/* =========================================================
   ENTRY TYPE LABELS
========================================================= */

export const ENTRY_TYPE_LABELS: Record<JournalEntryType, string> = {
  CAPITAL: "رأس مال",
  PURCHASE: "شراء",
  PURCHASE_PAYMENT: "دفع للمورد",
  SALE: "بيع",
  EXPENSE: "مصروف",
  ASSET: "أصل",
  OTHER: "أخرى",
};

/* =========================================================
   ACCOUNTING OVERVIEW
========================================================= */

export interface AccountingOverviewCards {
  revenue: number;
  expenses: number;
  netProfit: number;
  supplierDebts: number;
  bank: number;
  cash: number;
  assets: number;
  inventory: number;
}

export interface AccountingOverviewMonth {
  month: number;
  label: string;
  revenue: number;
  expenses: number;
}

export interface AccountingOverviewExpense {
  account: AccountingAccount;
  label: string;
  value: number;
}

export interface AccountingOverview {
  year: number;
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

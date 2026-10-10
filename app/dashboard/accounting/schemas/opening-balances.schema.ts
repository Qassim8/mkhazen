import { z } from "zod";

import { assetCategoryEnum } from "./accounting.schema";

/**
 * الأرصدة الافتتاحية — نفس قواعد دالة record_opening_balances في قاعدة البيانات
 * (database/migrations/20261010_05_opening_balances.sql). القاعدة هي المرجع النهائي.
 */

const currencyEnum = z.enum(["USD", "SDG"]);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح");
const amount = z.number({ error: "المبلغ مطلوب" }).positive("المبلغ يجب أن يكون أكبر من صفر").max(1_000_000_000_000);

export const openingCashLineSchema = z.object({
  account: z.enum(["CASH", "BANK"]),
  currency: currencyEnum,
  amount,
});

export const openingAssetLineSchema = z.object({
  name: z.string().trim().min(1, "اسم الأصل مطلوب").max(255, "اسم الأصل طويل جدًا"),
  category: assetCategoryEnum,
  currency: currencyEnum,
  value: amount,
  purchaseDate: dateOnly.nullable().optional(),
});

export const openingSupplierDebtSchema = z.object({
  supplierId: z.string().uuid("اختر المورد"),
  amount,
  reference: z.string().trim().max(100, "المرجع طويل جدًا").nullable().optional(),
});

export const openingBalancesSchema = z.object({
  asOf: dateOnly,
  cash: z.array(openingCashLineSchema).max(4).default([]),
  assets: z.array(openingAssetLineSchema).max(200).default([]),
  supplierDebts: z.array(openingSupplierDebtSchema).max(500).default([]),
  notes: z.string().trim().max(500).nullable().optional(),
  dryRun: z.boolean().default(true),
});

export type OpeningBalancesInput = z.input<typeof openingBalancesSchema>;
export type OpeningCashLine = z.infer<typeof openingCashLineSchema>;
export type OpeningAssetLine = z.infer<typeof openingAssetLineSchema>;
export type OpeningSupplierDebt = z.infer<typeof openingSupplierDebtSchema>;

export interface OpeningBalancesStatus {
  asOf: string | null;
  today: string;
  currentRate: number | null;
  cash: { account: "CASH" | "BANK"; currency: "USD" | "SDG"; amount: number; amountUsd: number }[];
  assets: { id: string; name: string; category: string; currency: "USD" | "SDG"; value: number; valueUsd: number; purchaseDate: string }[];
  supplierDebts: { orderId: string; orderNumber: string; supplierId: string; supplierName: string; amount: number; paid: number }[];
  openingStock: { entries: number; totalUsd: number };
  manualCapitalUsd: number;
  firstOperationAt: string | null;
}

export interface OpeningBalancesEntry {
  kind: "CASH" | "ASSET" | "SUPPLIER_DEBT";
  label: string;
  debit: string;
  credit: string;
  currency: "USD" | "SDG";
  amount: number;
  amountUsd: number;
}

export interface OpeningBalancesResult {
  dryRun: boolean;
  asOf: string;
  exchangeRate: number | null;
  entries: OpeningBalancesEntry[];
  capitalChangeUsd: number;
}

/**
 * =====================================================================
 * lib/currency.ts — مرجع واحد لكل ما يخص العملتين في النظام
 * =====================================================================
 * USD: عملة الحسابات (تكلفة، أسعار المنتجات، مشتريات، أرباح).
 * SDG: عملة التعامل مع الزبون (الكاشير، التفصيل، الاسترداد).
 */

export type CurrencyCode = "USD" | "SDG";

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "دولار",
  SDG: "جنيه سوداني",
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  SDG: "ج.س",
};

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 1,234.50 $ */
export function formatUSD(value: unknown) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value))} $`;
}

/** 1,234,500 ج.س (الجنيه بدون كسور في العرض إلا لو موجودة) */
export function formatSDG(value: unknown) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value))} ج.س`;
}

export function formatMoney(value: unknown, currency: CurrencyCode) {
  return currency === "USD" ? formatUSD(value) : formatSDG(value);
}

/** دولار ← جنيه بسعر الصرف */
export function usdToSdg(usd: unknown, rate: number | null | undefined) {
  if (!rate || rate <= 0) return 0;
  return roundMoney(toNumber(usd) * rate);
}

/** جنيه ← دولار بسعر الصرف */
export function sdgToUsd(sdg: unknown, rate: number | null | undefined) {
  if (!rate || rate <= 0) return 0;
  return roundMoney(toNumber(sdg) / rate);
}

export function formatRate(rate: number | null | undefined) {
  if (!rate) return "—";
  return `1$ = ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(rate)} ج.س`;
}

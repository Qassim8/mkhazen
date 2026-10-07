/**
 * lib/reports/report-filters.ts — أنواع التقارير ودوال الفلاتر
 * (بدون أي استيراد سيرفر، آمن للاستخدام في مكونات العميل)
 */

/* =====================================================================
   الفلاتر
===================================================================== */

export const REPORT_PRESETS = {
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  last_month: "الشهر الماضي",
  quarter: "هذا الربع",
  year: "هذه السنة",
  custom: "فترة مخصصة",
} as const;

export type ReportPreset = keyof typeof REPORT_PRESETS;

export type ReportTab = "summary" | "products" | "categories" | "inventory";

export interface ReportFilters {
  preset: ReportPreset;
  /** YYYY-MM-DD بتوقيت السودان (شامل) */
  from: string;
  /** YYYY-MM-DD بتوقيت السودان (شامل) */
  to: string;
  categoryId: string | null;
  productId: string | null;
}

const TZ_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Khartoum (بدون توقيت صيفي)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localToday() {
  const local = new Date(Date.now() + TZ_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), dow: local.getUTCDay() };
}

function ymd(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
}

/** بداية اليوم المحلي كـ UTC */
export function localStartUtc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MS);
}

export function resolveReportFilters(
  params: Record<string, string | string[] | undefined>,
): ReportFilters {
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const presetParam = get("preset") as ReportPreset | undefined;
  const preset: ReportPreset =
    presetParam && presetParam in REPORT_PRESETS ? presetParam : "month";

  const { y, m, d, dow } = localToday();
  const today = ymd(y, m, d);

  let from = today;
  let to = today;

  switch (preset) {
    case "today":
      break;
    case "week": {
      // الأسبوع يبدأ السبت
      const sinceSaturday = (dow + 1) % 7;
      from = ymd(y, m, d - sinceSaturday);
      break;
    }
    case "last_month":
      from = ymd(y, m - 1, 1);
      to = ymd(y, m, 0);
      break;
    case "quarter":
      from = ymd(y, Math.floor(m / 3) * 3, 1);
      break;
    case "year":
      from = ymd(y, 0, 1);
      break;
    case "custom": {
      const f = get("from");
      const t = get("to");
      from = f && DATE_RE.test(f) ? f : ymd(y, m, 1);
      to = t && DATE_RE.test(t) ? t : today;
      if (from > to) [from, to] = [to, from];
      break;
    }
    default:
      from = ymd(y, m, 1);
  }

  const categoryId = get("categoryId");
  const productId = get("productId");

  return {
    preset,
    from,
    to,
    categoryId: categoryId && UUID_RE.test(categoryId) ? categoryId : null,
    productId: productId && UUID_RE.test(productId) ? productId : null,
  };
}

export function filtersToSearchParams(filters: ReportFilters) {
  const params = new URLSearchParams();
  params.set("preset", filters.preset);
  if (filters.preset === "custom") {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.productId) params.set("productId", filters.productId);
  return params;
}

/* =====================================================================
   أنواع النتيجة
===================================================================== */

export interface ReportSummary {
  revenue: number;
  posRevenue: number;
  tailoringRevenue: number;
  otherIncome: number;
  collectedSdg: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: number;
  giftsCost: number;
  realizedFx: number;
  netProfit: number;
  netMargin: number;
  posInvoices: number;
  tailoringDelivered: number;
  avgInvoiceUsd: number;
  avgInvoiceSdg: number;
  itemsSold: number;
  discountsSdg: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  revenue: number;
  cogs: number;
  expenses: number;
  profit: number;
}

export interface ProductRow {
  productId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  giftQuantity: number;
  invoices: number;
  revenueSdg: number;
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  margin: number;
}

export interface CategoryRow {
  categoryId: string | null;
  name: string;
  products: number;
  quantity: number;
  revenueSdg: number;
  revenueUsd: number;
  costUsd: number;
  profitUsd: number;
  margin: number;
  share: number;
}

export type StockStatus = "OUT" | "LOW" | "OK";

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  avgCostUsd: number;
  valueUsd: number;
  sellingPriceUsd: number;
  sellingPriceSdg: number | null;
  status: StockStatus;
}

export interface ReportData {
  filters: ReportFilters;
  periodLabel: string;
  generatedAt: string;
  exchangeRate: number | null;
  options: {
    categories: { id: string; name: string }[];
    products: { id: string; name: string; categoryId: string | null }[];
  };
  summary: ReportSummary;
  trend: TrendPoint[];
  trendGranularity: "day" | "month";
  expenses: { account: string; label: string; value: number }[];
  products: ProductRow[];
  categories: CategoryRow[];
  inventory: InventoryRow[];
  inventoryTotals: {
    variants: number;
    units: number;
    valueUsd: number;
    valueSdg: number | null;
    lowStock: number;
    outOfStock: number;
  };
}


/** وصف الفلاتر الفعالة كنصوص (للطباعة وExcel) */
export function describeFilters(report: ReportData): string[] {
  const labels: string[] = [];
  const { categoryId, productId } = report.filters;

  if (categoryId) {
    const category = report.options.categories.find((c) => c.id === categoryId);
    labels.push(`التصنيف: ${category?.name ?? "—"}`);
  }

  if (productId) {
    const product = report.options.products.find((p) => p.id === productId);
    labels.push(`المنتج: ${product?.name ?? "—"}`);
  }

  return labels;
}

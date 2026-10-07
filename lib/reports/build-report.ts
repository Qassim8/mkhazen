/**
 * =====================================================================
 * lib/reports/build-report.ts — بيانات صفحة التقارير (سيرفر فقط)
 * =====================================================================
 * مصدر واحد للأرقام تستخدمه: صفحة التقارير، API التقارير، وتصدير Excel.
 *
 * القواعد:
 * • الأرباح والتكاليف بالدولار (amount_usd / total_price_usd / unit_cost).
 * • المبالغ اللي اتحصّلت من الزبون بالجنيه تظهر بجانبها للمرجعية.
 * • خصم الفاتورة بيتوزع على بنودها بنسبة قيمتها (عشان ربح المنتج يبقى صافي).
 * • الهدايا: مش إيراد، كميتها تظهر منفصلة وتكلفتها ضمن المصروفات.
 * • التوقيت: السودان (Africa/Khartoum = UTC+2).
 * • كل الاستعلامات بتتجاب على صفحات (Supabase بيرجع 1000 صف كحد أقصى).
 */

import { fetchAll, fetchIn } from "@/lib/supabase-fetch-all";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import {
  computePerformance,
  EXPENSE_CONFIG,
  LedgerEntry,
  normalizeAccount,
} from "@/app/api/accounting/_lib/ledger";

import {
  REPORT_PRESETS,
  localStartUtc,
  type CategoryRow,
  type InventoryRow,
  type ProductRow,
  type ReportData,
  type ReportFilters,
  type StockStatus,
  type TrendPoint,
} from "./report-filters";

export * from "./report-filters";

const TZ_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Khartoum

/* =====================================================================
   أدوات
===================================================================== */

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const pct = (part: number, whole: number) => (whole > 0 ? r2((part / whole) * 100) : 0);

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function localKey(iso: string, granularity: "day" | "month") {
  const local = new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString();
  return granularity === "day" ? local.slice(0, 10) : local.slice(0, 7);
}

function buildBuckets(from: string, to: string, granularity: "day" | "month"): TrendPoint[] {
  const buckets: TrendPoint[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);

  if (granularity === "day") {
    const cursor = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.push({
        key,
        label: `${cursor.getUTCDate()} ${MONTHS[cursor.getUTCMonth()]}`,
        revenue: 0, cogs: 0, expenses: 0, profit: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(fy, fm - 1, 1));
    const end = new Date(Date.UTC(ty, tm - 1, 1));
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 7);
      buckets.push({
        key,
        label: `${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
        revenue: 0, cogs: 0, expenses: 0, profit: 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return buckets;
}

function variantLabel(variant: Record<string, unknown>) {
  const parts = [
    variant.colorName ? String(variant.colorName) : null,
    variant.size ? `مقاس ${variant.size}` : null,
    variant.length != null ? `طول ${variant.length}` : null,
    variant.width != null ? `عرض ${variant.width}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" • ") : "افتراضي";
}

/* =====================================================================
   بناء التقرير
===================================================================== */

export async function buildReport(filters: ReportFilters): Promise<ReportData> {
  if (!MAIN_BRANCH_ID) throw new Error("معرف الفرع غير مُعرّف");

  const startIso = localStartUtc(filters.from).toISOString();
  const endExclusive = new Date(localStartUtc(filters.to).getTime() + 24 * 60 * 60 * 1000);
  const endIso = endExclusive.toISOString();

  const days = Math.round(
    (localStartUtc(filters.to).getTime() - localStartUtc(filters.from).getTime()) / 86_400_000,
  ) + 1;
  const granularity: "day" | "month" = days <= 62 ? "day" : "month";

  /* ---------------- جلب البيانات بالتوازي ---------------- */

  const [entries, orders, templates, categories, variants, rateResult] = await Promise.all([
    fetchAll<LedgerEntry & { sales_order_id: string | null }>((from, to) =>
      supabaseAdmin
        .from("journal_entries")
        .select("amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at, sales_order_id")
        .eq("branch_id", MAIN_BRANCH_ID)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      order_type: string;
      tailoring_purpose: string | null;
      subtotal: number;
      discount_amount: number;
      total_amount: number;
      total_amount_usd: number | null;
      exchange_rate_used: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from("sales_orders")
        .select("id, order_type, tailoring_purpose, subtotal, discount_amount, total_amount, total_amount_usd, exchange_rate_used")
        .eq("branch_id", MAIN_BRANCH_ID)
        .eq("status", "COMPLETED")
        .gte("completed_at", startIso)
        .lt("completed_at", endIso)
        .order("completed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string; categoryId: string | null; sellingUnit: string | null }>((from, to) =>
      supabaseAdmin
        .from("product_templates")
        .select('id, name, "categoryId", "sellingUnit"')
        .order("name", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabaseAdmin.from("categories").select("id, name").order("name").range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabaseAdmin
        .from("product_variants")
        .select(
          'id, "templateId", sku, "colorName", size, length, width, "stockQuantity", "minStockLevel", "averageCost", "purchasePrice", "sellingPrice", "isActive"',
        )
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
  ]);

  const exchangeRate = rateResult.data != null ? Number(rateResult.data) : null;

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const matchesProductFilter = (templateId: string) => {
    if (filters.productId && templateId !== filters.productId) return false;
    if (filters.categoryId) {
      const template = templateMap.get(templateId);
      if (!template || template.categoryId !== filters.categoryId) return false;
    }
    return true;
  };

  /* ---------------- الملخص المالي (على مستوى المتجر) ---------------- */

  const performance = computePerformance(entries);

  // نوع الطلب لكل قيد مبيعات (كاشير / تفصيل)
  const orderIdsInEntries = [
    ...new Set(entries.map((e) => e.sales_order_id).filter((id): id is string => Boolean(id))),
  ];
  const knownTypes = new Map(orders.map((o) => [o.id, o.order_type]));
  const missingIds = orderIdsInEntries.filter((id) => !knownTypes.has(id));
  const extraOrders = await fetchIn<{ id: string; order_type: string }>(missingIds, (chunk, from, to) =>
    supabaseAdmin
      .from("sales_orders")
      .select("id, order_type")
      .in("id", chunk)
      .order("id")
      .range(from, to),
  );
  for (const order of extraOrders) knownTypes.set(order.id, order.order_type);

  let posRevenue = 0;
  let tailoringRevenue = 0;
  let otherIncome = 0;
  let collectedSdg = 0;
  let giftsCost = 0;

  const trend = buildBuckets(filters.from, filters.to, granularity);
  const trendByKey = new Map(trend.map((point) => [point.key, point]));

  for (const entry of entries) {
    const usd = num(entry.amount_usd);
    const bucket = entry.created_at ? trendByKey.get(localKey(entry.created_at, granularity)) : undefined;

    const sign =
      entry.credit_account === "SALES" ? 1 : entry.debit_account === "SALES" ? -1 : 0;

    if (sign !== 0) {
      const type = entry.sales_order_id ? knownTypes.get(entry.sales_order_id) : null;
      if (type === "TAILORING") tailoringRevenue += sign * usd;
      else posRevenue += sign * usd;

      if (entry.currency === "SDG" && (entry.debit_account === "CASH" || entry.debit_account === "BANK")) {
        collectedSdg += num(entry.amount);
      }
      if (bucket) bucket.revenue += sign * usd;
    }

    if (entry.credit_account === "OTHER_INCOME") {
      otherIncome += usd;
      if (bucket) bucket.revenue += usd;
    }

    if (bucket) {
      if (entry.debit_account === "COGS") bucket.cogs += usd;
      if (entry.credit_account === "COGS") bucket.cogs -= usd;
      if (normalizeAccount(entry.debit_account) in EXPENSE_CONFIG) {
        bucket.expenses += usd;
      }
    }

    if (normalizeAccount(entry.debit_account) === "GIFTS") giftsCost += usd;
  }

  for (const point of trend) {
    point.revenue = r2(point.revenue);
    point.cogs = r2(point.cogs);
    point.expenses = r2(point.expenses);
    point.profit = r2(point.revenue - point.cogs - point.expenses);
  }

  /* ---------------- المبيعات حسب المنتج (فواتير الكاشير) ---------------- */

  const posOrders = orders.filter((o) => o.order_type === "POS");
  const orderFactor = new Map<string, { factor: number; rate: number | null }>();
  let discountsSdg = 0;

  for (const order of posOrders) {
    const subtotal = num(order.subtotal);
    const discount = num(order.discount_amount);
    discountsSdg += discount;
    orderFactor.set(order.id, {
      factor: subtotal > 0 ? Math.max(0, 1 - discount / subtotal) : 1,
      rate: order.exchange_rate_used != null ? num(order.exchange_rate_used) : null,
    });
  }

  const items = await fetchIn<{
    sales_order_id: string;
    template_id: string;
    quantity: number;
    total_price: number;
    total_price_usd: number | null;
    unit_cost: number;
    is_gift: boolean;
  }>(
    posOrders.map((o) => o.id),
    (chunk, from, to) =>
      supabaseAdmin
        .from("sales_order_items")
        .select("id, sales_order_id, template_id, quantity, total_price, total_price_usd, unit_cost, is_gift")
        .in("sales_order_id", chunk)
        .order("id")
        .range(from, to),
  );

  const productAgg = new Map<string, ProductRow & { orderSet: Set<string> }>();
  let itemsSold = 0;

  for (const item of items) {
    const quantity = num(item.quantity);
    if (!item.is_gift) itemsSold += quantity;

    if (!matchesProductFilter(item.template_id)) continue;

    const template = templateMap.get(item.template_id);
    const row =
      productAgg.get(item.template_id) ??
      {
        productId: item.template_id,
        name: template?.name ?? "منتج محذوف",
        category: template?.categoryId ? categoryName.get(template.categoryId) ?? "بدون تصنيف" : "بدون تصنيف",
        unit: template?.sellingUnit ?? "",
        quantity: 0,
        giftQuantity: 0,
        invoices: 0,
        revenueSdg: 0,
        revenueUsd: 0,
        costUsd: 0,
        profitUsd: 0,
        margin: 0,
        orderSet: new Set<string>(),
      };

    row.orderSet.add(item.sales_order_id);

    if (item.is_gift) {
      row.giftQuantity += quantity;
    } else {
      const meta = orderFactor.get(item.sales_order_id) ?? { factor: 1, rate: null };
      const grossSdg = num(item.total_price);
      const grossUsd =
        item.total_price_usd != null
          ? num(item.total_price_usd)
          : meta.rate
            ? grossSdg / meta.rate
            : 0;

      row.quantity += quantity;
      row.revenueSdg += grossSdg * meta.factor;
      row.revenueUsd += grossUsd * meta.factor;
      row.costUsd += quantity * num(item.unit_cost);
    }

    productAgg.set(item.template_id, row);
  }

  const products: ProductRow[] = [...productAgg.values()]
    .map(({ orderSet, ...row }) => {
      const revenueUsd = r2(row.revenueUsd);
      const costUsd = r2(row.costUsd);
      const profitUsd = r2(revenueUsd - costUsd);
      return {
        ...row,
        invoices: orderSet.size,
        quantity: r2(row.quantity),
        giftQuantity: r2(row.giftQuantity),
        revenueSdg: r2(row.revenueSdg),
        revenueUsd,
        costUsd,
        profitUsd,
        margin: pct(profitUsd, revenueUsd),
      };
    })
    .sort((a, b) => b.revenueUsd - a.revenueUsd);

  /* ---------------- المبيعات حسب التصنيف ---------------- */

  const categoryAgg = new Map<string, CategoryRow>();
  const totalRevenueUsd = products.reduce((sum, p) => sum + p.revenueUsd, 0);

  for (const product of products) {
    const categoryId = templateMap.get(product.productId)?.categoryId ?? null;
    const key = categoryId ?? "none";
    const row =
      categoryAgg.get(key) ??
      {
        categoryId,
        name: product.category,
        products: 0,
        quantity: 0,
        revenueSdg: 0,
        revenueUsd: 0,
        costUsd: 0,
        profitUsd: 0,
        margin: 0,
        share: 0,
      };

    row.products += 1;
    row.quantity += product.quantity;
    row.revenueSdg += product.revenueSdg;
    row.revenueUsd += product.revenueUsd;
    row.costUsd += product.costUsd;
    row.profitUsd += product.profitUsd;
    categoryAgg.set(key, row);
  }

  const categoriesReport: CategoryRow[] = [...categoryAgg.values()]
    .map((row) => ({
      ...row,
      quantity: r2(row.quantity),
      revenueSdg: r2(row.revenueSdg),
      revenueUsd: r2(row.revenueUsd),
      costUsd: r2(row.costUsd),
      profitUsd: r2(row.profitUsd),
      margin: pct(row.profitUsd, row.revenueUsd),
      share: pct(row.revenueUsd, totalRevenueUsd),
    }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd);

  /* ---------------- المخزون (حالي، لا يتأثر بالفترة) ---------------- */

  const inventory: InventoryRow[] = variants
    .filter((v) => v.isActive !== false && matchesProductFilter(String(v.templateId)))
    .map((variant) => {
      const template = templateMap.get(String(variant.templateId));
      const stock = num(variant.stockQuantity);
      const minStock = num(variant.minStockLevel);
      const avgCostUsd = num(variant.averageCost) || num(variant.purchasePrice);
      const sellingPriceUsd = num(variant.sellingPrice);
      const status: StockStatus = stock <= 0 ? "OUT" : stock <= minStock ? "LOW" : "OK";

      return {
        variantId: String(variant.id),
        productId: String(variant.templateId),
        productName: template?.name ?? "منتج",
        variantLabel: variantLabel(variant),
        sku: variant.sku ? String(variant.sku) : null,
        category: template?.categoryId ? categoryName.get(template.categoryId) ?? "بدون تصنيف" : "بدون تصنيف",
        unit: template?.sellingUnit ?? "",
        stock: r2(stock),
        minStock: r2(minStock),
        avgCostUsd: r2(avgCostUsd),
        valueUsd: r2(Math.max(stock, 0) * avgCostUsd),
        sellingPriceUsd: r2(sellingPriceUsd),
        sellingPriceSdg: exchangeRate ? r2(sellingPriceUsd * exchangeRate) : null,
        status,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

  const inventoryValueUsd = r2(inventory.reduce((sum, row) => sum + row.valueUsd, 0));

  /* ---------------- النتيجة ---------------- */

  const posTotalsUsd = posOrders.reduce(
    (sum, o) =>
      sum +
      (o.total_amount_usd != null
        ? num(o.total_amount_usd)
        : o.exchange_rate_used
          ? num(o.total_amount) / num(o.exchange_rate_used)
          : 0),
    0,
  );
  const posTotalsSdg = posOrders.reduce((sum, o) => sum + num(o.total_amount), 0);

  const periodLabel =
    filters.preset === "custom"
      ? `من ${filters.from} إلى ${filters.to}`
      : `${REPORT_PRESETS[filters.preset]} (${filters.from} — ${filters.to})`;

  return {
    filters,
    periodLabel,
    generatedAt: new Date().toISOString(),
    exchangeRate,
    options: {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      products: templates.map((t) => ({ id: t.id, name: t.name, categoryId: t.categoryId })),
    },
    summary: {
      revenue: performance.revenue,
      posRevenue: r2(posRevenue),
      tailoringRevenue: r2(tailoringRevenue),
      otherIncome: r2(otherIncome),
      collectedSdg: r2(collectedSdg),
      cogs: performance.cogs,
      grossProfit: performance.grossProfit,
      grossMargin: pct(performance.grossProfit, performance.revenue),
      expenses: performance.expenses,
      giftsCost: r2(giftsCost),
      realizedFx: performance.realizedFx,
      netProfit: performance.netProfit,
      netMargin: pct(performance.netProfit, performance.revenue),
      posInvoices: posOrders.length,
      // المسلّم للزبون بس (طلبات التصنيع للمخزون مش بيع)
      tailoringDelivered: orders.filter(
        (o) => o.order_type === "TAILORING" && o.tailoring_purpose === "CUSTOMER",
      ).length,
      avgInvoiceUsd: posOrders.length ? r2(posTotalsUsd / posOrders.length) : 0,
      avgInvoiceSdg: posOrders.length ? r2(posTotalsSdg / posOrders.length) : 0,
      itemsSold: r2(itemsSold),
      discountsSdg: r2(discountsSdg),
    },
    trend,
    trendGranularity: granularity,
    expenses: performance.expenseBreakdown.map(({ account, label, value }) => ({ account, label, value })),
    products,
    categories: categoriesReport,
    inventory,
    inventoryTotals: {
      variants: inventory.length,
      units: r2(inventory.reduce((sum, row) => sum + Math.max(row.stock, 0), 0)),
      valueUsd: inventoryValueUsd,
      valueSdg: exchangeRate ? r2(inventoryValueUsd * exchangeRate) : null,
      lowStock: inventory.filter((row) => row.status === "LOW").length,
      outOfStock: inventory.filter((row) => row.status === "OUT").length,
    },
  };
}

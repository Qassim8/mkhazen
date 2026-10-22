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
 * • الفواتير الآجلة (is_credit): الإيراد والتكلفة هنا هما المحصَّل فقط (مجموع دفعات
 *   الفاتورة)، لا إجمالي الفاتورة؛ المتبقي غير المحصَّل ليس إيرادًا.
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
  type CashierRow,
  type CategoryRow,
  type InventoryRow,
  type ProductRow,
  type ReportData,
  type ReportFilters,
  type StockStatus,
  type TailorRow,
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
      cashier_id: string | null;
      tailor_id: string | null;
      subtotal: number;
      discount_amount: number;
      total_amount: number;
      total_amount_usd: number | null;
      exchange_rate_used: number | null;
      is_credit: boolean | null;
    }>((from, to) =>
      supabaseAdmin
        .from("sales_orders")
        .select("id, order_type, tailoring_purpose, cashier_id, tailor_id, subtotal, discount_amount, total_amount, total_amount_usd, exchange_rate_used, is_credit")
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

  // الفواتير الآجلة: المحصَّل فقط (دفعات الفاتورة)، مش إجمالي الفاتورة
  const creditPayments = await fetchIn<{ id: string; sales_order_id: string; amount: number; amount_usd: number | null }>(
    orders.filter((o) => o.is_credit).map((o) => o.id),
    (chunk, from, to) =>
      supabaseAdmin
        .from("sales_order_payments")
        .select("id, sales_order_id, amount, amount_usd")
        .in("sales_order_id", chunk)
        .order("id")
        .range(from, to),
  );
  const creditCollected = new Map<string, { sdg: number; usd: number }>();
  for (const payment of creditPayments) {
    const current = creditCollected.get(payment.sales_order_id) ?? { sdg: 0, usd: 0 };
    current.sdg += num(payment.amount);
    current.usd += num(payment.amount_usd);
    creditCollected.set(payment.sales_order_id, current);
  }
  const orderCollectedSdg = (o: { id: string; is_credit: boolean | null; total_amount: number }) =>
    o.is_credit ? creditCollected.get(o.id)?.sdg ?? 0 : num(o.total_amount);
  /** نسبة المحصَّل من إجمالي الفاتورة (1 لغير الآجل)، وتُستخدم لتوزيع الإيراد والتكلفة على المنتجات */
  const orderCollectedShare = (o: { id: string; is_credit: boolean | null; total_amount: number }) =>
    o.is_credit
      ? num(o.total_amount) > 0
        ? Math.min(1, (creditCollected.get(o.id)?.sdg ?? 0) / num(o.total_amount))
        : 0
      : 1;

  const orderFactor = new Map<string, { factor: number; rate: number | null; share: number }>();
  let discountsSdg = 0;

  for (const order of posOrders) {
    const subtotal = num(order.subtotal);
    const discount = num(order.discount_amount);
    discountsSdg += discount;
    orderFactor.set(order.id, {
      factor: subtotal > 0 ? Math.max(0, 1 - discount / subtotal) : 1,
      rate: order.exchange_rate_used != null ? num(order.exchange_rate_used) : null,
      share: orderCollectedShare(order),
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
    unit_price: number;
    list_unit_price: number | null;
    price_overridden: boolean | null;
  }>(
    posOrders.map((o) => o.id),
    (chunk, from, to) =>
      supabaseAdmin
        .from("sales_order_items")
        .select("id, sales_order_id, template_id, quantity, total_price, total_price_usd, unit_cost, is_gift, unit_price, list_unit_price, price_overridden")
        .in("sales_order_id", chunk)
        .order("id")
        .range(from, to),
  );

  const productAgg = new Map<string, ProductRow & { orderSet: Set<string> }>();
  let itemsSold = 0;

  let manualReductionsSdg = 0;
  let manualIncreasesSdg = 0;

  for (const item of items) {
    const quantity = num(item.quantity);
    if (!item.is_gift) itemsSold += quantity;

    // الأسعار المعدّلة يدويًا في الكاشير (بطلب العميل)
    if (!item.is_gift && item.price_overridden && item.list_unit_price != null) {
      const diff = (num(item.list_unit_price) - num(item.unit_price)) * quantity;
      if (diff > 0) manualReductionsSdg += diff;
      else manualIncreasesSdg += -diff;
    }

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
      const meta = orderFactor.get(item.sales_order_id) ?? { factor: 1, rate: null, share: 1 };
      const grossSdg = num(item.total_price);
      const grossUsd =
        item.total_price_usd != null
          ? num(item.total_price_usd)
          : meta.rate
            ? grossSdg / meta.rate
            : 0;

      row.quantity += quantity;
      row.revenueSdg += grossSdg * meta.factor * meta.share;
      row.revenueUsd += grossUsd * meta.factor * meta.share;
      row.costUsd += quantity * num(item.unit_cost) * meta.share;
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

  /* ---------------- تقارير الكاشير والخياطين ---------------- */

  const orderUsd = (o: { total_amount: number; total_amount_usd: number | null; exchange_rate_used: number | null }) =>
    o.total_amount_usd != null
      ? num(o.total_amount_usd)
      : o.exchange_rate_used
        ? num(o.total_amount) / num(o.exchange_rate_used)
        : 0;

  /** المحصَّل بالدولار: الفاتورة الآجلة = مجموع دفعاتها (كل دفعة بسعر لحظتها) */
  const orderCollectedUsd = (o: {
    id: string;
    is_credit: boolean | null;
    total_amount: number;
    total_amount_usd: number | null;
    exchange_rate_used: number | null;
  }) => (o.is_credit ? creditCollected.get(o.id)?.usd ?? 0 : orderUsd(o));

  // الطلبات اللي ثُبتت أجرة خياطها في الفترة
  const laborOrderIds = [
    ...new Set(
      entries
        .filter((e) => e.entry_type === "TAILOR_COST" && e.credit_account === "TAILORS_PAYABLE" && e.sales_order_id)
        .map((e) => e.sales_order_id as string),
    ),
  ];
  const todayLocal = new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);

  const [staff, laborOrders, tailorPayments, overdueOrders, duesResult] = await Promise.all([
    fetchAll<{ id: string; name: string | null; role: string | null }>((from, to) =>
      supabaseAdmin
        .from("users")
        .select("id, name, role")
        .eq("branchId", MAIN_BRANCH_ID)
        .order("id")
        .range(from, to),
    ),
    fetchIn<{
      id: string;
      tailor_id: string | null;
      tailoring_purpose: string | null;
      tailoring_cost: number | null;
      tailoring_cost_sdg: number | null;
      exchange_rate_used: number | null;
      produced_quantity: number | null;
    }>(laborOrderIds, (chunk, from, to) =>
      supabaseAdmin
        .from("sales_orders")
        .select("id, tailor_id, tailoring_purpose, tailoring_cost, tailoring_cost_sdg, exchange_rate_used, produced_quantity")
        .in("id", chunk)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      tailor_id: string;
      payment_type: string;
      amount: number;
      amount_original: number | null;
      currency: string;
      exchange_rate_used: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from("tailor_commission_payments")
        .select("id, tailor_id, payment_type, amount, amount_original, currency, exchange_rate_used")
        .eq("branch_id", MAIN_BRANCH_ID)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; tailor_id: string | null }>((from, to) =>
      supabaseAdmin
        .from("sales_orders")
        .select("id, tailor_id")
        .eq("branch_id", MAIN_BRANCH_ID)
        .eq("order_type", "TAILORING")
        .in("tailoring_status", ["NEW", "UNDER_TAILORING", "READY_FOR_PICKUP"])
        .lt("expected_delivery_date", todayLocal)
        .order("id")
        .range(from, to),
    ),
    supabaseAdmin.rpc("get_tailor_dues", { p_branch_id: MAIN_BRANCH_ID, p_tailor_id: null }),
  ]);

  if (duesResult.error) throw new Error(`تعذر جلب مستحقات الخياطين: ${duesResult.error.message}`);

  const staffById = new Map(staff.map((u) => [u.id, u]));
  const staffName = (id: string) => staffById.get(id)?.name ?? "مستخدم محذوف";

  // الكاشير
  const itemQtyByOrder = new Map<string, number>();
  for (const item of items) {
    if (item.is_gift) continue;
    itemQtyByOrder.set(item.sales_order_id, (itemQtyByOrder.get(item.sales_order_id) ?? 0) + num(item.quantity));
  }

  const cashierAgg = new Map<string, CashierRow>();
  for (const order of posOrders) {
    const key = order.cashier_id ?? "unknown";
    const row =
      cashierAgg.get(key) ??
      {
        cashierId: key,
        name: order.cashier_id ? staffName(order.cashier_id) : "غير محدد",
        invoices: 0,
        quantity: 0,
        revenueSdg: 0,
        revenueUsd: 0,
        avgInvoiceSdg: 0,
        avgInvoiceUsd: 0,
        discountsSdg: 0,
      };
    row.invoices += 1;
    row.quantity += itemQtyByOrder.get(order.id) ?? 0;
    row.revenueSdg += orderCollectedSdg(order);
    row.revenueUsd += orderCollectedUsd(order);
    row.discountsSdg += num(order.discount_amount);
    cashierAgg.set(key, row);
  }

  const cashiers: CashierRow[] = [...cashierAgg.values()]
    .map((row) => ({
      ...row,
      quantity: r2(row.quantity),
      revenueSdg: r2(row.revenueSdg),
      revenueUsd: r2(row.revenueUsd),
      avgInvoiceSdg: row.invoices ? r2(row.revenueSdg / row.invoices) : 0,
      avgInvoiceUsd: row.invoices ? r2(row.revenueUsd / row.invoices) : 0,
      discountsSdg: r2(row.discountsSdg),
    }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd);

  // الخياطين
  const tailorAgg = new Map<string, TailorRow>();
  const tailorRow = (id: string) => {
    const existing = tailorAgg.get(id);
    if (existing) return existing;
    const row: TailorRow = {
      tailorId: id,
      name: staffName(id),
      executedOrders: 0,
      deliveredOrders: 0,
      producedPieces: 0,
      revenueUsd: 0,
      wagesSdg: 0,
      paidSdg: 0,
      advancesSdg: 0,
      remainingSdg: 0,
      overdueOrders: 0,
    };
    tailorAgg.set(id, row);
    return row;
  };

  for (const user of staff) {
    if (String(user.role ?? "").toLowerCase() === "tailor") tailorRow(user.id);
  }

  for (const order of laborOrders) {
    if (!order.tailor_id) continue;
    const row = tailorRow(order.tailor_id);
    row.executedOrders += 1;
    row.wagesSdg +=
      order.tailoring_cost_sdg != null
        ? num(order.tailoring_cost_sdg)
        : num(order.tailoring_cost) * num(order.exchange_rate_used);
    if (order.tailoring_purpose === "PRODUCTION") row.producedPieces += num(order.produced_quantity);
  }

  for (const order of orders) {
    if (order.order_type !== "TAILORING" || order.tailoring_purpose !== "CUSTOMER" || !order.tailor_id) continue;
    const row = tailorRow(order.tailor_id);
    row.deliveredOrders += 1;
    row.revenueUsd += orderUsd(order);
  }

  for (const payment of tailorPayments) {
    const row = tailorRow(payment.tailor_id);
    const sdg =
      payment.currency === "SDG" && payment.amount_original != null
        ? num(payment.amount_original)
        : num(payment.amount) * num(payment.exchange_rate_used);
    if (payment.payment_type === "DUES_ADVANCE") row.advancesSdg += sdg;
    else row.paidSdg += sdg;
  }

  for (const order of overdueOrders) {
    if (order.tailor_id) tailorRow(order.tailor_id).overdueOrders += 1;
  }

  for (const due of (duesResult.data ?? []) as { tailor_id: string; remaining_sdg: number }[]) {
    tailorRow(due.tailor_id).remainingSdg = num(due.remaining_sdg);
  }

  const tailors: TailorRow[] = [...tailorAgg.values()]
    .map((row) => ({
      ...row,
      producedPieces: r2(row.producedPieces),
      revenueUsd: r2(row.revenueUsd),
      wagesSdg: r2(row.wagesSdg),
      paidSdg: r2(row.paidSdg),
      advancesSdg: r2(row.advancesSdg),
      remainingSdg: r2(row.remainingSdg),
    }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd || b.wagesSdg - a.wagesSdg);

  /* ---------------- النتيجة ---------------- */

  const posTotalsUsd = posOrders.reduce((sum, o) => sum + orderCollectedUsd(o), 0);
  const posTotalsSdg = posOrders.reduce((sum, o) => sum + orderCollectedSdg(o), 0);

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
      manualReductionsSdg: r2(manualReductionsSdg),
      manualIncreasesSdg: r2(manualIncreasesSdg),
    },
    trend,
    trendGranularity: granularity,
    expenses: performance.expenseBreakdown.map(({ account, label, value }) => ({ account, label, value })),
    products,
    categories: categoriesReport,
    inventory,
    cashiers,
    tailors,
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

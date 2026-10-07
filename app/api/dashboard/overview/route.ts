import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { formatProductSize } from "@/app/dashboard/products/utils/product-size";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAllResult, fetchIn } from "@/lib/supabase-fetch-all";
import {
  computePerformance,
  type LedgerEntry,
} from "@/app/api/accounting/_lib/ledger";

const SUDAN_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Khartoum (UTC+2)

const MONTH_LABELS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const DAY_LABELS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

type DashboardPeriod = "week" | "month" | "quarter" | "year";

type JournalEntryRow = {
  amount: number | string | null;
  amount_usd: number | string | null;
  debit_account: string | null;
  credit_account: string | null;
  entry_type: string | null;
  created_at: string;
};

type SalesOrderRow = {
  id: string;
  order_type: "POS" | "TAILORING";
  tailoring_purpose: "CUSTOMER" | "PRODUCTION" | null;
  tailoring_status:
    | "NEW"
    | "UNDER_TAILORING"
    | "READY_FOR_PICKUP"
    | "RECEIVED"
    | "CANCELLED"
    | null;
};

type CategoryRelation = {
  name: string;
} | null;

type ProductTemplateRelation = {
  id: string;
  name: string;
  categories: CategoryRelation | CategoryRelation[];
} | null;

type InventoryVariantRow = {
  id: string;
  sku: string | null;
  colorName: string | null;
  size: string | null;
  stockQuantity: number | string | null;
  minStockLevel: number | string | null;
  product_templates: ProductTemplateRelation | ProductTemplateRelation[];
};

type DashboardMovementRow = {
  id: string;
  movement_type: string;
  quantity: number | string | null;
  created_at: string;
  product_variants:
    | {
        product_templates: ProductTemplateRelation | ProductTemplateRelation[];
      }
    | {
        product_templates: ProductTemplateRelation | ProductTemplateRelation[];
      }[]
    | null;
  users:
    | {
        name: string | null;
      }
    | { name: string | null }[]
    | null;
};

type TailoringOrderRow = {
  id: string;
  order_number: string;
  tailoring_item_name: string | null;
  tailoring_status: "NEW" | "UNDER_TAILORING" | "READY_FOR_PICKUP";
  tailoring_purpose: "CUSTOMER" | "PRODUCTION" | null;
  expected_delivery_date: string | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateAtSudanMidnight(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - SUDAN_OFFSET_MS);
}

function getSudanDateParts(date: Date) {
  const sudanDate = new Date(date.getTime() + SUDAN_OFFSET_MS);

  return {
    year: sudanDate.getUTCFullYear(),
    monthIndex: sudanDate.getUTCMonth(),
    day: sudanDate.getUTCDate(),
    dayOfWeek: sudanDate.getUTCDay(),
  };
}

function getPeriodRange(period: DashboardPeriod, now: Date) {
  const parts = getSudanDateParts(now);
  let start: Date;
  let label: string;

  switch (period) {
    case "week":
      start = dateAtSudanMidnight(
        parts.year,
        parts.monthIndex,
        parts.day - parts.dayOfWeek,
      );
      label = "هذا الأسبوع";
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(parts.monthIndex / 3) * 3;
      start = dateAtSudanMidnight(parts.year, quarterStartMonth, 1);
      label = "هذا الربع";
      break;
    }
    case "year":
      start = dateAtSudanMidnight(parts.year, 0, 1);
      label = "هذه السنة";
      break;
    default:
      start = dateAtSudanMidnight(parts.year, parts.monthIndex, 1);
      label = "هذا الشهر";
  }

  const elapsed = now.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - elapsed);

  return {
    start,
    end: now,
    previousStart,
    previousEnd: start,
    label,
    comparisonLabel: "مقارنة بالفترة السابقة المماثلة",
  };
}

// نفس حساب صفحة المحاسبة والتقارير (مرتجعات، فروق عملة، أسماء الحسابات القديمة)
function getFinancialTotals(entries: JournalEntryRow[]) {
  const performance = computePerformance(entries as unknown as LedgerEntry[]);

  return {
    revenue: performance.revenue,
    expenses: performance.expenses,
    cogs: performance.cogs,
    netProfit: performance.netProfit,
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function isRecognizedSale(order: SalesOrderRow) {
  if (order.order_type === "POS") return true;

  return (
    order.order_type === "TAILORING" &&
    order.tailoring_purpose === "CUSTOMER" &&
    order.tailoring_status === "RECEIVED"
  );
}

function getBucketKey(date: Date, period: DashboardPeriod) {
  const parts = getSudanDateParts(date);
  if (period === "quarter" || period === "year") {
    return `${parts.year}-${String(parts.monthIndex + 1).padStart(2, "0")}`;
  }
  return `${parts.year}-${String(parts.monthIndex + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildTrendBuckets(period: DashboardPeriod, start: Date, end: Date) {
  const buckets: {
    key: string;
    label: string;
    revenue: number;
    expenses: number;
    cogs: number;
    profit: number;
  }[] = [];

  if (period === "quarter" || period === "year") {
    const startParts = getSudanDateParts(start);
    const endParts = getSudanDateParts(end);
    let year = startParts.year;
    let monthIndex = startParts.monthIndex;

    while (
      year < endParts.year ||
      (year === endParts.year && monthIndex <= endParts.monthIndex)
    ) {
      buckets.push({
        key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
        label: MONTH_LABELS[monthIndex],
        revenue: 0,
        expenses: 0,
        cogs: 0,
        profit: 0,
      });
      monthIndex += 1;
      if (monthIndex === 12) {
        year += 1;
        monthIndex = 0;
      }
    }
    return buckets;
  }

  const cursor = dateAtSudanMidnight(
    getSudanDateParts(start).year,
    getSudanDateParts(start).monthIndex,
    getSudanDateParts(start).day,
  );
  const lastDay = dateAtSudanMidnight(
    getSudanDateParts(end).year,
    getSudanDateParts(end).monthIndex,
    getSudanDateParts(end).day,
  );

  while (cursor <= lastDay) {
    const parts = getSudanDateParts(cursor);
    buckets.push({
      key: getBucketKey(cursor, period),
      label:
        period === "week"
          ? DAY_LABELS[parts.dayOfWeek]
          : `${parts.day}/${parts.monthIndex + 1}`,
      revenue: 0,
      expenses: 0,
      cogs: 0,
      profit: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return buckets;
}

function mapMovementType(type: string) {
  const labels: Record<string, string> = {
    SALE: "بيع من المخزون",
    PURCHASE: "استلام شراء",
    PURCHASE_RETURN: "مرتجع شراء",
    SALE_RETURN: "مرتجع مبيعات",
    ADJUSTMENT_IN: "زيادة مخزون",
    ADJUSTMENT_OUT: "تخفيض مخزون",
    PRODUCTION_ISSUE: "صرف للإنتاج",
    PRODUCTION_RECEIPT: "استلام من الإنتاج",
    GIFT: "هدية من المخزون",
  };
  return labels[type] ?? "حركة مخزون";
}

function getActivityTime(dateString: string) {
  const date = new Date(dateString);
  const difference = Date.now() - date.getTime();

  if (!Number.isFinite(difference) || difference < 60_000) return "الآن";

  const minutes = Math.floor(difference / 60_000);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function getTailoringStatusLabel(
  status: TailoringOrderRow["tailoring_status"],
) {
  const labels: Record<TailoringOrderRow["tailoring_status"], string> = {
    NEW: "جديد",
    UNDER_TAILORING: "قيد التفصيل",
    READY_FOR_PICKUP: "جاهز للاستلام",
  };
  return labels[status];
}

export async function GET(request: NextRequest) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const user = await getSession();
    if (!user || !can(user.role, "dashboard.view")) {
      return NextResponse.json(
        { message: "عذراً، لوحة التحكم متاحة للمدير فقط." },
        { status: 403 },
      );
    }

    const periodParam = new URL(request.url).searchParams.get("period");
    const period: DashboardPeriod = [
      "week",
      "month",
      "quarter",
      "year",
    ].includes(periodParam ?? "")
      ? (periodParam as DashboardPeriod)
      : "month";
    const range = getPeriodRange(period, new Date());

    const [
      currentEntriesResult,
      previousEntriesResult,
      currentOrdersResult,
      previousOrdersResult,
      variantsResult,
      movementsResult,
      tailoringResult,
    ] = await Promise.all([
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(
            "amount, amount_usd, debit_account, credit_account, entry_type, created_at",
          )
          .eq("branch_id", MAIN_BRANCH_ID)
          .gte("created_at", range.start.toISOString())
          .lt("created_at", range.end.toISOString())
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(
            "amount, amount_usd, debit_account, credit_account, entry_type, created_at",
          )
          .eq("branch_id", MAIN_BRANCH_ID)
          .gte("created_at", range.previousStart.toISOString())
          .lt("created_at", range.previousEnd.toISOString())
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("sales_orders")
          .select("id, order_type, tailoring_purpose, tailoring_status")
          .eq("branch_id", MAIN_BRANCH_ID)
          .eq("status", "COMPLETED")
          // البيع بيتحسب يوم اكتماله (طلب التفصيل يوم التسليم) زي التقارير
          .gte("completed_at", range.start.toISOString())
          .lt("completed_at", range.end.toISOString())
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("sales_orders")
          .select("id, order_type, tailoring_purpose, tailoring_status")
          .eq("branch_id", MAIN_BRANCH_ID)
          .eq("status", "COMPLETED")
          // البيع بيتحسب يوم اكتماله (طلب التفصيل يوم التسليم) زي التقارير
          .gte("completed_at", range.previousStart.toISOString())
          .lt("completed_at", range.previousEnd.toISOString())
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("product_variants")
          .select(
            'id, sku, "colorName", size, "stockQuantity", "minStockLevel", product_templates ( id, name, categories ( name ) )',
          )
          .eq("isActive", true)
          .order("id")
          .range(from, to),
      ),
      supabaseAdmin
        .from("inventory_movements")
        .select(
          "id, movement_type, quantity, created_at, product_variants ( product_templates ( name, categories ( name ) ) ), users:created_by ( name )",
        )
        .order("created_at", { ascending: false })
        .limit(6),
      supabaseAdmin
        .from("sales_orders")
        .select(
          "id, order_number, tailoring_item_name, tailoring_status, expected_delivery_date, tailoring_purpose",
          { count: "exact" },
        )
        .eq("branch_id", MAIN_BRANCH_ID)
        .eq("order_type", "TAILORING")
        .not("tailoring_status", "in", "(RECEIVED,CANCELLED)")
        .order("expected_delivery_date", { ascending: true, nullsFirst: false })
        .limit(6),
    ]);

    const results = [
      currentEntriesResult,
      previousEntriesResult,
      currentOrdersResult,
      previousOrdersResult,
      variantsResult,
      movementsResult,
      tailoringResult,
    ];
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      console.error("Dashboard overview:", failedResult.error);
      return NextResponse.json(
        { message: "تعذر تحميل بيانات لوحة التحكم." },
        { status: 500 },
      );
    }

    const currentEntries = (currentEntriesResult.data ??
      []) as JournalEntryRow[];
    const previousEntries = (previousEntriesResult.data ??
      []) as JournalEntryRow[];
    const currentFinancials = getFinancialTotals(currentEntries);
    const previousFinancials = getFinancialTotals(previousEntries);
    const currentOrders = (
      (currentOrdersResult.data ?? []) as SalesOrderRow[]
    ).filter(isRecognizedSale);
    const previousOrders = (
      (previousOrdersResult.data ?? []) as SalesOrderRow[]
    ).filter(isRecognizedSale);

    const currentOrderIds = currentOrders.map((order) => order.id);

    // جلب العناصر المباعة وتجميعها حسب الفئات (Categories) بدلاً من المنتجات الفردية
    // على مجموعات ودفعات: فواتير سنة كاملة ممكن تبقى آلاف
    type CategoryRelation = { name: string | null } | null;
    type TemplateRelation = {
      id: string;
      categories: CategoryRelation | CategoryRelation[];
    } | null;
    let currentItems: {
      quantity: number | string | null;
      product_templates: TemplateRelation | TemplateRelation[];
    }[] = [];
    let itemsError: unknown = null;
    try {
      currentItems = await fetchIn(currentOrderIds, (chunk, from, to) =>
        supabaseAdmin
          .from("sales_order_items")
          .select(
            `
            id,
            quantity,
            product_templates (
              id,
              categories (
                name
              )
            )
          `,
          )
          .in("sales_order_id", chunk)
          .order("id")
          .range(from, to),
      );
    } catch (error) {
      itemsError = error;
    }

    if (itemsError) {
      console.error("Dashboard top categories:", itemsError);
      return NextResponse.json(
        { message: "تعذر تحميل الفئات الأكثر مبيعاً." },
        { status: 500 },
      );
    }

    const quantitiesByCategory = new Map<string, number>();
    for (const item of currentItems ?? []) {
      const template = relation(item.product_templates);
      if (!template) continue;

      const categoryData = relation(template.categories);
      const categoryName = categoryData?.name ?? "تصنيف عام";
      const qty = number(item.quantity);

      quantitiesByCategory.set(
        categoryName,
        (quantitiesByCategory.get(categoryName) ?? 0) + qty,
      );
    }

    const categoryColors = [
      "#b99048",
      "#f02c76",
      "#16a34a",
      "#8b5cf6",
      "#0ea5e9",
    ];

    // إرجاع الأفضل مبيعاً تحت اسم topProducts ليتوافق بسلاسة مع الواجهة الحالية ولكن بقيم الفئات
    const topProducts = [...quantitiesByCategory.entries()]
      .sort(([, firstQty], [, secondQty]) => secondQty - firstQty)
      .slice(0, 5)
      .map(([categoryName, quantity], index) => ({
        name: categoryName,
        value: Number(quantity.toFixed(2)),
        fill: categoryColors[index % categoryColors.length],
      }));

    const trend = buildTrendBuckets(period, range.start, range.end);
    const trendByKey = new Map(trend.map((bucket) => [bucket.key, bucket]));
    const entriesByBucket = new Map<string, JournalEntryRow[]>();
    for (const entry of currentEntries) {
      const key = getBucketKey(new Date(entry.created_at), period);
      if (!trendByKey.has(key)) continue;
      entriesByBucket.set(key, [...(entriesByBucket.get(key) ?? []), entry]);
    }
    for (const [key, bucketEntries] of entriesByBucket) {
      const bucket = trendByKey.get(key)!;
      const totals = getFinancialTotals(bucketEntries);
      bucket.revenue = totals.revenue;
      bucket.cogs = totals.cogs;
      bucket.expenses = totals.expenses;
    }
    for (const bucket of trend) {
      bucket.revenue = Number(bucket.revenue.toFixed(2));
      bucket.expenses = Number(bucket.expenses.toFixed(2));
      bucket.cogs = Number(bucket.cogs.toFixed(2));
      bucket.profit = Number(
        (bucket.revenue - bucket.cogs - bucket.expenses).toFixed(2),
      );
    }

    const variants = (variantsResult.data ?? []) as InventoryVariantRow[];
    const stockAlerts = variants
      .map((variant) => {
        const stockQuantity = number(variant.stockQuantity);
        const minStockLevel = number(variant.minStockLevel);
        const status = stockQuantity <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK";

        const template = relation(variant.product_templates);
        return {
          id: variant.id,
          name: template?.name ?? "منتج غير معروف",
          variantLabel: [
            variant.colorName,
            formatProductSize(variant.size),
            variant.sku,
          ]
            .filter(Boolean)
            .join(" · "),
          stockQuantity,
          minStockLevel,
          status,
        };
      })
      .filter(
        (variant) =>
          variant.stockQuantity <= 0 ||
          variant.stockQuantity <= variant.minStockLevel,
      )
      .sort(
        (first, second) =>
          first.stockQuantity - second.stockQuantity ||
          second.minStockLevel - first.minStockLevel,
      );
    const displayedStockAlerts = stockAlerts.slice(0, 6);

    const movements = (movementsResult.data ?? []) as DashboardMovementRow[];
    const recentActivities = movements.map((movement) => {
      const pv = relation(movement.product_variants);
      const template = relation(pv?.product_templates);
      return {
        id: movement.id,
        title: mapMovementType(movement.movement_type),
        productName: template?.name ?? "منتج غير معروف",
        quantity: number(movement.quantity),
        actor: relation(movement.users)?.name ?? "النظام",
        time: getActivityTime(movement.created_at),
      };
    });

    const sudanToday = getSudanDateParts(new Date());
    const todayKey = `${sudanToday.year}-${String(sudanToday.monthIndex + 1).padStart(2, "0")}-${String(sudanToday.day).padStart(2, "0")}`;

    const tailoringOrders = (
      (tailoringResult.data ?? []) as TailoringOrderRow[]
    ).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      itemName: order.tailoring_item_name ?? "طلب تفصيل",
      status: order.tailoring_status,
      statusLabel: getTailoringStatusLabel(order.tailoring_status),
      purpose: order.tailoring_purpose,
      purposeLabel:
        order.tailoring_purpose === "PRODUCTION" ? "تصنيع داخلي" : "للعميل",
      expectedDeliveryDate: order.expected_delivery_date,
      isOverdue:
        Boolean(order.expected_delivery_date) &&
        order.expected_delivery_date! < todayKey,
    }));

    return NextResponse.json({
      data: {
        period,
        periodLabel: range.label,
        comparisonLabel: range.comparisonLabel,
        cards: {
          revenue: {
            value: currentFinancials.revenue,
            previousValue: previousFinancials.revenue,
            change: percentageChange(
              currentFinancials.revenue,
              previousFinancials.revenue,
            ),
          },
          expenses: {
            value: currentFinancials.expenses,
            previousValue: previousFinancials.expenses,
            change: percentageChange(
              currentFinancials.expenses,
              previousFinancials.expenses,
            ),
          },
          netProfit: {
            value: currentFinancials.netProfit,
            previousValue: previousFinancials.netProfit,
            change: percentageChange(
              currentFinancials.netProfit,
              previousFinancials.netProfit,
            ),
          },
          completedSales: {
            value: currentOrders.length,
            previousValue: previousOrders.length,
            change: percentageChange(
              currentOrders.length,
              previousOrders.length,
            ),
          },
        },
        trend,
        topProducts, // سيعرض الآن إجمالي الكميات المباعة مصنفة حسب الفئات (جلاليب، عطور...)
        stockAlerts: displayedStockAlerts,
        recentActivities,
        tailoringOrders,
        summary: {
          activeTailoringOrders:
            tailoringResult.count ?? tailoringOrders.length,
          lowStockItems: stockAlerts.filter(
            (item) => item.status === "LOW_STOCK",
          ).length,
          outOfStockItems: stockAlerts.filter(
            (item) => item.status === "OUT_OF_STOCK",
          ).length,
        },
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/dashboard/overview:", error);

    return NextResponse.json(
      { message: "حدث خطأ غير متوقع أثناء تحميل لوحة التحكم." },
      { status: 500 },
    );
  }
}

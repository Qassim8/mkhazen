/**
 * lib/reports/report-sheets.ts — تحويل بيانات التقرير لأوراق Excel
 */

import type { SheetDefinition } from "@/lib/xlsx-writer";
import type { ReportData } from "./build-report";

const STATUS_LABELS = { OUT: "نفد", LOW: "منخفض", OK: "متوفر" } as const;

export function buildReportSheets(report: ReportData, filterLabels: string[]): SheetDefinition[] {
  const s = report.summary;
  const header = (title: string) => [
    title,
    `الفترة: ${report.periodLabel}`,
    ...filterLabels,
    `سعر الصرف الحالي: ${report.exchangeRate ? `1$ = ${report.exchangeRate} ج.س` : "غير مسجّل"}`,
    `تاريخ الإصدار: ${new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Khartoum" })}`,
  ];

  return [
    {
      name: "الملخص المالي",
      titleLines: header("الملخص المالي (على مستوى المتجر)"),
      columns: [
        { header: "البند", width: 34, format: "text" },
        { header: "القيمة", width: 20 },
        { header: "العملة", width: 10, format: "text" },
      ],
      rows: [
        ["إجمالي الإيرادات", s.revenue, "$"],
        ["  مبيعات الكاشير", s.posRevenue, "$"],
        ["  طلبات التفصيل", s.tailoringRevenue, "$"],
        ["  إيرادات أخرى", s.otherIncome, "$"],
        ["تكلفة المبيعات", s.cogs, "$"],
        ["مجمل الربح", s.grossProfit, "$"],
        ["هامش مجمل الربح %", s.grossMargin, "%"],
        ["المصروفات التشغيلية", s.expenses, "$"],
        ["  منها تكلفة الهدايا", s.giftsCost, "$"],
        ["فروق العملة المحققة", s.realizedFx, "$"],
        ["صافي الربح", s.netProfit, "$"],
        ["هامش صافي الربح %", s.netMargin, "%"],
        ["", null, ""],
        ["المحصّل من الزبائن بالجنيه", s.collectedSdg, "ج.س"],
        ["الخصومات الممنوحة", s.discountsSdg, "ج.س"],
        ["عدد فواتير الكاشير", s.posInvoices, ""],
        ["طلبات تفصيل مسلّمة", s.tailoringDelivered, ""],
        ["متوسط الفاتورة", s.avgInvoiceUsd, "$"],
        ["متوسط الفاتورة", s.avgInvoiceSdg, "ج.س"],
        ["الكميات المباعة", s.itemsSold, ""],
      ],
    },
    {
      name: "الأداء الزمني",
      titleLines: header(report.trendGranularity === "day" ? "الأداء اليومي" : "الأداء الشهري"),
      columns: [
        { header: report.trendGranularity === "day" ? "اليوم" : "الشهر", width: 18, format: "text" },
        { header: "الإيرادات $", width: 16 },
        { header: "تكلفة المبيعات $", width: 16 },
        { header: "المصروفات $", width: 16 },
        { header: "صافي الربح $", width: 16 },
      ],
      rows: report.trend.map((p) => [p.label, p.revenue, p.cogs, p.expenses, p.profit]),
      totals: [
        "الإجمالي",
        report.trend.reduce((a, p) => a + p.revenue, 0),
        report.trend.reduce((a, p) => a + p.cogs, 0),
        report.trend.reduce((a, p) => a + p.expenses, 0),
        report.trend.reduce((a, p) => a + p.profit, 0),
      ],
    },
    {
      name: "المصروفات",
      titleLines: header("المصروفات حسب النوع"),
      columns: [
        { header: "نوع المصروف", width: 34, format: "text" },
        { header: "القيمة $", width: 18 },
      ],
      rows: report.expenses.map((e) => [e.label, e.value]),
      totals: ["الإجمالي", report.expenses.reduce((a, e) => a + e.value, 0)],
    },
    {
      name: "المبيعات حسب المنتج",
      titleLines: header("المبيعات حسب المنتج (فواتير الكاشير)"),
      columns: [
        { header: "المنتج", width: 32, format: "text" },
        { header: "التصنيف", width: 20, format: "text" },
        { header: "الوحدة", width: 10, format: "text" },
        { header: "الكمية المباعة", width: 14 },
        { header: "كمية الهدايا", width: 12 },
        { header: "عدد الفواتير", width: 12, format: "integer" },
        { header: "الإيراد ج.س", width: 18 },
        { header: "الإيراد $", width: 14 },
        { header: "التكلفة $", width: 14 },
        { header: "الربح $", width: 14 },
        { header: "الهامش %", width: 11 },
      ],
      rows: report.products.map((p) => [
        p.name, p.category, p.unit, p.quantity, p.giftQuantity, p.invoices,
        p.revenueSdg, p.revenueUsd, p.costUsd, p.profitUsd, p.margin,
      ]),
      totals: [
        "الإجمالي", "", "",
        report.products.reduce((a, p) => a + p.quantity, 0),
        report.products.reduce((a, p) => a + p.giftQuantity, 0),
        null,
        report.products.reduce((a, p) => a + p.revenueSdg, 0),
        report.products.reduce((a, p) => a + p.revenueUsd, 0),
        report.products.reduce((a, p) => a + p.costUsd, 0),
        report.products.reduce((a, p) => a + p.profitUsd, 0),
        null,
      ],
    },
    {
      name: "المبيعات حسب التصنيف",
      titleLines: header("المبيعات حسب التصنيف"),
      columns: [
        { header: "التصنيف", width: 26, format: "text" },
        { header: "عدد المنتجات", width: 12, format: "integer" },
        { header: "الكمية", width: 12 },
        { header: "الإيراد ج.س", width: 18 },
        { header: "الإيراد $", width: 14 },
        { header: "التكلفة $", width: 14 },
        { header: "الربح $", width: 14 },
        { header: "الهامش %", width: 11 },
        { header: "الحصة من المبيعات %", width: 16 },
      ],
      rows: report.categories.map((c) => [
        c.name, c.products, c.quantity, c.revenueSdg, c.revenueUsd, c.costUsd, c.profitUsd, c.margin, c.share,
      ]),
      totals: [
        "الإجمالي",
        report.categories.reduce((a, c) => a + c.products, 0),
        report.categories.reduce((a, c) => a + c.quantity, 0),
        report.categories.reduce((a, c) => a + c.revenueSdg, 0),
        report.categories.reduce((a, c) => a + c.revenueUsd, 0),
        report.categories.reduce((a, c) => a + c.costUsd, 0),
        report.categories.reduce((a, c) => a + c.profitUsd, 0),
        null,
        null,
      ],
    },
    {
      name: "المخزون",
      titleLines: header("تقييم المخزون الحالي (لا يتأثر بالفترة)"),
      columns: [
        { header: "المنتج", width: 28, format: "text" },
        { header: "المتغير", width: 22, format: "text" },
        { header: "SKU", width: 14, format: "text" },
        { header: "التصنيف", width: 18, format: "text" },
        { header: "الوحدة", width: 9, format: "text" },
        { header: "الرصيد", width: 11 },
        { header: "حد الطلب", width: 11 },
        { header: "متوسط التكلفة $", width: 15 },
        { header: "قيمة المخزون $", width: 15 },
        { header: "سعر البيع $", width: 13 },
        { header: "سعر البيع ج.س", width: 15 },
        { header: "الحالة", width: 10, format: "text" },
      ],
      rows: report.inventory.map((i) => [
        i.productName, i.variantLabel, i.sku ?? "", i.category, i.unit, i.stock, i.minStock,
        i.avgCostUsd, i.valueUsd, i.sellingPriceUsd, i.sellingPriceSdg, STATUS_LABELS[i.status],
      ]),
      totals: [
        "الإجمالي", "", "", "", "",
        report.inventoryTotals.units, null, null,
        report.inventoryTotals.valueUsd, null, null, "",
      ],
    },
  ];
}

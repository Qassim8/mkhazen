"use client";

/**
 * صفحة التقارير:
 * الملخص المالي • المبيعات حسب المنتج • المبيعات حسب التصنيف • المخزون
 * + طباعة (التبويب الحالي) + تصدير Excel (كل الأقسام في ملف واحد)
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LuBoxes,
  LuChartPie,
  LuFileSpreadsheet,
  LuLayoutDashboard,
  LuPackage,
  LuPrinter,
} from "react-icons/lu";

import { formatSDG, formatUSD } from "@/lib/currency";
import {
  type CategoryRow,
  type InventoryRow,
  type ProductRow,
  type ReportData,
  type ReportTab,
} from "@/lib/reports/report-filters";
import { exportReportXlsx } from "../services/reports.services";

import ReportFilters from "./ReportFilters";
import ReportTable, { type ReportColumn } from "./ReportTable";

const TABS: { id: ReportTab; label: string; icon: typeof LuPackage }[] = [
  { id: "summary", label: "الملخص المالي", icon: LuLayoutDashboard },
  { id: "products", label: "المبيعات حسب المنتج", icon: LuPackage },
  { id: "categories", label: "المبيعات حسب التصنيف", icon: LuChartPie },
  { id: "inventory", label: "المخزون", icon: LuBoxes },
];

const COLORS = ["#b99048", "#f02c76", "#16a34a", "#8b5cf6", "#0ea5e9", "#f59e0b", "#64748b", "#ef4444"];

const qty = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${value.toFixed(1)}%`;
const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((a, r) => a + pick(r), 0);

/* =====================================================================
   كروت المؤشرات
===================================================================== */

function Kpi({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-gray-950";
  return (
    <div className="break-inside-avoid rounded-2xl border border-gray-200 bg-white p-4 print:rounded-lg print:p-2.5">
      <p className="text-xs font-bold text-gray-500">{title}</p>
      <p dir="ltr" className={`mt-1.5 text-right text-xl font-black print:text-base ${color}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] font-semibold text-gray-400">{hint}</p>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-3">
      <div>
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* =====================================================================
   التبويبات
===================================================================== */

function SummaryTab({ report }: { report: ReportData }) {
  const s = report.summary;
  const tone = (value: number) => (value < 0 ? "bad" : value > 0 ? "good" : "default") as "good" | "bad" | "default";

  const statement: { label: string; value: number; strong?: boolean; indent?: boolean; isPercent?: boolean }[] = [
    { label: "إجمالي الإيرادات", value: s.revenue, strong: true },
    { label: "مبيعات الكاشير", value: s.posRevenue, indent: true },
    { label: "طلبات التفصيل", value: s.tailoringRevenue, indent: true },
    { label: "إيرادات أخرى", value: s.otherIncome, indent: true },
    { label: "(−) تكلفة المبيعات", value: -s.cogs },
    { label: "مجمل الربح", value: s.grossProfit, strong: true },
    { label: "(−) المصروفات التشغيلية", value: -s.expenses },
    { label: "منها تكلفة الهدايا", value: -s.giftsCost, indent: true },
    { label: "(±) فروق العملة المحققة", value: s.realizedFx },
    { label: "صافي الربح", value: s.netProfit, strong: true },
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 print:hidden">
        الملخص المالي على مستوى المتجر بالكامل ولا يتأثر بفلتر التصنيف أو المنتج. كل الأرقام بالدولار.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Kpi title="إجمالي الإيرادات" value={formatUSD(s.revenue)} hint={`المحصّل: ${formatSDG(s.collectedSdg)}`} />
        <Kpi title="مجمل الربح" value={formatUSD(s.grossProfit)} hint={`هامش ${percent(s.grossMargin)}`} tone={tone(s.grossProfit)} />
        <Kpi title="المصروفات" value={formatUSD(s.expenses)} hint={`منها هدايا ${formatUSD(s.giftsCost)}`} />
        <Kpi title="صافي الربح" value={formatUSD(s.netProfit)} hint={`هامش ${percent(s.netMargin)}`} tone={tone(s.netProfit)} />
        <Kpi title="فواتير الكاشير" value={qty(s.posInvoices)} hint={`متوسط ${formatUSD(s.avgInvoiceUsd)}`} />
        <Kpi title="متوسط الفاتورة بالجنيه" value={formatSDG(s.avgInvoiceSdg)} />
        <Kpi title="طلبات تفصيل مسلّمة" value={qty(s.tailoringDelivered)} />
        <Kpi title="الخصومات الممنوحة" value={formatSDG(s.discountsSdg)} hint={`الكميات المباعة ${qty(s.itemsSold)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] print:grid-cols-1">
        <Section
          title={report.trendGranularity === "day" ? "الأداء اليومي" : "الأداء الشهري"}
          subtitle="الإيرادات والتكلفة والمصروفات وصافي الربح بالدولار"
        >
          <div className="h-80 rounded-2xl border border-gray-200 bg-white p-3 print:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={report.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Legend />
                <Bar dataKey="revenue" name="الإيرادات" fill="#b99048" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cogs" name="تكلفة المبيعات" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="المصروفات" fill="#f02c76" radius={[4, 4, 0, 0]} />
                <Line dataKey="profit" name="صافي الربح" stroke="#16a34a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="قائمة الدخل" subtitle={report.periodLabel}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {statement.map((line) => (
                  <tr key={line.label} className={line.strong ? "bg-gray-50 font-black" : ""}>
                    <td className={`px-4 py-2.5 ${line.indent ? "pr-8 text-gray-500" : "text-gray-800"}`}>
                      {line.label}
                    </td>
                    <td
                      dir="ltr"
                      className={`px-4 py-2.5 text-left ${line.value < 0 ? "text-red-600" : "text-gray-900"}`}
                    >
                      {formatUSD(line.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title="المصروفات حسب النوع">
        <ReportTable
          rows={report.expenses}
          rowKey={(row) => row.account}
          showTotals
          defaultSort={{ key: "value", direction: "desc" }}
          columns={[
            { key: "label", header: "نوع المصروف", value: (row) => row.label, total: "الإجمالي" },
            {
              key: "value",
              header: "القيمة",
              align: "end",
              value: (row) => row.value,
              render: (row) => formatUSD(row.value),
              total: formatUSD(sum(report.expenses, (row) => row.value)),
            },
            {
              key: "share",
              header: "النسبة",
              align: "end",
              value: (row) => row.value,
              render: (row) => percent(s.expenses > 0 ? (row.value / s.expenses) * 100 : 0),
            },
          ]}
        />
      </Section>
    </div>
  );
}

function ProductsTab({ report }: { report: ReportData }) {
  const rows = report.products;
  const top = rows.slice(0, 10).map((row) => ({ name: row.name, revenue: row.revenueUsd, profit: row.profitUsd }));

  const revenue = sum(rows, (r) => r.revenueUsd);
  const profit = sum(rows, (r) => r.profitUsd);

  const columns: ReportColumn<ProductRow>[] = [
    { key: "name", header: "المنتج", value: (r) => r.name, className: "font-bold text-gray-900", total: "الإجمالي" },
    { key: "category", header: "التصنيف", value: (r) => r.category },
    {
      key: "quantity",
      header: "الكمية المباعة",
      align: "end",
      value: (r) => r.quantity,
      render: (r) => `${qty(r.quantity)} ${r.unit}`,
      total: qty(sum(rows, (r) => r.quantity)),
    },
    {
      key: "gifts",
      header: "هدايا",
      align: "end",
      value: (r) => r.giftQuantity,
      render: (r) => (r.giftQuantity ? qty(r.giftQuantity) : "—"),
      total: qty(sum(rows, (r) => r.giftQuantity)),
    },
    { key: "invoices", header: "الفواتير", align: "end", value: (r) => r.invoices },
    {
      key: "revenueSdg",
      header: "الإيراد بالجنيه",
      align: "end",
      value: (r) => r.revenueSdg,
      render: (r) => formatSDG(r.revenueSdg),
      total: formatSDG(sum(rows, (r) => r.revenueSdg)),
    },
    {
      key: "revenueUsd",
      header: "الإيراد",
      align: "end",
      value: (r) => r.revenueUsd,
      render: (r) => formatUSD(r.revenueUsd),
      total: formatUSD(revenue),
    },
    {
      key: "costUsd",
      header: "التكلفة",
      align: "end",
      value: (r) => r.costUsd,
      render: (r) => formatUSD(r.costUsd),
      total: formatUSD(sum(rows, (r) => r.costUsd)),
    },
    {
      key: "profitUsd",
      header: "الربح",
      align: "end",
      value: (r) => r.profitUsd,
      render: (r) => (
        <span className={r.profitUsd < 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>
          {formatUSD(r.profitUsd)}
        </span>
      ),
      total: formatUSD(profit),
    },
    {
      key: "margin",
      header: "الهامش",
      align: "end",
      value: (r) => r.margin,
      render: (r) => percent(r.margin),
      total: percent(revenue > 0 ? (profit / revenue) * 100 : 0),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 print:hidden">
        مبيعات الكاشير المكتملة في الفترة. الإيراد بعد توزيع خصم الفاتورة على بنودها، والتكلفة بمتوسط التكلفة وقت البيع.
        الهدايا لا تُحسب إيرادًا.
      </p>

      {top.length > 0 && (
        <Section title="أعلى 10 منتجات حسب الإيراد" subtitle="بالدولار">
          <div className="h-80 rounded-2xl border border-gray-200 bg-white p-3 print:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} orientation="right" />
                <Tooltip formatter={(value) => formatUSD(Number(value))} />
                <Legend />
                <Bar dataKey="revenue" name="الإيراد" fill="#b99048" radius={[0, 4, 4, 0]} />
                <Bar dataKey="profit" name="الربح" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="تفاصيل المبيعات حسب المنتج" subtitle={`${rows.length} منتج`}>
        <ReportTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.productId}
          showTotals
          defaultSort={{ key: "revenueUsd", direction: "desc" }}
        />
      </Section>
    </div>
  );
}

function CategoriesTab({ report }: { report: ReportData }) {
  const rows = report.categories;
  const revenue = sum(rows, (r) => r.revenueUsd);
  const profit = sum(rows, (r) => r.profitUsd);

  const columns: ReportColumn<CategoryRow>[] = [
    { key: "name", header: "التصنيف", value: (r) => r.name, className: "font-bold text-gray-900", total: "الإجمالي" },
    { key: "products", header: "منتجات مباعة", align: "end", value: (r) => r.products, total: qty(sum(rows, (r) => r.products)) },
    { key: "quantity", header: "الكمية", align: "end", value: (r) => r.quantity, render: (r) => qty(r.quantity), total: qty(sum(rows, (r) => r.quantity)) },
    { key: "revenueSdg", header: "الإيراد بالجنيه", align: "end", value: (r) => r.revenueSdg, render: (r) => formatSDG(r.revenueSdg), total: formatSDG(sum(rows, (r) => r.revenueSdg)) },
    { key: "revenueUsd", header: "الإيراد", align: "end", value: (r) => r.revenueUsd, render: (r) => formatUSD(r.revenueUsd), total: formatUSD(revenue) },
    { key: "costUsd", header: "التكلفة", align: "end", value: (r) => r.costUsd, render: (r) => formatUSD(r.costUsd), total: formatUSD(sum(rows, (r) => r.costUsd)) },
    {
      key: "profitUsd",
      header: "الربح",
      align: "end",
      value: (r) => r.profitUsd,
      render: (r) => <span className={r.profitUsd < 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>{formatUSD(r.profitUsd)}</span>,
      total: formatUSD(profit),
    },
    { key: "margin", header: "الهامش", align: "end", value: (r) => r.margin, render: (r) => percent(r.margin), total: percent(revenue > 0 ? (profit / revenue) * 100 : 0) },
    { key: "share", header: "الحصة", align: "end", value: (r) => r.share, render: (r) => percent(r.share), total: rows.length ? "100%" : "" },
  ];

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
          <Section title="حصة كل تصنيف من الإيراد">
            <div className="h-72 rounded-2xl border border-gray-200 bg-white p-3 print:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="revenueUsd" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={2}>
                    {rows.map((row, index) => (
                      <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatUSD(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="الربح حسب التصنيف">
            <div className="h-72 rounded-2xl border border-gray-200 bg-white p-3 print:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatUSD(Number(value))} />
                  <Bar dataKey="profitUsd" name="الربح" radius={[4, 4, 0, 0]}>
                    {rows.map((row, index) => (
                      <Cell key={row.name} fill={row.profitUsd < 0 ? "#ef4444" : COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      )}

      <Section title="تفاصيل المبيعات حسب التصنيف">
        <ReportTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.categoryId ?? "none"}
          showTotals
          defaultSort={{ key: "revenueUsd", direction: "desc" }}
        />
      </Section>
    </div>
  );
}

const STATUS_META = {
  OUT: { label: "نفد", className: "bg-red-50 text-red-700" },
  LOW: { label: "منخفض", className: "bg-amber-50 text-amber-700" },
  OK: { label: "متوفر", className: "bg-emerald-50 text-emerald-700" },
} as const;

function InventoryTab({ report }: { report: ReportData }) {
  const [status, setStatus] = useState<"ALL" | "LOW" | "OUT">("ALL");
  const totals = report.inventoryTotals;

  const rows = useMemo(
    () =>
      status === "ALL"
        ? report.inventory
        : report.inventory.filter((row) => (status === "OUT" ? row.status === "OUT" : row.status !== "OK")),
    [report.inventory, status],
  );

  const columns: ReportColumn<InventoryRow>[] = [
    { key: "product", header: "المنتج", value: (r) => r.productName, className: "font-bold text-gray-900", total: "الإجمالي" },
    { key: "variant", header: "المتغير", value: (r) => r.variantLabel },
    { key: "sku", header: "SKU", value: (r) => r.sku ?? "", render: (r) => r.sku ?? "—" },
    { key: "category", header: "التصنيف", value: (r) => r.category },
    { key: "stock", header: "الرصيد", align: "end", value: (r) => r.stock, render: (r) => `${qty(r.stock)} ${r.unit}`, total: qty(sum(rows, (r) => Math.max(r.stock, 0))) },
    { key: "minStock", header: "حد الطلب", align: "end", value: (r) => r.minStock, render: (r) => qty(r.minStock) },
    { key: "avgCost", header: "متوسط التكلفة", align: "end", value: (r) => r.avgCostUsd, render: (r) => formatUSD(r.avgCostUsd) },
    { key: "value", header: "قيمة المخزون", align: "end", value: (r) => r.valueUsd, render: (r) => formatUSD(r.valueUsd), total: formatUSD(sum(rows, (r) => r.valueUsd)) },
    {
      key: "price",
      header: "سعر البيع",
      align: "end",
      value: (r) => r.sellingPriceUsd,
      render: (r) => (
        <span>
          {formatUSD(r.sellingPriceUsd)}
          {r.sellingPriceSdg != null && (
            <span className="block text-[10px] text-gray-400">{formatSDG(r.sellingPriceSdg)}</span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      value: (r) => (r.status === "OUT" ? 0 : r.status === "LOW" ? 1 : 2),
      render: (r) => (
        <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${STATUS_META[r.status].className}`}>
          {STATUS_META[r.status].label}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 print:hidden">
        رصيد المخزون الحالي (لا يتأثر بالفترة، ويتأثر بفلتر التصنيف والمنتج). القيمة = الرصيد × متوسط التكلفة بالدولار.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Kpi title="قيمة المخزون" value={formatUSD(totals.valueUsd)} hint={totals.valueSdg != null ? `≈ ${formatSDG(totals.valueSdg)}` : undefined} />
        <Kpi title="عدد الأصناف (متغيرات)" value={qty(totals.variants)} hint={`إجمالي الوحدات ${qty(totals.units)}`} />
        <Kpi title="أصناف منخفضة" value={qty(totals.lowStock)} tone={totals.lowStock ? "bad" : "default"} />
        <Kpi title="أصناف نافدة" value={qty(totals.outOfStock)} tone={totals.outOfStock ? "bad" : "default"} />
      </div>

      <div className="flex gap-2 print:hidden">
        {(
          [
            ["ALL", "الكل"],
            ["LOW", "يحتاج طلب (منخفض + نافد)"],
            ["OUT", "النافد فقط"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
              status === value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ReportTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.variantId}
        showTotals
        defaultSort={{ key: "status", direction: "asc" }}
        emptyText="لا توجد أصناف مطابقة"
      />
    </div>
  );
}

/* =====================================================================
   الصفحة
===================================================================== */

interface Props {
  report: ReportData;
  filterLabels: string[];
  initialTab: ReportTab;
}

export default function ReportsClient({ report, filterLabels, initialTab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ReportTab>(initialTab);
  const [isExporting, setIsExporting] = useState(false);

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  async function handleExport() {
    setIsExporting(true);
    try {
      const { fileName, bytes } = await exportReportXlsx(report.filters);
      const blob = new Blob([new Uint8Array(bytes).buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تصدير التقرير.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function changeTab(next: ReportTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <main dir="rtl" className="space-y-5 pb-12">
      {/* ===================== الرأس ===================== */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-950">التقارير</h1>
          <p className="mt-1 text-sm text-gray-500">{report.periodLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
          >
            <LuPrinter className="h-4 w-4" />
            طباعة
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
          >
            <LuFileSpreadsheet className="h-4 w-4" />
            {isExporting ? "جارٍ التصدير..." : "تصدير Excel"}
          </button>
        </div>
      </div>

      <ReportFilters report={report} />

      {/* ===================== التبويبات ===================== */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 print:hidden">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => changeTab(id)}
            className={`-mb-px flex min-w-max items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              tab === id
                ? "border-(--primary-red) text-(--primary-red)"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ===================== منطقة الطباعة ===================== */}
      <div id="report-print-area" className="space-y-5">
        <header className="hidden border-b-2 border-gray-900 pb-3 print:block">
          <h1 className="text-xl font-black">{activeTab.label}</h1>
          <p className="mt-1 text-xs">الفترة: {report.periodLabel}</p>
          {filterLabels.length > 0 && <p className="text-xs">{filterLabels.join(" — ")}</p>}
          <p className="text-xs">
            سعر الصرف: {report.exchangeRate ? `1$ = ${report.exchangeRate.toLocaleString("en-US")} ج.س` : "غير مسجّل"}
            {" — "}
            تاريخ الإصدار: {new Date(report.generatedAt).toLocaleString("ar-EG", { timeZone: "Africa/Khartoum" })}
          </p>
        </header>

        {tab === "summary" && <SummaryTab report={report} />}
        {tab === "products" && <ProductsTab report={report} />}
        {tab === "categories" && <CategoriesTab report={report} />}
        {tab === "inventory" && <InventoryTab report={report} />}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          html,
          body {
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #report-print-area,
          #report-print-area * {
            visibility: visible;
          }
          #report-print-area {
            position: absolute;
            inset: 0;
            width: 100%;
            padding: 0;
          }
          #report-print-area * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-row-group;
          }
        }
      `}</style>
    </main>
  );
}

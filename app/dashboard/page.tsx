import Link from "next/link";
import {
  LuArrowLeft,
  LuTriangleAlert,
} from "react-icons/lu";

import PageHeader from "@/components/shared/PageHeader";
import { getSession } from "@/lib/auth";

import StatsCard from "./components/StatsCard";
import {
  DashboardMetric,
  DashboardPeriod,
  getDashboardOverview,
} from "./services/dashboard.services";
import QuickActions from "./components/QuickActions";
import DashboardCharts from "./components/DashboardCharts";

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "week", label: "أسبوع" },
  { value: "month", label: "شهر" },
  { value: "quarter", label: "ربع سنة" },
  { value: "year", label: "سنة" },
];

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString("ar-SA-u-nu-latn", {
    maximumFractionDigits: 2,
  })} $`;
}

function formatDate(value: string | null) {
  if (!value) return "غير محدد";

  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function metricType(metric: DashboardMetric) {
  if (metric.change === null || metric.change === 0) return "stable" as const;
  return metric.change > 0 ? ("increase" as const) : ("decrease" as const);
}

function statusClass(status: "NEW" | "UNDER_TAILORING" | "READY_FOR_PICKUP") {
  if (status === "READY_FOR_PICKUP") return "bg-emerald-50 text-emerald-700";
  if (status === "UNDER_TAILORING") return "bg-violet-50 text-violet-700";
  return "bg-sky-50 text-sky-700";
}

interface DashboardPageProps {
  searchParams: Promise<{ period?: string | string[] }>;
}

export default async function Dashboard({ searchParams }: DashboardPageProps) {
  const query = await searchParams;
  const periodParam = Array.isArray(query.period)
    ? query.period[0]
    : query.period;
  const period = PERIODS.some((item) => item.value === periodParam)
    ? (periodParam as DashboardPeriod)
    : "month";
  const [user, dashboardResponse] = await Promise.all([
    getSession(),
    getDashboardOverview(period),
  ]);
  const dashboard = dashboardResponse.data;

  const stats = [
    {
      title: "الإيرادات",
      value: formatCurrency(dashboard.cards.revenue.value),
      description: `إجمالي المبيعات والإيرادات خلال ${dashboard.periodLabel}`,
      metric: dashboard.cards.revenue,
      isFavorable:
        dashboard.cards.revenue.change === null ||
        dashboard.cards.revenue.change >= 0,
    },
    {
      title: "المصروفات",
      value: formatCurrency(dashboard.cards.expenses.value),
      description: `المصروفات التشغيلية المسجلة خلال ${dashboard.periodLabel}`,
      metric: dashboard.cards.expenses,
      isFavorable:
        dashboard.cards.expenses.change === null ||
        dashboard.cards.expenses.change <= 0,
    },
    {
      title: "صافي الربح",
      value: formatCurrency(dashboard.cards.netProfit.value),
      description: "الإيرادات بعد تكلفة المبيعات والمصروفات",
      metric: dashboard.cards.netProfit,
      isFavorable:
        dashboard.cards.netProfit.change === null ||
        dashboard.cards.netProfit.change >= 0,
    },
    {
      title: "عمليات البيع المكتملة",
      value:
        dashboard.cards.completedSales.value.toLocaleString("ar-SA-u-nu-latn"),
      description: `طلبات البيع التي اكتملت خلال ${dashboard.periodLabel}`,
      metric: dashboard.cards.completedSales,
      isFavorable:
        dashboard.cards.completedSales.change === null ||
        dashboard.cards.completedSales.change >= 0,
    },
    {
      title: "طلبات التفصيل النشطة",
      value:
        dashboard.summary.activeTailoringOrders.toLocaleString(
          "ar-SA-u-nu-latn",
        ),
      description: "إجمالي طلبات التفصيل والتصنيع النشطة الحالية",
    },
  ];

  return (
    <div className="pb-8">
      <PageHeader
        title={`مرحباً بعودتك، ${user?.name ?? "مستخدم"} 👋`}
        subtitle="نظرة تشغيلية ومالية مختصرة تساعدك على اتخاذ قرار اليوم"
      />

      <section className="flex flex-col gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-gray-600">
          عرض بيانات {dashboard.periodLabel}
        </p>
        <nav
          className="flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto"
          aria-label="اختيار فترة لوحة التحكم"
        >
          {PERIODS.map((item) => {
            const active = item.value === dashboard.period;

            return (
              <Link
                key={item.value}
                href={`/dashboard?period=${item.value}`}
                aria-current={active ? "page" : undefined}
                className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition sm:flex-none ${
                  active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </section>

      {/* تحديث شبكة الكاردات لتتاسب مع 5 عناصر بشكل متناسق */}
      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatsCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            description={stat.description}
            statType={stat.metric ? metricType(stat.metric) : "stable"}
            statNumber={stat.metric?.change}
            comparisonLabel={dashboard.comparisonLabel}
            isFavorable={stat.isFavorable}
          />
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <DashboardCharts
          trend={dashboard.trend}
          data={dashboard.topProducts}
          periodLabel={dashboard.periodLabel}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="frame xl:col-span-2">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">
                متابعة الإنتاج والتسليم (عملاء وتصنيع)
              </p>
              <h2 className="mt-1 font-semibold text-gray-900">
                طلبات التفصيل النشطة
                <span className="mr-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {dashboard.summary.activeTailoringOrders.toLocaleString(
                    "ar-SA-u-nu-latn",
                  )}
                </span>
              </h2>
            </div>
            <Link
              href="/dashboard/tailoring"
              className="inline-flex items-center gap-1 text-sm font-medium text-(--primary-red) hover:text-(--primary-red-hover)"
            >
              عرض الطلبات
              <LuArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          {dashboard.tailoringOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">
              لا توجد طلبات تفصيل نشطة حالياً
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboard.tailoringOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/dashboard/tailoring/${order.id}`}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">
                      {order.itemName}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {order.orderNumber}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      {/* عرض تصنيف الغرض (للعميل / تصنيع داخلي) القادم من نقطة النهاية */}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {order.purposeLabel}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}
                      >
                        {order.statusLabel}
                      </span>
                    </div>
                    <span
                      className={`text-xs ${order.isOverdue ? "font-medium text-rose-600" : "text-gray-500"}`}
                    >
                      التسليم: {formatDate(order.expectedDeliveryDate)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="frame">
          <div className="mb-5">
            <p className="text-sm text-gray-500">آخر الحركات المسجلة</p>
            <h2 className="mt-1 font-semibold text-gray-900">النشاط الأخير</h2>
          </div>

          {dashboard.recentActivities.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">
              لا توجد حركات حديثة
            </p>
          ) : (
            <div className="space-y-4">
              {dashboard.recentActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700">
                    {activity.actor.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">
                        {activity.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {activity.time}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {activity.productName} ·{" "}
                      {activity.quantity.toLocaleString("ar-SA-u-nu-latn")} وحدة
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="frame xl:col-span-2">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">
                إجراء مطلوب قبل نفاد الكمية
              </p>
              <h2 className="mt-1 flex items-center gap-2 font-semibold text-gray-900">
                تنبيهات المخزون
                {(dashboard.summary.lowStockItems > 0 ||
                  dashboard.summary.outOfStockItems > 0) && (
                  <LuTriangleAlert className="h-4 w-4 text-amber-500" />
                )}
              </h2>
            </div>
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-sm font-medium text-(--primary-red) hover:text-(--primary-red-hover)"
            >
              إدارة المخزون
              <LuArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          {dashboard.stockAlerts.length === 0 ? (
            <p className="py-10 text-center text-sm text-emerald-600">
              ممتاز، لا توجد أصناف منخفضة أو نافدة.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboard.stockAlerts.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/orders/new?variantId=${encodeURIComponent(item.id)}`}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {item.name}
                    </p>
                    {item.variantLabel && (
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {item.variantLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-xs text-gray-500">
                      المتاح{" "}
                      <span className="font-semibold text-gray-800">
                        {item.stockQuantity.toLocaleString("ar-SA-u-nu-latn")}
                      </span>
                      <span className="mx-1">/</span>
                      الحد{" "}
                      {item.minStockLevel.toLocaleString("ar-SA-u-nu-latn")}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "OUT_OF_STOCK" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {item.status === "OUT_OF_STOCK"
                        ? "نفد المخزون"
                        : "كمية منخفضة"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <QuickActions />
      </section>
    </div>
  );
}

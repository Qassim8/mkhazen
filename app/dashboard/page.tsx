import Link from "next/link";

import PageHeader from "@/components/shared/PageHeader";
import { getSession } from "@/lib/auth";

import StatsCard from "./components/StatsCard";
import AreaChartComponent from "./components/AreaChart";
import PieChartComponent from "./components/PieChart";

import { actions } from "@/data/data";

import { getAccountingOverview } from "./accounting/services/accounting.services";

import {
  getInventory,
  getInventoryMovements,
} from "./inventory/services/inventory.services";

import { getPosProducts, getSalesOrders } from "./pos/services/pos.services";

/* =========================================================
   HELPERS
========================================================= */

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString("ar-SA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ر.س`;
}

function formatActivityTime(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "وقت غير معروف";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "الآن";
  }

  if (diffMinutes < 60) {
    return `منذ ${diffMinutes} دقيقة`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `منذ ${diffHours} ساعة`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `منذ ${diffDays} يوم`;
  }

  return date.toLocaleDateString("ar-SA");
}

/* =========================================================
   ACTIVITY
========================================================= */

function mapMovementActivity(
  movement: Awaited<ReturnType<typeof getInventoryMovements>>["data"][number],
) {
  const productName =
    movement.product_variants?.product_templates?.name ?? "منتج غير معروف";

  const responsible = movement.users?.name ?? "النظام";

  switch (movement.movement_type) {
    case "SALE":
      return {
        id: movement.id,
        name: `بيع ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    case "PURCHASE":
      return {
        id: movement.id,
        name: `استلام شراء ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    case "PURCHASE_RETURN":
      return {
        id: movement.id,
        name: `مرتجع شراء ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    case "SALE_RETURN":
      return {
        id: movement.id,
        name: `مرتجع بيع ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    case "ADJUSTMENT_IN":
      return {
        id: movement.id,
        name: `زيادة مخزون ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    case "ADJUSTMENT_OUT":
      return {
        id: movement.id,
        name: `خفض مخزون ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };

    default:
      return {
        id: movement.id,
        name: `حركة مخزون ${productName}`,
        responsable: responsible,
        time: formatActivityTime(movement.created_at),
        createdAt: movement.created_at,
      };
  }
}

/* =========================================================
   TOP SELLING
========================================================= */

function buildTopSellingData(
  salesOrders: Awaited<ReturnType<typeof getSalesOrders>>["data"],
  posProducts: Awaited<ReturnType<typeof getPosProducts>>["data"],
) {
  const productNames = new Map<string, string>();

  for (const variant of posProducts) {
    productNames.set(variant.template.id, variant.template.name);
  }

  const quantities = new Map<string, number>();

  for (const order of salesOrders) {
    if (order.status !== "COMPLETED") {
      continue;
    }

    for (const item of order.items ?? []) {
      const current = quantities.get(item.templateId) ?? 0;

      quantities.set(item.templateId, current + Number(item.quantity || 0));
    }
  }

  const colors = [
    "var(--primary-red)",
    "var(--primary-pink)",
    "#f5a50f",
    "var(--primary-red-hover)",
    "#8b5cf6",
  ];

  return [...quantities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([templateId, value], index) => ({
      name: productNames.get(templateId) ?? "منتج",
      value,
      fill: colors[index % colors.length],
    }));
}

/* =========================================================
   DASHBOARD
========================================================= */

const Dashboard = async () => {
  const user = await getSession();

  const currentYear = new Date().getFullYear();

  const [
    accountingResponse,
    // lowStockResponse,
    // outOfStockResponse,
    // // salesResponse,
    // movementsResponse,
    // posProductsResponse,
  ] = await Promise.all([
    getAccountingOverview(currentYear),

    // getInventory({
    //   status: "LOW_STOCK",
    //   limit: 5,
    // }),

    // getInventory({
    //   status: "OUT_OF_STOCK",
    //   limit: 5,
    // }),

    // getSalesOrders({
    //   status: "COMPLETED",
    //   limit: 100,
    // }),

    // getInventoryMovements({
    //   limit: 10,
    //   type: "ALL",
    // }),

    // getPosProducts({
    //   page: 1,
    //   limit: 100,
    // }),
  ]);

  const accounting = accountingResponse.data;

  /* =======================================================
     STATS
  ======================================================= */

  const stats = [
    {
      title: "الإيرادات",
      value: formatCurrency(accounting.cards.revenue),
      description: "إجمالي إيرادات السنة الحالية",
      statType: "increase" as const,
      statNumber: undefined,
    },

    {
      title: "المصروفات",
      value: formatCurrency(accounting.cards.expenses),
      description: "إجمالي المصروفات المسجلة",
      statType: "stable" as const,
      statNumber: undefined,
    },

    {
      title: "صافي الربح",
      value: formatCurrency(accounting.cards.netProfit),
      description: "الإيرادات - تكلفة المبيعات - المصروفات",
      statType: "increase" as const,
      statNumber: undefined,
    },

    {
      title: "طلبات التفصيل النشطة",
      value: "—",
      description: "سيتم ربطها عند بناء نظام التفصيل",
      statType: "stable" as const,
      statNumber: undefined,
    },
  ];

  /* =======================================================
     LOW / OUT OF STOCK
  ======================================================= */

  // const stockProducts = [
  //   ...outOfStockResponse.data.map((variant) => ({
  //     id: variant.id,
  //     title: variant.product_templates?.name ?? "منتج غير معروف",
  //     variantLabel: [
  //       variant.colorName,
  //       variant.size,
  //       variant.sku ? `SKU: ${variant.sku}` : null,
  //     ]
  //       .filter(Boolean)
  //       .join(" | "),
  //     stockQuantity: Number(variant.stockQuantity || 0),
  //     minStockLevel: Number(variant.minStockLevel || 0),
  //     status: "OUT_OF_STOCK" as const,
  //   })),

  //   ...lowStockResponse.data.map((variant) => ({
  //     id: variant.id,
  //     title: variant.product_templates?.name ?? "منتج غير معروف",
  //     variantLabel: [
  //       variant.colorName,
  //       variant.size,
  //       variant.sku ? `SKU: ${variant.sku}` : null,
  //     ]
  //       .filter(Boolean)
  //       .join(" | "),
  //     stockQuantity: Number(variant.stockQuantity || 0),
  //     minStockLevel: Number(variant.minStockLevel || 0),
  //     status: "LOW_STOCK" as const,
  //   })),
  // ].slice(0, 5);

  /* =======================================================
     ACTIVITIES
  ======================================================= */

  // const activities = movementsResponse.data
  //   .map(mapMovementActivity)
  //   .sort(
  //     (a, b) =>
  //       new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  //   )
  //   .slice(0, 5);

  /* =======================================================
     TOP SELLING
  ======================================================= */

  // const topSelling = buildTopSellingData(
  //   salesResponse.data,
  //   posProductsResponse.data,
  // );

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div>
      <PageHeader
        title={`مرحبا بك مجدداً، ${user?.name ?? "مستخدم"} 👋`}
        subtitle="اطلع على آخر المستجدات في متجرك اليوم"
      />

      {/* ===================================================
          STATS
      =================================================== */}

      <section className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            description={stat.description}
            statType={stat.statType}
            statNumber={stat.statNumber}
          />
        ))}
      </section>

      {/* ===================================================
          CHARTS
      =================================================== */}

      <section className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <AreaChartComponent data={accounting.monthly} />
        </div>

        <div className="col-span-1">
          {/* <PieChartComponent data={topSelling} /> */}
        </div>
      </section>

      {/* ===================================================
          BOTTOM
      =================================================== */}

      <section className="my-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* ===============================================
            LEFT
        =============================================== */}

        <div className="col-span-1 space-y-5">
          {/* Quick Actions */}

          <div className="frame">
            <p className="mb-5 text-sm text-gray-500">تنفيذ سريع</p>

            <div className="grid grid-cols-2 gap-3">
              {actions.map(({ name, href }) => (
                <Link
                  href={href}
                  key={name}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-center text-sm transition duration-300 hover:border-0 hover:bg-(--primary-red) hover:text-white"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activities */}

          <div className="frame">
            <p className="mb-5 text-sm text-gray-500">أحدث الأنشطة</p>

            <div className="space-y-3">
              {/* {activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  لا توجد أنشطة حديثة
                </p>
              ) : (
                activities.map((active) => (
                  <div className="flex gap-3" key={active.id}>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--primary-pink)/10 text-sm font-semibold text-(--primary-pink)">
                      {active.responsable.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-semibold">{active.name}</h3>

                      <p className="my-0 py-0 text-sm text-(--primary-red)">
                        {active.responsable}
                      </p>

                      <span className="text-xs text-gray-500">
                        {active.time}
                      </span>
                    </div>
                  </div>
                ))
              )} */}
            </div>
          </div>
        </div>

        {/* ===============================================
            STOCK
        =============================================== */}

        <div className="frame md:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">بحاجة للشراء</p>

              <h2 className="font-semibold text-gray-900">
                كمية قليلة / نفذ من المخزن
              </h2>
            </div>

            <Link
              href="/dashboard/inventory"
              className="text-(--primary-red) transition-colors duration-300 hover:text-(--primary-red-hover)"
            >
              إدارة المخزون
            </Link>
          </div>

          <div className="space-y-2">
            {/* {stockProducts.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                لا توجد منتجات منخفضة المخزون
              </div>
            ) : (
              stockProducts.map((product, index) => (
                <Link
                  href="/dashboard/inventory"
                  key={product.id}
                  className={`flex items-center justify-between gap-4 pt-2 pb-3 ${
                    index !== stockProducts.length - 1
                      ? "border-b border-b-gray-200"
                      : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-400/30 md:h-16 md:w-16" />

                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold md:text-base">
                        {product.title}
                      </h2>

                      {product.variantLabel && (
                        <p className="truncate text-sm text-gray-500">
                          {product.variantLabel}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-gray-400">
                        الحد الأدنى: {product.minStockLevel}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-sm font-medium">
                      <span className="text-gray-500">المتاح:</span>{" "}
                      {product.stockQuantity}
                    </p>

                    <div
                      className={`rounded-full px-3 py-1 text-xs md:text-sm ${
                        product.status === "OUT_OF_STOCK"
                          ? "bg-red-500/15 text-red-500"
                          : "bg-amber-400/15 text-amber-500"
                      }`}
                    >
                      {product.status === "OUT_OF_STOCK"
                        ? "نفذت الكمية"
                        : "كمية قليلة"}
                    </div>
                  </div>
                </Link>
              ))
            )} */}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;

import { serverFetch } from "@/lib/api-client";

export type DashboardPeriod = "week" | "month" | "quarter" | "year";

export interface DashboardMetric {
  value: number;
  previousValue: number;
  /** Null means that the previous period was empty, so a percentage is misleading. */
  change: number | null;
}

export interface DashboardTrendPoint {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  cogs: number;
  profit: number;
}

export interface DashboardTopProduct {
  name: string;
  value: number;
  fill: string;
}

export interface DashboardStockAlert {
  id: string;
  name: string;
  variantLabel: string;
  stockQuantity: number;
  minStockLevel: number;
  status: "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface DashboardActivity {
  id: string;
  title: string;
  productName: string;
  quantity: number;
  actor: string;
  time: string;
}

export interface DashboardTailoringOrder {
  id: string;
  orderNumber: string;
  itemName: string;
  purposeLabel?: string;
  status: "NEW" | "UNDER_TAILORING" | "READY_FOR_PICKUP";
  statusLabel: string;
  expectedDeliveryDate: string | null;
  isOverdue: boolean;
}

export interface DashboardOverview {
  period: DashboardPeriod;
  periodLabel: string;
  comparisonLabel: string;
  cards: {
    revenue: DashboardMetric;
    expenses: DashboardMetric;
    netProfit: DashboardMetric;
    completedSales: DashboardMetric;
  };
  trend: DashboardTrendPoint[];
  topProducts: DashboardTopProduct[];
  stockAlerts: DashboardStockAlert[];
  recentActivities: DashboardActivity[];
  tailoringOrders: DashboardTailoringOrder[];
  summary: {
    activeTailoringOrders: number;
    lowStockItems: number;
    outOfStockItems: number;
  };
}

export async function getDashboardOverview(
  period: DashboardPeriod,
): Promise<{ data: DashboardOverview }> {
  return serverFetch<{ data: DashboardOverview }>("/api/dashboard/overview", {
    method: "GET",
    params: { period },
    cache: "no-store",
  });
}

"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardTrendPoint } from "../services/dashboard.services";

interface AreaChartComponentProps {
  data: DashboardTrendPoint[];
  periodLabel: string;
  isAnimationActive?: boolean;
}

function formatValue(value: number) {
  return Number(value || 0).toLocaleString("ar-SA-u-nu-latn", {
    maximumFractionDigits: 2,
  });
}

const AreaChartComponent = ({
  data,
  periodLabel,
  isAnimationActive = true,
}: AreaChartComponentProps) => {
  return (
    <section className="frame h-[25rem] md:h-[29rem]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">الأداء المالي خلال {periodLabel}</p>
          <h2 className="mt-1 font-semibold text-gray-900">الإيرادات وصافي الربح</h2>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-(--primary-red)" />
            الإيرادات
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            صافي الربح
          </span>
        </div>
      </div>

      <div className="h-[19rem] pt-5 md:h-[22rem]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 4, left: -12, bottom: 0 }}
          >
            <defs>
              <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary-red)" stopOpacity={0.34} />
                <stop offset="95%" stopColor="var(--primary-red)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dashboardProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              minTickGap={24}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={48}
              tickFormatter={(value) => formatValue(Number(value))}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "#d1d5db", strokeDasharray: "3 3" }}
              contentStyle={{
                borderColor: "#e5e7eb",
                borderRadius: "0.75rem",
                direction: "rtl",
              }}
              formatter={(value, name) => [
                `${formatValue(Number(value))} $`,
                name === "revenue" ? "الإيرادات" : "صافي الربح",
              ]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="revenue"
              stroke="var(--primary-red)"
              strokeWidth={2.5}
              fill="url(#dashboardRevenue)"
              isAnimationActive={isAnimationActive}
              animationDuration={700}
            />
            <Area
              type="monotone"
              dataKey="profit"
              name="profit"
              stroke="#16a34a"
              strokeWidth={2.5}
              fill="url(#dashboardProfit)"
              isAnimationActive={isAnimationActive}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default AreaChartComponent;

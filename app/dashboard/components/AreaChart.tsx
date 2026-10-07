"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RechartsDevtools } from "@recharts/devtools";

interface AreaChartMonth {
  month: number;
  label: string;
  revenue: number;
  cogs: number;
  expenses: number;
  profit: number;
}

interface AreaChartComponentProps {
  data: AreaChartMonth[];
  isAnimationActive?: boolean;
}

function formatValue(value: number) {
  return Number(value || 0).toLocaleString("ar-SA", {
    maximumFractionDigits: 2,
  });
}

const AreaChartComponent = ({
  data,
  isAnimationActive = true,
}: AreaChartComponentProps) => {
  const chartData = data.map((item) => ({
    name: item.label,
    ايراد: Number(item.revenue || 0),
    ربح: Number(item.profit || 0),
  }));

  return (
    <div className="frame h-[60vh]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500">نظرة عامة على المبيعات</p>

          <h2 className="font-semibold text-gray-900">الأرباح × الإيرادات</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-(--primary-red)" />
            <span className="text-sm font-medium">الإيرادات</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-(--primary-pink)" />
            <span className="text-sm font-medium">الأرباح</span>
          </div>
        </div>
      </div>

      <div className="h-[55vh] max-h-[55vh] pt-10">
        <AreaChart
          style={{
            direction: "rtl",
            width: "100%",
            maxWidth: "100%",
            maxHeight: "40vh",
            aspectRatio: 1.618,
          }}
          responsive
          data={chartData}
          margin={{
            top: 10,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--primary-red)"
                stopOpacity={0.4}
              />

              <stop
                offset="95%"
                stopColor="var(--primary-red)"
                stopOpacity={0}
              />
            </linearGradient>

            <linearGradient id="dashboardProfit" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--primary-pink)"
                stopOpacity={0.4}
              />

              <stop
                offset="95%"
                stopColor="var(--primary-pink)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="4 4" vertical={false} />

          <XAxis
            dataKey="name"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            width="auto"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip formatter={(value) => `${formatValue(Number(value))} ر.س`} />

          <Area
            type="monotone"
            dataKey="ايراد"
            stroke="var(--primary-red)"
            fillOpacity={1}
            fill="url(#dashboardRevenue)"
            isAnimationActive={isAnimationActive}
            animationBegin={200}
            animationDuration={1300}
          />

          <Area
            type="monotone"
            dataKey="ربح"
            stroke="var(--primary-pink)"
            fillOpacity={1}
            fill="url(#dashboardProfit)"
            isAnimationActive={isAnimationActive}
          />

          <RechartsDevtools />
        </AreaChart>
      </div>
    </div>
  );
};

export default AreaChartComponent;

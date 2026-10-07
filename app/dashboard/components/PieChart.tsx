"use client";

import {
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { DashboardTopProduct } from "../services/dashboard.services"; // يمكنك تغيير اسم النوع إلى DashboardTopCategory لاحقاً

interface PieChartComponentProps {
  data: DashboardTopProduct[];
  periodLabel: string;
  isAnimationActive?: boolean;
}

const PieChartComponent = ({
  data,
  periodLabel,
  isAnimationActive = true,
}: PieChartComponentProps) => {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <section className="frame flex h-full min-h-100 flex-col">
      <div>
        <p className="text-sm text-gray-500">
          الفئات الأكثر مبيعاً خلال {periodLabel}
        </p>
        <h2 className="mt-1 font-semibold text-gray-900">أفضل الفئات</h2>
      </div>

      {data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-center text-sm text-gray-400">
          لا توجد مبيعات مكتملة خلال هذه الفترة
        </div>
      ) : (
        <>
          <div className="mt-3">
            <div className="mx-auto h-48 w-full max-w-56 min-w-0 sm:h-52">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value).toLocaleString("ar-SA-u-nu-latn")} وحدة`,
                      "الكمية المباعة",
                    ]}
                    contentStyle={{
                      borderColor: "#e5e7eb",
                      borderRadius: "0.75rem",
                    }}
                  />
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={3}
                    cornerRadius={5}
                    isAnimationActive={isAnimationActive}
                    animationDuration={700}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <Label
                      value={total.toLocaleString("ar-SA-u-nu-latn")}
                      position="center"
                      className="fill-gray-900 text-base font-bold"
                    />
                    <Label
                      value="إجمالي الوحدات"
                      position="centerBottom"
                      className="fill-gray-500 text-[10px]"
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2.5 mt-4">
              {data.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-700">
                    {entry.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {entry.value.toLocaleString("ar-SA-u-nu-latn")} وحدة
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default PieChartComponent;

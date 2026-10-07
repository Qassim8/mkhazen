"use client";

import { Pie, PieChart } from "recharts";

import { RechartsDevtools } from "@recharts/devtools";

export interface TopSellingItem {
  name: string;
  value: number;
  fill: string;
}

interface PieChartComponentProps {
  data: TopSellingItem[];
  isAnimationActive?: boolean;
}

const PieChartComponent = ({
  data,
  isAnimationActive = true,
}: PieChartComponentProps) => {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <div className="frame h-[60vh]">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-500">الأعلى مبيعًا</p>

        <h2 className="font-semibold text-gray-900">الأصناف</h2>
      </div>

      {data.length === 0 ? (
        <div className="flex h-[32vh] items-center justify-center text-sm text-gray-400">
          لا توجد بيانات مبيعات كافية
        </div>
      ) : (
        <>
          <div className="pt-3">
            <PieChart
              style={{
                width: "100%",
                maxWidth: "200px",
                maxHeight: "100%",
                margin: "0 auto",
                aspectRatio: 1,
              }}
              responsive
            >
              <Pie
                data={data}
                innerRadius="70%"
                outerRadius="100%"
                cornerRadius="2%"
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={isAnimationActive}
              />

              <RechartsDevtools />
            </PieChart>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
            {data.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{
                    backgroundColor: entry.fill,
                  }}
                />

                <span className="text-sm font-medium">{entry.name}</span>

                <span className="text-xs text-gray-500">({entry.value})</span>
              </div>
            ))}
          </div>

          <div className="mt-4 text-center text-xs text-gray-400">
            إجمالي الوحدات المباعة: {total}
          </div>
        </>
      )}
    </div>
  );
};

export default PieChartComponent;

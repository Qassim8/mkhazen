"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { InventoryMovement } from "../services/inventory.services";
import { LuPackageX } from "react-icons/lu";

interface BarChartComponentProps {
  movements: InventoryMovement[];
}

const BarChartComponent = ({ movements = [] }: BarChartComponentProps) => {
  // تجميع التحركات حسب الأشهر
  const chartData = useMemo(() => {
    if (!movements || movements.length === 0) return [];

    const monthsMap: {
      [key: string]: { name: string; in: number; out: number };
    } = {};

    // فرز الحركات من الأقدم للأحدث لتأخذ التسلسل الزمني في الرسم
    const sortedMovements = [...movements].reverse();

    sortedMovements.forEach((move) => {
      const date = new Date(move.created_at);
      const monthKey = date.toLocaleDateString("en-US", { month: "short" }); // e.g., "Jan", "Feb"

      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = { name: monthKey, in: 0, out: 0 };
      }

      const qty = Math.abs(move.quantity);

      if (move.movement_type === "STOCK_IN") {
        monthsMap[monthKey].in += qty;
      } else if (move.movement_type === "STOCK_OUT") {
        monthsMap[monthKey].out += qty;
      } else if (move.movement_type === "ADJUSTMENT") {
        if (move.quantity > 0) {
          monthsMap[monthKey].in += qty;
        } else {
          monthsMap[monthKey].out += qty;
        }
      }
    });

    return Object.values(monthsMap);
  }, [movements]);

  const hasData = chartData.length > 0;

  return (
    <div className="frame h-[40vh] md:h-[65vh] flex flex-col justify-between">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-500">تتبع المخزن</p>
          <h2 className="font-semibold text-gray-900">إدخال vs إخراج</h2>
        </div>
      </div>

      {!hasData ? (
        // حالة عدم وجود تحركات مخزنية
        <div className="flex flex-col items-center justify-center flex-1 my-auto text-gray-400">
          <LuPackageX className="h-12 w-12 stroke-1 mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            لا توجد تحركات مخزنية للعرض بعد
          </p>
          <span className="text-xs text-gray-400 mt-1">
            ستظهر الإحصائيات هنا فور تسجيل أول عملية إدخال أو إخراج
          </span>
        </div>
      ) : (
        <div className="pt-6 h-[45vh] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 10,
                right: 10,
                left: -20,
                bottom: 0,
              }}
            >
              <XAxis
                dataKey="name"
                style={{ fontSize: "12px" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                style={{ fontSize: "12px" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  borderRadius: "12px",
                  borderColor: "#e5e7eb",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend wrapperStyle={{ paddingTop: "10px" }} />
              <Bar
                name="وارد (Stock In)"
                dataKey="in"
                fill="var(--primary-red, #ef4444)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                name="منصرف (Stock Out)"
                dataKey="out"
                fill="var(--primary-pink, #f43f5e)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default BarChartComponent;

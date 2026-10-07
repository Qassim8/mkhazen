"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatMoney } from "./AccountingOverviewClient";

export interface ExpenseItem {
  account?: string;
  label: string;
  value: number;
  color?: string;
}

export interface ExpensesChartProps {
  expenseBreakdown: ExpenseItem[];
}

// ألوان افتراضية في حال لم يأتِ لون من الـ API
const DEFAULT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

const ExpensesChart = ({ expenseBreakdown }: ExpensesChartProps) => {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-6">
        <h2 className="text-base font-bold text-gray-900">توزيع المصروفات</h2>
        <p className="mt-1 text-xs text-gray-500">حسب نوع المصروف</p>
      </div>

      {expenseBreakdown.length === 0 ? (
        <div className="flex h-80 items-center justify-center text-sm text-gray-400">
          لا توجد مصروفات خلال هذه الفترة
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={expenseBreakdown}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="45%"
                outerRadius={100}
                innerRadius={55} // حلقة ليعطي شكل Donut أنيق
                paddingAngle={4}
              >
                {expenseBreakdown.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.color ||
                      DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                    }
                  />
                ))}
              </Pie>

              <Tooltip
                formatter={(value) => [formatMoney(Number(value)), "المبلغ"]}
                contentStyle={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  borderColor: "#e5e7eb",
                  fontSize: "12px",
                }}
              />

              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ExpensesChart;

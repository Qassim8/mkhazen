import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatNumber } from "./AccountingOverviewClient";

export interface ExpensesAndRevenuesChartProps {
  data: {
    year: number;
  };
  monthly: {
    label: string;
    revenue: number;
    expenses: number;
  }[];
}

const ExpensesAndRevenuesChart = ({
  data,
  monthly,
}: ExpensesAndRevenuesChartProps) => {
  return (
    <div className="rounded-xl border border-gray-300 bg-card p-5 xl:col-span-2">
      <div className="mb-6">
        <h2 className="font-semibold">الإيرادات والمصروفات</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          الحركة الشهرية خلال {data.year}
        </p>
      </div>

      <div className="h-90 w-full">
        {monthly?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthly}
              margin={{
                top: 10,
                right: 10,
                left: 0,
                bottom: 10,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 12,
                }}
              />

              <YAxis
                tick={{
                  fontSize: 12,
                }}
                tickFormatter={(value) => formatNumber(value)}
              />

              <Tooltip formatter={(value) => formatMoney(Number(value))} />

              <Legend />

              <Bar dataKey="revenue" name="الإيرادات" radius={[6, 6, 0, 0]} />

              <Bar dataKey="expenses" name="المصروفات" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-gray-100">
            لا توجد حركات مسجل بعد
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpensesAndRevenuesChart;

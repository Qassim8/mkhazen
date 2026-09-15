import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatMoney } from "./AccountingOverviewClient";

export interface ExpensesChartProps {
  expenseBreakdown: {
    label: string;
    value: number;
  }[];
}

const ExpensesChart = ({ expenseBreakdown }: ExpensesChartProps) => {
  return (
    <div className="rounded-xl border border-gray-300 bg-card p-5">
      <div className="mb-6">
        <h2 className="font-semibold">توزيع المصروفات</h2>

        <p className="mt-1 text-sm text-muted-foreground">حسب نوع المصروف</p>
      </div>

      {expenseBreakdown.length === 0 ? (
        <div className="flex h-90 items-center justify-center text-sm text-muted-foreground">
          لا توجد مصروفات خلال هذه الفترة
        </div>
      ) : (
        <div className="h-90 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={expenseBreakdown}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="48%"
                outerRadius={110}
              >
                {expenseBreakdown.map((_, index) => (
                  <Cell key={`expense-${index}`} />
                ))}
              </Pie>

              <Tooltip formatter={(value) => formatMoney(Number(value))} />

              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default ExpensesChart;

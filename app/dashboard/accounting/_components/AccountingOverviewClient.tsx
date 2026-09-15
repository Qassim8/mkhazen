"use client";

import { Suspense, useEffect, useState } from "react";

import {
  getAccountingOverview,
  AccountingOverview,
} from "../services/accounting.services";
import ExpensesAndRevenuesChart from "./ExpensesAndRevenuesChart";
import ExpensesChart from "./ExpensesChart";
import OverviewCard from "./OverviewCard";

interface Props {
  initialData: AccountingOverview;
}

const years = Array.from(
  { length: 5 },
  (_, index) => new Date().getFullYear() - index,
);

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMoney(value: number) {
  return `${formatNumber(value)} ر.س`;
}

function getAmountClass(value: number) {
  return value < 0 ? "text-red-600" : "text-foreground";
}

export default function AccountingOverviewClient({ initialData }: Props) {
  const [data, setData] = useState<AccountingOverview>(initialData);

  const [year, setYear] = useState(initialData.year);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (year === initialData.year) {
      return;
    }

    let cancelled = false;

    async function loadOverview() {
      try {
        setLoading(true);

        const response = await getAccountingOverview(year);

        if (!cancelled) {
          setData(response.data);
        }
      } catch (error) {
        console.error("Load accounting overview:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [year, initialData.year]);

  const { cards, monthly, expenseBreakdown } = data;

  return (
    <div className="space-y-6 p-6">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">نظرة عامة على الحسابات</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            ملخص الوضع المالي والحركة المحاسبية خلال الفترة المحددة
          </p>
        </div>

        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-sm text-muted-foreground">
              جاري التحميل...
            </span>
          )}

          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="h-10 rounded-lg border border-gray-300 bg-background px-3 text-sm outline-none focus:ring-2"
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* =====================================================
          CARDS
      ===================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="المبيعات" value={formatMoney(cards.revenue)} />

        <OverviewCard title="المصروفات" value={formatMoney(cards.expenses)} />

        <OverviewCard
          title="صافي الربح"
          value={formatMoney(cards.netProfit)}
          valueClass={getAmountClass(cards.netProfit)}
        />

        <OverviewCard
          title="ديون الموردين"
          value={formatMoney(cards.supplierDebts)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="البنك" value={formatMoney(cards.bank)} />

        <OverviewCard title="الخزينة" value={formatMoney(cards.cash)} />

        <OverviewCard title="المخزون" value={formatMoney(cards.inventory)} />

        <OverviewCard title="الأصول" value={formatMoney(cards.assets)} />
      </div>

      {/* =====================================================
          CHARTS
      ===================================================== */}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Revenue / Expenses */}
        <Suspense fallback={<div className="h-75 rounded-lg bg-gray-100" />}>
          <ExpensesAndRevenuesChart data={data} monthly={monthly} />
        </Suspense>
        {/* Expense Breakdown */}
        <Suspense fallback={<div className="h-75 rounded-lg bg-gray-100" />}>
          <ExpensesChart expenseBreakdown={expenseBreakdown} />
        </Suspense>
      </div>
    </div>
  );
}

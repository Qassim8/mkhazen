"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getAccountingOverview,
  AccountingOverview,
} from "../services/accounting.services";
import ExpensesAndRevenuesChart from "./ExpensesAndRevenuesChart";
import ExpensesChart from "./ExpensesChart";
import OverviewCard from "./OverviewCard";
import CurrencyExchangeModal from "./CurrencyExchangeModal";
import { formatRate, formatSDG } from "@/lib/currency";
import {
  LuArrowLeftRight,
  LuHandCoins,
  LuScissors,
  LuBoxes,
  LuBuilding2,
  LuDollarSign,
  LuLandmark,
  LuLayers,
  LuTrendingDown,
  LuTrendingUp,
  LuTruck,
  LuWallet,
} from "react-icons/lu";

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
  return `${formatNumber(value)} $`;
}

function getAmountClass(value: number) {
  return value < 0 ? "text-red-600" : "text-foreground";
}

export default function AccountingOverviewClient({ initialData }: Props) {
  const [data, setData] = useState<AccountingOverview>(initialData);

  const [year, setYear] = useState(initialData.year);

  const [loading, setLoading] = useState(false);

  const [showExchange, setShowExchange] = useState(false);

  const router = useRouter();

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
    <div className="space-y-6 py-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">نظرة عامة على المحاسبة</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            ملخص الوضع المالي والحركة المحاسبية خلال الفترة المحددة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            dir="ltr"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700"
          >
            {formatRate(data.exchangeRate ?? null)}
          </span>

          <button
            type="button"
            onClick={() => setShowExchange(true)}
            className="flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-xs font-bold text-white hover:bg-gray-800"
          >
            <LuArrowLeftRight className="h-4 w-4" />
            تحويل عملة
          </button>

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

      {/* رأس المال العام */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="رأس المال العام"
          value={formatMoney(cards.capital)}
          icon={<LuBuilding2 className="h-5 w-5" />}
          variant="purple"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="الإيرادات"
          value={formatMoney(cards.revenue)}
          icon={<LuTrendingUp className="h-5 w-5" />}
          variant="success"
        />

        <OverviewCard
          title="المصروفات"
          value={formatMoney(cards.expenses)}
          icon={<LuTrendingDown className="h-5 w-5" />}
          variant="danger"
        />

        <OverviewCard
          title="صافي الربح"
          value={formatMoney(cards.netProfit)}
          valueClass={getAmountClass(cards.netProfit)}
          icon={<LuDollarSign className="h-5 w-5" />}
          variant={cards.netProfit >= 0 ? "success" : "danger"}
        />

        <OverviewCard
          title="إجمالي السيولة بالدولار (بسعر اليوم)"
          value={formatMoney(cards.totalLiquidityUsd)}
          icon={<LuDollarSign className="h-5 w-5" />}
          variant="purple"
        />
      </div>

      {/* المجموعة الثانية: السيولة (كل عملة لوحدها) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="الخزينة (دولار)"
          value={formatMoney(cards.cashUsd)}
          icon={<LuWallet className="h-5 w-5" />}
          variant="emerald"
        />

        <OverviewCard
          title="الخزينة (جنيه)"
          value={formatSDG(cards.cashSdg)}
          icon={<LuWallet className="h-5 w-5" />}
          variant="emerald"
        />

        <OverviewCard
          title="البنك (دولار)"
          value={formatMoney(cards.bankUsd)}
          icon={<LuLandmark className="h-5 w-5" />}
          variant="info"
        />

        <OverviewCard
          title="البنك (جنيه)"
          value={formatSDG(cards.bankSdg)}
          icon={<LuLandmark className="h-5 w-5" />}
          variant="info"
        />
      </div>

      {/* المجموعة الرابعة: الالتزامات والأصول (دولار) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OverviewCard
          title="ديون الموردين"
          value={formatMoney(cards.supplierDebts)}
          icon={<LuTruck className="h-5 w-5" />}
          variant="amber"
        />

        <OverviewCard
          title="مستحقات الخياطين"
          value={formatMoney(cards.tailorsPayable)}
          icon={<LuScissors className="h-5 w-5" />}
          variant="amber"
        />

        <OverviewCard
          title="عربون العملاء (التزام)"
          value={formatMoney(cards.customerAdvances)}
          icon={<LuHandCoins className="h-5 w-5" />}
          variant="amber"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="المخزون"
          value={formatMoney(cards.inventory)}
          icon={<LuBoxes className="h-5 w-5" />}
          variant="warning"
        />

        <OverviewCard
          title="إنتاج تحت التصنيع"
          value={formatMoney(cards.workInProgress)}
          icon={<LuLayers className="h-5 w-5" />}
          variant="warning"
        />

        <OverviewCard
          title="دفعات مقدمة للخياطين"
          value={formatMoney(cards.tailorAdvances ?? 0)}
          icon={<LuScissors className="h-5 w-5" />}
          variant="slate"
        />

        <OverviewCard
          title="الأصول"
          value={formatMoney(cards.assets)}
          icon={<LuLayers className="h-5 w-5" />}
          variant="slate"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Suspense fallback={<div className="h-75 rounded-lg bg-gray-100" />}>
          <ExpensesAndRevenuesChart data={data} monthly={monthly} />
        </Suspense>

        <Suspense fallback={<div className="h-75 rounded-lg bg-gray-100" />}>
          <ExpensesChart expenseBreakdown={expenseBreakdown} />
        </Suspense>
      </div>

      {showExchange && (
        <CurrencyExchangeModal
          onClose={() => setShowExchange(false)}
          onCreated={async () => {
            setShowExchange(false);
            try {
              const response = await getAccountingOverview(year);
              setData(response.data);
            } catch (error) {
              console.error("Reload overview:", error);
            }
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

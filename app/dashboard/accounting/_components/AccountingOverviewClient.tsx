"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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
  const years = initialData.years?.length ? initialData.years : [initialData.year];

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

      {data.employeeAdvances && (
        <div className="rounded-2xl border border-orange-100 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <LuHandCoins className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">سلف الموظفين</h3>
                <p className="text-xs text-gray-500">
                  ما على الموظفين من سلف (أصل): تُسترد نقدًا أو تُخصم من الراتب — لقطة حالية
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/employees/payroll"
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-4 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            >
              الرواتب والسلف
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">إجمالي رصيد السلف</p>
              <p className="mt-1 text-lg font-black text-orange-700">{formatSDG(data.employeeAdvances.totalBalanceSdg)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">موظفون عليهم سلف</p>
              <p className="mt-1 text-lg font-black text-gray-900">{data.employeeAdvances.employeesCount}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">الرصيد الدفتري بالدولار</p>
              <p dir="ltr" className="mt-1 text-right text-lg font-black text-gray-900">
                {formatMoney(data.employeeAdvances.bookUsd)}
              </p>
            </div>
          </div>
        </div>
      )}

      {data.payables && (
        <div className="rounded-2xl border border-rose-100 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <LuHandCoins className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">المستحقات على المحل</h3>
                <p className="text-xs text-gray-500">
                  متبقي الأصول والمصروفات التي تُدفع على أجزاء، وديون الموردين (من المشتريات) — لقطة حالية
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/accounting/payables"
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-4 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            >
              المستحقات على المحل
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">مستحقات الأصول</p>
              <p className="mt-1 text-lg font-black text-rose-700">{formatMoney(data.payables.assets.bookUsd)}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {data.payables.assets.count} مستحق
                {data.payables.assets.overdueCount > 0 && (
                  <span className="text-red-600"> — {data.payables.assets.overdueCount} متأخر</span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">مستحقات المصروفات</p>
              <p className="mt-1 text-lg font-black text-rose-700">{formatMoney(data.payables.expenses.bookUsd)}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {data.payables.expenses.count} مستحق
                {data.payables.expenses.overdueCount > 0 && (
                  <span className="text-red-600"> — {data.payables.expenses.overdueCount} متأخر</span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">ديون الموردين (المشتريات)</p>
              <p className="mt-1 text-lg font-black text-rose-700">{formatMoney(data.payables.supplierDebts)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-bold text-gray-400">الإجمالي</p>
              <p className="mt-1 text-lg font-black text-gray-900">{formatMoney(data.payables.totalUsd)}</p>
            </div>
          </div>
        </div>
      )}

      {data.receivables && (
        <div className="rounded-2xl border border-amber-100 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <LuHandCoins className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">ذمم العملاء</h3>
                <p className="text-xs text-gray-500">
                  ديون الكاشير بالتقسيط ومتبقي طلبات التفصيل قيد التنفيذ (مبالغ متوقعة) — لقطة حالية
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/receivables"
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-4 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            >
              ذمم العملاء
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["ديون الكاشير (بالتقسيط)", data.receivables.posCredit, "فاتورة"],
                ["متبقي التفصيل قيد التنفيذ (متوقع)", data.receivables.tailoringInProgress, "طلب"],
                ["الإجمالي", data.receivables.total, "ذمة"],
              ] as const
            ).map(([label, bucket, unit]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-4">
                <p className="text-[11px] font-bold text-gray-400">{label}</p>
                <p className="mt-1 text-lg font-black text-amber-700">{formatSDG(bucket.remainingSdg)}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {bucket.count} {unit}
                  {bucket.overdueCount > 0 && (
                    <span className="text-red-600"> — {bucket.overdueCount} متأخرة</span>
                  )}
                </p>
                <p className="mt-2 text-[10px] font-bold text-gray-400">بالدولار (يوم البيع ← اليوم)</p>
                <p dir="ltr" className="text-right text-sm font-black text-gray-900">
                  {formatMoney(bucket.usdNow)} ← {formatMoney(bucket.usdAtSale)}
                </p>
                <p
                  className={`mt-0.5 text-[11px] font-bold ${bucket.lossUsd > 0 ? "text-red-600" : "text-gray-500"}`}
                >
                  الخسارة من انخفاض الجنيه: {formatMoney(bucket.lossUsd)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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

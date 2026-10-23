"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { LuBanknote, LuHistory, LuPencil, LuPrinter, LuTrash2 } from "react-icons/lu";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { formatRate, formatSDG, formatUSD } from "@/lib/currency";

import type { ReceivableRow, ReceivablesSummary } from "../services/receivables.services";
import { AdjustModal, CloseDebtModal, HistoryModal, PaymentModal } from "./ReceivableModals";

interface Props {
  rows: ReceivableRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: ReceivablesSummary | null;
  isManager: boolean;
}

type ModalState =
  | { kind: "payment" | "adjust" | "close" | "history"; row: ReceivableRow }
  | null;

function formatDueDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T12:00:00`));
}

function pct(value: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function lossTone(value: number | null) {
  if (value == null || value === 0) return "text-gray-500";
  return value > 0 ? "text-red-600" : "text-emerald-600";
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone ?? "text-gray-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

export default function ReceivablesClient({ rows, meta, summary, isManager }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);

  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    router.refresh();
  };

  const actions = (row: ReceivableRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setModal({ kind: "payment", row })}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-(--primary-red) px-3 text-xs font-bold text-white hover:opacity-90 md:min-h-9"
      >
        <LuBanknote className="h-3.5 w-3.5" />
        تسجيل دفعة
      </button>
      <button
        type="button"
        onClick={() => setModal({ kind: "history", row })}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
      >
        <LuHistory className="h-3.5 w-3.5" />
        السجل
      </button>
      <button
        type="button"
        onClick={() => window.open(`/dashboard/pos/receipt/${row.order_id}`, "_blank", "width=420,height=700")}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
      >
        <LuPrinter className="h-3.5 w-3.5" />
        طباعة الفاتورة
      </button>
      {isManager && (
        <>
          <button
            type="button"
            onClick={() => setModal({ kind: "adjust", row })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
          >
            <LuPencil className="h-3.5 w-3.5" />
            تعديل المتبقي
          </button>
          <button
            type="button"
            onClick={() => setModal({ kind: "close", row })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50 md:min-h-9"
          >
            <LuTrash2 className="h-3.5 w-3.5" />
            دين معدوم
          </button>
        </>
      )}
    </div>
  );

  return (
    <div dir="rtl" className="space-y-5 pb-12">
      <PageHeader title="ذمم العملاء" subtitle="الفواتير الآجلة المفتوحة (الدين بالجنيه ومربوط بالفاتورة)" />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="إجمالي المتبقي" value={formatSDG(summary.total_remaining_sdg)} hint={`${summary.invoices_count} فاتورة مفتوحة`} />
          <Stat
            label="قيمته بالدولار (يوم البيع ← اليوم)"
            value={`${formatUSD(summary.total_usd_at_sale)} ← ${formatUSD(summary.total_usd_now)}`}
          />
          <Stat
            label="إجمالي الخسارة من انخفاض الجنيه"
            value={formatUSD(summary.total_loss_usd)}
            tone={lossTone(summary.total_loss_usd)}
          />
          <Stat
            label="الفواتير المتأخرة"
            value={String(summary.overdue_count)}
            tone={summary.overdue_count > 0 ? "text-red-600" : undefined}
          />
        </div>
      )}

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar placeholder="بحث برقم الفاتورة أو الاسم أو الهاتف..." searchKey="search" />
          <div className="flex items-center gap-2">
            <TableFilter label="الفواتير" paramKey="overdue" options={[{ value: "true", label: "المتأخرة فقط" }]} />
          </div>
          <ResetFilters />
        </div>
      </Suspense>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          لا توجد فواتير آجلة مفتوحة مطابقة
        </div>
      ) : (
        <>
          {/* الجوال: بطاقات */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={row.order_id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-gray-900">{row.credit_customer_name}</p>
                    <p className="mt-0.5 text-xs text-gray-500" dir="ltr">
                      {row.credit_customer_phone}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-gray-400">{row.order_number}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold text-gray-400">المتبقي</p>
                    <p className="font-black text-amber-700">{formatSDG(Number(row.remaining_sdg))}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-400">بالدولار (البيع ← اليوم)</dt>
                    <dd dir="ltr" className="text-right font-bold text-gray-800">
                      {formatUSD(row.remaining_usd_at_sale)} ← {formatUSD(row.remaining_usd_now)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">نسبة الانخفاض</dt>
                    <dd className={`font-bold ${lossTone(row.loss_pct)}`}>{pct(row.loss_pct)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">الاستحقاق</dt>
                    <dd className={`font-bold ${row.is_overdue ? "text-red-600" : "text-gray-800"}`}>
                      {formatDueDate(row.due_date)}
                      {row.is_overdue && " (متأخرة)"}
                    </dd>
                  </div>
                  {isManager && (
                    <div>
                      <dt className="text-gray-400">الخسارة من الربح المتوقع</dt>
                      <dd className={`font-bold ${lossTone(row.loss_pct_of_profit ?? null)}`}>
                        {pct(row.loss_pct_of_profit ?? null)}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3 border-t border-gray-100 pt-3">{actions(row)}</div>
              </div>
            ))}
          </div>

          {/* الشاشات الأكبر: جدول */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full min-w-250 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الفاتورة</th>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                  <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                  <th className="px-4 py-3 text-right font-bold">قيمته بالدولار (يوم الشراء ← اليوم)</th>
                  <th className="px-4 py-3 text-right font-bold">نسبة الانخفاض</th>
                  <th className="px-4 py-3 text-right font-bold">الاستحقاق</th>
                  {isManager && <th className="px-4 py-3 text-right font-bold">الخسارة من الربح المتوقع %</th>}
                  <th className="px-4 py-3 text-right font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.order_id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-gray-900">{row.order_number}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        سعر الصرف يوم الشراء {formatRate(row.sale_rate)}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">{row.credit_customer_name}</td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {row.credit_customer_phone}
                    </td>
                    <td className="px-4 py-3 font-black text-amber-700">{formatSDG(Number(row.remaining_sdg))}</td>
                    <td className="px-4 py-3" dir="ltr">
                      <span className="text-gray-700">{formatUSD(row.remaining_usd_at_sale)}</span>
                      {" ← "}
                      <span className="font-bold text-gray-900">{formatUSD(row.remaining_usd_now)}</span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${lossTone(row.loss_pct)}`}>{pct(row.loss_pct)}</td>
                    <td className={`px-4 py-3 font-bold ${row.is_overdue ? "text-red-600" : "text-gray-700"}`}>
                      {formatDueDate(row.due_date)}
                      {row.is_overdue && <span className="block text-[11px]">متأخرة</span>}
                    </td>
                    {isManager && (
                      <td className={`px-4 py-3 font-bold ${lossTone(row.loss_pct_of_profit ?? null)}`}>
                        {pct(row.loss_pct_of_profit ?? null)}
                      </td>
                    )}
                    <td className="px-4 py-3">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
        <Pagination meta={meta} />
      </Suspense>

      {modal?.kind === "payment" && <PaymentModal row={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "adjust" && <AdjustModal row={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "close" && <CloseDebtModal row={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "history" && <HistoryModal row={modal.row} isManager={isManager} onClose={close} />}
    </div>
  );
}

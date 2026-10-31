"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { LuBanknote, LuHistory } from "react-icons/lu";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { formatMoney, formatUSD } from "@/lib/currency";

import type { PayableRow, PayablesSummary, PayablesSummaryBucket } from "../services/payables.services";
import { PayableHistoryModal, PayPayableModal } from "./PayableModals";

interface Props {
  rows: PayableRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: PayablesSummary;
  canViewAccounting: boolean;
}

type ModalState = { kind: "pay" | "history"; row: PayableRow } | null;

const TYPE_LABELS = { ASSET: "أصل", EXPENSE: "مصروف" } as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function Stat({ label, bucket }: { label: string; bucket: PayablesSummaryBucket }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-black text-rose-700">{formatUSD(bucket.book_usd)}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        {bucket.count} مستحق
        {bucket.overdue_count > 0 && <span className="text-red-600"> — {bucket.overdue_count} متأخر</span>}
      </p>
      {(bucket.remaining_sdg > 0 || bucket.remaining_usd > 0) && (
        <p className="mt-0.5 text-[11px] text-gray-500">
          {[
            bucket.remaining_sdg > 0 ? formatMoney(bucket.remaining_sdg, "SDG") : null,
            bucket.remaining_usd > 0 ? formatMoney(bucket.remaining_usd, "USD") : null,
          ]
            .filter(Boolean)
            .join(" + ")}
        </p>
      )}
    </div>
  );
}

export default function PayablesClient({ rows, meta, summary, canViewAccounting }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);

  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    router.refresh();
  };

  const actions = (row: PayableRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.status === "OPEN" && (
        <button
          type="button"
          onClick={() => setModal({ kind: "pay", row })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-(--primary-red) px-3 text-xs font-bold text-white hover:opacity-90 md:min-h-9"
        >
          <LuBanknote className="h-3.5 w-3.5" />
          دفع
        </button>
      )}
      <button
        type="button"
        onClick={() => setModal({ kind: "history", row })}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
      >
        <LuHistory className="h-3.5 w-3.5" />
        سجل الدفعات
      </button>
    </div>
  );

  const dueCell = (row: PayableRow) => (
    <span className={`font-bold ${row.isOverdue ? "text-red-600" : "text-gray-700"}`}>
      {formatDate(row.dueDate)}
      {row.isOverdue && <span className="block text-[11px]">متأخر</span>}
    </span>
  );

  return (
    <div dir="rtl" className="space-y-5 pb-12">
      <PageHeader
        title="المستحقات على المحل"
        subtitle="متبقي الأصول والمصروفات التي سُجّلت بقيمتها الكاملة ويُدفع جزء منها لاحقًا"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="مستحقات الأصول" bucket={summary.assets} />
        <Stat label="مستحقات المصروفات" bucket={summary.expenses} />
        <Stat label="إجمالي المستحقات المفتوحة" bucket={summary.total} />
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar placeholder="بحث بالوصف..." searchKey="search" />
          <div className="flex flex-wrap items-center gap-2">
            <TableFilter
              label="الحالة"
              paramKey="status"
              options={[
                { value: "PAID", label: "المسدَّدة" },
                { value: "ALL", label: "الكل" },
              ]}
            />
            <TableFilter
              label="النوع"
              paramKey="type"
              options={[
                { value: "ASSET", label: "أصول" },
                { value: "EXPENSE", label: "مصروفات" },
              ]}
            />
            <TableFilter label="الاستحقاق" paramKey="overdue" options={[{ value: "true", label: "المتأخرة فقط" }]} />
          </div>
          <ResetFilters />
        </div>
      </Suspense>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          لا توجد مستحقات مطابقة
        </div>
      ) : (
        <>
          {/* الجوال: بطاقات */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-gray-900">{row.description}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 font-bold text-gray-700">
                        {TYPE_LABELS[row.sourceType]}
                      </span>
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold text-gray-400">المتبقي</p>
                    <p className="font-black text-amber-700">{formatMoney(row.remainingAmount, row.currency)}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-400">الإجمالي</dt>
                    <dd className="font-bold text-gray-800">{formatMoney(row.totalAmount, row.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">المدفوع</dt>
                    <dd className="font-bold text-emerald-700">
                      {formatMoney(row.ownerPaid + row.paidAmount, row.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">الاستحقاق</dt>
                    <dd>{dueCell(row)}</dd>
                  </div>
                </dl>

                <div className="mt-3 border-t border-gray-100 pt-3">{actions(row)}</div>
              </div>
            ))}
          </div>

          {/* الشاشات الأكبر: جدول */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full min-w-225 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الوصف</th>
                  <th className="px-4 py-3 text-right font-bold">النوع</th>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                  <th className="px-4 py-3 text-right font-bold">المدفوع</th>
                  <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                  <th className="px-4 py-3 text-right font-bold">الاستحقاق</th>
                  <th className="px-4 py-3 text-right font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {row.description}
                      {row.status === "PAID" && (
                        <span className="mr-2 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          مسدَّد
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                        {TYPE_LABELS[row.sourceType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 font-bold">{formatMoney(row.totalAmount, row.currency)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-700">
                      {formatMoney(row.ownerPaid + row.paidAmount, row.currency)}
                      {row.ownerPaid > 0 && (
                        <span className="block text-[11px] font-normal text-gray-400">
                          منها دفعه المالك {formatMoney(row.ownerPaid, row.currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-black text-amber-700">{formatMoney(row.remainingAmount, row.currency)}</td>
                    <td className="px-4 py-3">{dueCell(row)}</td>
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

      {modal?.kind === "pay" && <PayPayableModal payable={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "history" && (
        <PayableHistoryModal
          payableId={modal.row.id}
          title={modal.row.description}
          canViewAccounting={canViewAccounting}
          onClose={close}
        />
      )}
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuHistory, LuPencil, LuPrinter, LuScissors, LuTrash2 } from "react-icons/lu";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { formatRate, formatSDG, formatUSD } from "@/lib/currency";

import type {
  ReceivableBucket,
  ReceivableKindFilter,
  ReceivableRow,
  ReceivablesSummary,
} from "../services/receivables.services";
import CollectButton from "./CollectButton";
import { AdjustModal, CloseDebtModal, HistoryModal } from "./ReceivableModals";

interface Props {
  rows: ReceivableRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: ReceivablesSummary | null;
  kind: ReceivableKindFilter;
  /** تعديل المتبقي والدين المعدوم لفواتير الكاشير الآجلة (الكاشير وما فوق) */
  canManage: boolean;
  /** الخسارة من الربح المتوقع (المالك والمدير فقط) */
  canProfit: boolean;
}

type ModalState = { kind: "adjust" | "close" | "history"; row: ReceivableRow } | null;

const KIND_LABELS = {
  POS_CREDIT: "دين كاشير",
  TAILORING_IN_PROGRESS: "تفصيل قيد التنفيذ",
} as const;

const TAILORING_STATUS_LABELS: Record<string, string> = {
  NEW: "جديد",
  UNDER_TAILORING: "قيد التفصيل",
  READY_FOR_PICKUP: "جاهز للاستلام",
};

const TAILORING_HINT =
  "هذه مبالغ متوقعة على طلبات لم تُسلَّم بعد، وليست ديونًا: تُحصَّل كاملة عند تسليم الطلب.";

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

function Stat({
  label,
  value,
  hint,
  sub,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone ?? "text-gray-900"}`}>{value}</p>
      {sub && (
        <p dir="ltr" className="mt-0.5 text-right text-[11px] font-semibold text-gray-600">
          {sub}
        </p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

/** قيمة بالدولار: اليوم ← يوم البيع (عرض يمين-يسار: من يوم البيع إلى اليوم) */
function usdPair(bucket: Pick<ReceivableBucket, "usd_at_sale" | "usd_now">) {
  return `${formatUSD(bucket.usd_now)} ← ${formatUSD(bucket.usd_at_sale)}`;
}

function KindTabs({ kind, summary }: { kind: ReceivableKindFilter; summary: ReceivablesSummary | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs: { value: ReceivableKindFilter; label: string; count: number | null }[] = [
    { value: "ALL", label: "الكل", count: summary?.total.count ?? null },
    { value: "POS_CREDIT", label: "ديون الكاشير", count: summary?.pos_credit.count ?? null },
    {
      value: "TAILORING_IN_PROGRESS",
      label: "متبقي طلبات التفصيل قيد التنفيذ",
      count: summary?.tailoring_in_progress.count ?? null,
    },
  ];

  function select(value: ReceivableKindFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") params.delete("kind");
    else params.set("kind", value);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={kind === tab.value}
          onClick={() => select(tab.value)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
            kind === tab.value
              ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {tab.label}
          {tab.count != null && (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-black">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function ReceivablesClient({ rows, meta, summary, kind, canManage, canProfit }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);

  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    router.refresh();
  };

  const actions = (row: ReceivableRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <CollectButton kind={row.kind} row={row} canCollect={row.can_collect} onDone={done} />

      {row.kind === "POS_CREDIT" ? (
        <>
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
            onClick={() =>
              window.open(`/dashboard/pos/receipt/${row.order_id}`, "_blank", "width=420,height=700")
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
          >
            <LuPrinter className="h-3.5 w-3.5" />
            طباعة الفاتورة
          </button>
          {canManage && (
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
        </>
      ) : (
        <Link
          href={`/dashboard/tailoring/${row.order_id}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
        >
          <LuScissors className="h-3.5 w-3.5" />
          فتح الطلب
        </Link>
      )}
    </div>
  );

  const customerCell = (row: ReceivableRow) =>
    row.customer_id ? (
      <Link href={`/dashboard/customers/${row.customer_id}`} className="font-bold text-gray-900 underline decoration-dotted underline-offset-4 hover:text-(--primary-red)">
        {row.customer_name ?? "—"}
      </Link>
    ) : (
      <span className="font-bold text-gray-900">{row.customer_name ?? "—"}</span>
    );

  const typeBadge = (row: ReceivableRow) => (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${
        row.kind === "POS_CREDIT" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"
      }`}
    >
      {KIND_LABELS[row.kind]}
    </span>
  );

  const statusNote = (row: ReceivableRow) =>
    row.kind === "TAILORING_IN_PROGRESS" ? (
      <span className="text-[11px] text-gray-500">
        {TAILORING_STATUS_LABELS[row.status_code ?? ""] ?? row.status_code ?? ""} — متوقع
      </span>
    ) : null;

  return (
    <div dir="rtl" className="space-y-5 pb-12">
      <PageHeader
        title="ذمم العملاء"
        subtitle="ديون الكاشير بالتقسيط ومتبقي طلبات التفصيل، مربوطة بالعميل"
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="ديون الكاشير (بالتقسيط)"
            value={formatSDG(summary.pos_credit.remaining_sdg)}
            sub={usdPair(summary.pos_credit)}
            hint={`${summary.pos_credit.count} فاتورة — يوم البيع ← اليوم`}
            tone="text-amber-700"
          />
          <Stat
            label="متبقي التفصيل قيد التنفيذ (متوقع)"
            value={formatSDG(summary.tailoring_in_progress.remaining_sdg)}
            sub={usdPair(summary.tailoring_in_progress)}
            hint={`${summary.tailoring_in_progress.count} طلب — ليست ديونًا`}
          />
          <Stat
            label="الإجمالي"
            value={formatSDG(summary.total.remaining_sdg)}
            sub={usdPair(summary.total)}
            hint="يوم البيع ← اليوم بالدولار"
          />
          <Stat
            label="الخسارة من انخفاض الجنيه"
            value={formatUSD(summary.total.loss_usd)}
            tone={lossTone(summary.total.loss_usd)}
            hint={`${summary.total.overdue_count} متأخرة`}
          />
        </div>
      )}

      <Suspense fallback={<div className="h-11 animate-pulse bg-gray-50" />}>
        <KindTabs kind={kind} summary={summary} />
      </Suspense>

      {kind !== "POS_CREDIT" && (
        <p className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-xs font-semibold text-purple-900">
          {TAILORING_HINT}
        </p>
      )}

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar placeholder="بحث برقم الفاتورة أو الاسم أو الهاتف..." searchKey="search" />
          <div className="flex items-center gap-2">
            <TableFilter
              label="الاستحقاق"
              paramKey="overdue"
              options={[{ value: "true", label: "المتأخرة فقط" }]}
            />
          </div>
          <ResetFilters />
        </div>
      </Suspense>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          لا توجد ذمم مطابقة
        </div>
      ) : (
        <>
          {/* الجوال: بطاقات */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={`${row.kind}-${row.order_id}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p>{customerCell(row)}</p>
                    <p className="mt-0.5 text-xs text-gray-500" dir="ltr">
                      {row.customer_phone}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-gray-400">
                      {row.order_number} {typeBadge(row)}
                    </p>
                    {statusNote(row)}
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold text-gray-400">المتبقي</p>
                    <p className="font-black text-amber-700">{formatSDG(Number(row.remaining_sdg))}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-400">بالدولار (يوم البيع ← اليوم)</dt>
                    <dd dir="ltr" className="text-right font-bold text-gray-800">
                      {formatUSD(row.remaining_usd_now)} ← {formatUSD(row.remaining_usd_at_sale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">نسبة الانخفاض</dt>
                    <dd className={`font-bold ${lossTone(row.loss_pct)}`}>{pct(row.loss_pct)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">{row.kind === "POS_CREDIT" ? "الاستحقاق" : "التسليم المتوقع"}</dt>
                    <dd className={`font-bold ${row.is_overdue ? "text-red-600" : "text-gray-800"}`}>
                      {formatDueDate(row.due_date)}
                      {row.is_overdue && " (متأخر)"}
                    </dd>
                  </div>
                  {canProfit && row.kind === "POS_CREDIT" && (
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
            <table className="w-full min-w-300 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الفاتورة / الطلب</th>
                  <th className="px-4 py-3 text-right font-bold">النوع</th>
                  <th className="px-4 py-3 text-right font-bold">العميل</th>
                  <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                  <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                  <th className="px-4 py-3 text-right font-bold">قيمته بالدولار (يوم البيع ← اليوم)</th>
                  <th className="px-4 py-3 text-right font-bold">نسبة الانخفاض</th>
                  <th className="px-4 py-3 text-right font-bold">الاستحقاق</th>
                  {canProfit && <th className="px-4 py-3 text-right font-bold">الخسارة من الربح المتوقع %</th>}
                  <th className="px-4 py-3 text-right font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.order_id}`} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-gray-900">{row.order_number}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        سعر الصرف يوم {row.kind === "POS_CREDIT" ? "البيع" : "الطلب"} {formatRate(row.sale_rate)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {typeBadge(row)}
                      <div className="mt-1">{statusNote(row)}</div>
                    </td>
                    <td className="px-4 py-3">{customerCell(row)}</td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {row.customer_phone}
                    </td>
                    <td className="px-4 py-3 font-black text-amber-700">{formatSDG(Number(row.remaining_sdg))}</td>
                    <td className="px-4 py-3" dir="ltr">
                      <span className="font-bold text-gray-900">{formatUSD(row.remaining_usd_now)}</span>
                      {" ← "}
                      <span className="text-gray-700">{formatUSD(row.remaining_usd_at_sale)}</span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${lossTone(row.loss_pct)}`}>{pct(row.loss_pct)}</td>
                    <td className={`px-4 py-3 font-bold ${row.is_overdue ? "text-red-600" : "text-gray-700"}`}>
                      {formatDueDate(row.due_date)}
                      {row.is_overdue && <span className="block text-[11px]">متأخر</span>}
                    </td>
                    {canProfit && (
                      <td className={`px-4 py-3 font-bold ${lossTone(row.loss_pct_of_profit ?? null)}`}>
                        {row.kind === "POS_CREDIT" ? pct(row.loss_pct_of_profit ?? null) : "—"}
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

      {modal?.kind === "adjust" && <AdjustModal row={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "close" && <CloseDebtModal row={modal.row} onClose={close} onDone={done} />}
      {modal?.kind === "history" && <HistoryModal row={modal.row} isManager={canManage} onClose={close} />}
    </div>
  );
}

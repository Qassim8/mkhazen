"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  LuArrowLeft,
  LuArrowRight,
  LuFileText,
  LuLoaderCircle,
  LuPrinter,
  LuX,
} from "react-icons/lu";

import {
  ENTRY_TYPE_LABELS,
  getAccountingEntryDetail,
  type EntryDetail,
  type EntryDetailResponse,
} from "../services/accounting.services";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function amountText(value: number, currency: "USD" | "SDG") {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${
    currency === "SDG" ? "ج.س" : "$"
  }`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <div className="mt-1 break-words text-sm font-bold text-gray-900">{children}</div>
    </div>
  );
}

export default function EntryDetailsModal({
  entryId,
  onClose,
}: {
  entryId: string;
  onClose: () => void;
}) {
  // سلسلة التنقل بين القيود المرتبطة (آخر عنصر = القيد المعروض)
  const [trail, setTrail] = useState<string[]>([entryId]);
  const [result, setResult] = useState<{ id: string; data: EntryDetailResponse["data"] } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const currentId = trail[trail.length - 1];
  const loading = result?.id !== currentId && failedId !== currentId;
  const detail = result?.id === currentId ? result.data : null;

  useEffect(() => {
    let active = true;

    getAccountingEntryDetail(currentId)
      .then((response) => {
        if (active) setResult({ id: currentId, data: response.data });
      })
      .catch((error) => {
        if (!active) return;
        setFailedId(currentId);
        toast.error(error instanceof Error ? error.message : "تعذر تحميل تفاصيل القيد");
      });

    return () => {
      active = false;
    };
  }, [currentId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entry = detail?.entry;

  const relatedCard = (item: EntryDetail) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setTrail((current) => [...current, item.id])}
      className="w-full rounded-xl border border-gray-200 p-3 text-right transition hover:bg-gray-50 print:break-inside-avoid"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p dir="ltr" className="text-left text-xs font-bold text-gray-700">
            {item.entryNumber}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            {ENTRY_TYPE_LABELS[item.entryType] ?? item.entryType} — {formatDateTime(item.createdAt)}
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-700">
            <span className="text-emerald-700">{item.debitLabel}</span> ←{" "}
            <span className="text-red-700">{item.creditLabel}</span>
          </p>
          {item.isCorrectionReversal && <p className="mt-1 text-[11px] font-bold text-amber-600">قيد عكسي تصحيحي</p>}
        </div>
        <p dir="ltr" className="shrink-0 text-sm font-black text-gray-900">
          {amountText(item.amount, item.currency)}
        </p>
      </div>
    </button>
  );

  return createPortal(
    <div
      id="entry-details-print"
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4 print:static print:block print:bg-white print:p-0 print:backdrop-blur-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="تفاصيل القيد"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-gray-200 print:h-auto print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-950">تفاصيل القيد</h2>
            {entry && (
              <p dir="ltr" className="mt-0.5 text-left text-xs font-bold text-gray-500">
                {entry.entryNumber}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 print:hidden">
            {trail.length > 1 && (
              <button
                type="button"
                onClick={() => setTrail((current) => current.slice(0, -1))}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                <LuArrowRight className="h-4 w-4" />
                السابق
              </button>
            )}
            <button
              type="button"
              disabled={!entry}
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <LuPrinter className="h-4 w-4" />
              طباعة
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <LuX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] print:overflow-visible">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <LuLoaderCircle className="h-4 w-4 animate-spin" />
              جارٍ التحميل...
            </div>
          )}

          {failedId === currentId && !detail && (
            <p className="py-16 text-center text-sm text-red-600">تعذر تحميل تفاصيل القيد</p>
          )}

          {entry && detail && (
            <div className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="رقم القيد">
                  <span dir="ltr">{entry.entryNumber}</span>
                </Field>
                <Field label="التاريخ والوقت (توقيت الخرطوم)">{formatDateTime(entry.createdAt)}</Field>
                <Field label="النوع">{ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}</Field>
                <Field label="المرجع">{entry.reference || "—"}</Field>
                <div className="sm:col-span-2">
                  <Field label="البيان">{entry.description || "—"}</Field>
                </div>
                <Field label="سُجّل بواسطة">{entry.createdByName || "—"}</Field>
                {entry.isCorrectionReversal && (
                  <Field label="ملاحظة">
                    <span className="text-amber-600">قيد عكسي تصحيحي (يلغي قيدًا سابقًا)</span>
                  </Field>
                )}
              </section>

              <section className="grid gap-4 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 print:border-gray-300 print:bg-white">
                  <p className="text-[11px] font-bold text-emerald-700">الحساب المدين</p>
                  <p className="mt-1 font-black text-emerald-800">{entry.debitLabel}</p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 print:border-gray-300 print:bg-white">
                  <p className="text-[11px] font-bold text-red-700">الحساب الدائن</p>
                  <p className="mt-1 font-black text-red-800">{entry.creditLabel}</p>
                </div>

                <Field label="المبلغ">
                  <span dir="ltr">{amountText(entry.amount, entry.currency)}</span>
                </Field>
                <Field label="العملة">{entry.currency === "SDG" ? "جنيه سوداني" : "دولار أمريكي"}</Field>
                <Field label="سعر الصرف المستخدم">
                  {entry.currency === "SDG" && entry.exchangeRateUsed ? (
                    <span dir="ltr">1$ = {entry.exchangeRateUsed.toLocaleString("en-US", { maximumFractionDigits: 4 })} ج.س</span>
                  ) : (
                    "— (قيد بالدولار)"
                  )}
                </Field>
                <Field label="المبلغ بالدولار">
                  <span dir="ltr">{entry.amountUsd != null ? amountText(entry.amountUsd, "USD") : "—"}</span>
                </Field>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-gray-900">
                  <LuFileText className="h-4 w-4 text-gray-500" />
                  المستند المرتبط
                </h3>
                {detail.documents.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                    لا يوجد مستند مرتبط بهذا القيد (قيد يدوي أو افتتاحي)
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.documents.map((document, index) => (
                      <div
                        key={`${document.kind}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 print:break-inside-avoid"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-500">{document.title}</p>
                          <p className="mt-0.5 text-sm font-black text-gray-900">
                            {document.number && <span dir="ltr">{document.number} </span>}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-600">{document.summary}</p>
                        </div>
                        {document.href && (
                          <Link
                            href={document.href}
                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 print:hidden"
                          >
                            فتح
                            <LuArrowLeft className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-gray-900">
                  قيود مرتبطة
                  {detail.relatedEntries.length > 0 && (
                    <span className="mr-2 text-xs font-bold text-gray-400">({detail.relatedEntries.length})</span>
                  )}
                </h3>
                {detail.relatedEntries.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                    لا توجد قيود أخرى لنفس المستند أو المرجع
                  </p>
                ) : (
                  <div className="space-y-2">{detail.relatedEntries.map(relatedCard)}</div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }

          body > *:not(#entry-details-print) {
            display: none !important;
          }

          html,
          body {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}

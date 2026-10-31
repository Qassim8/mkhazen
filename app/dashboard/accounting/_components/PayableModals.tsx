"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { LuCheck, LuLoaderCircle, LuX } from "react-icons/lu";

import { formatMoney } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { getPayable, payPayable, type PayableDetail } from "../services/payables.services";

const FIELD =
  "min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm";
const PRIMARY_BUTTON =
  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50";
const SECONDARY_BUTTON =
  "min-h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50";

const METHOD_LABELS = { CASH: "نقداً / الخزينة", BANK: "حوالة / البنك" } as const;

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ModalShell({
  title,
  subtitle,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** ما تحتاجه نافذة الدفع من المستحق */
export interface PayTarget {
  id: string;
  description: string;
  currency: "USD" | "SDG";
  remainingAmount: number;
}

/* =====================================================================
   دفع (جزئي أو كامل) — خزنة أو بنك
===================================================================== */

export function PayPayableModal({
  payable,
  onClose,
  onDone,
}: {
  payable: PayTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();
  const [amount, setAmount] = useState(String(payable.remainingAmount));
  const [method, setMethod] = useState<"CASH" | "BANK">("CASH");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ remaining: number; paid: boolean } | null>(null);

  const numeric = Number(amount);
  const valid =
    Number.isFinite(numeric) &&
    numeric > 0 &&
    Math.round(numeric * 100) / 100 === numeric &&
    numeric <= payable.remainingAmount + 1e-9;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (!valid) {
      toast.error("أدخل مبلغًا صحيحًا لا يتجاوز المتبقي (منزلتان عشريتان كحد أقصى)");
      return;
    }

    const payload = { amount: numeric, method, notes: notes.trim() || null };

    try {
      setLoading(true);
      const result = await payPayable(payable.id, payload, {
        idempotencyKey: idempotency.keyFor({ id: payable.id, ...payload }),
      });
      idempotency.reset();
      toast.success(result.message);
      setDone({ remaining: result.data.remaining_amount, paid: result.data.status === "PAID" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفعة");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <ModalShell title="تم تسجيل الدفعة" subtitle={payable.description} onClose={onDone}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <LuCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-gray-800">
            {done.paid ? "تم سداد المستحق بالكامل" : `المتبقي بعد الدفعة: ${formatMoney(done.remaining, payable.currency)}`}
          </p>
          <button type="button" onClick={onDone} className={`${PRIMARY_BUTTON} w-full`}>
            تم
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="دفع مستحق" subtitle={payable.description} onClose={onClose} busy={loading}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex justify-between rounded-lg bg-gray-50 p-3 text-sm">
          <span className="text-gray-500">المتبقي</span>
          <span className="font-black text-amber-700">{formatMoney(payable.remainingAmount, payable.currency)}</span>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">
            مبلغ الدفعة ({payable.currency === "SDG" ? "ج.س" : "$"})
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-gray-500">جزئي أو كامل؛ لا يتجاوز المتبقي، ويُدفع بنفس عملة المستحق.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">طريقة الدفع</label>
          <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className={FIELD}>
            <option value="CASH">{METHOD_LABELS.CASH}</option>
            <option value="BANK">{METHOD_LABELS.BANK}</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">
            ملاحظات <span className="text-xs font-normal text-gray-400">اختياري</span>
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm"
          />
        </div>

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className={SECONDARY_BUTTON}>
            إلغاء
          </button>
          <button type="submit" disabled={loading || !valid} className={PRIMARY_BUTTON}>
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            تأكيد الدفع
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* =====================================================================
   سجل الدفعات + روابط الأصل والقيود
===================================================================== */

export function PayableHistoryModal({
  payableId,
  title,
  canViewAccounting,
  onClose,
}: {
  payableId: string;
  title: string;
  canViewAccounting: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PayableDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    getPayable(payableId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((error) => {
        if (!active) return;
        setFailed(true);
        toast.error(error instanceof Error ? error.message : "تعذر تحميل السجل");
      });

    return () => {
      active = false;
    };
  }, [payableId]);

  const entryLink = (number: string | null) =>
    canViewAccounting && number ? (
      <Link
        href={`/dashboard/accounting/journals?search=${encodeURIComponent(number)}`}
        className="font-mono text-[11px] font-bold text-gray-700 underline"
        dir="ltr"
      >
        {number}
      </Link>
    ) : null;

  return (
    <ModalShell title="سجل الدفعات" subtitle={title} onClose={onClose} wide>
      {!detail && !failed && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <LuLoaderCircle className="h-4 w-4 animate-spin" />
          جارٍ التحميل...
        </div>
      )}

      {failed && <p className="py-6 text-center text-sm text-red-600">تعذر تحميل السجل</p>}

      {detail && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-400">الإجمالي</p>
              <p className="font-black text-gray-900">{formatMoney(detail.totalAmount, detail.currency)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-400">دفعه المالك</p>
              <p className="font-black text-gray-900">{formatMoney(detail.ownerPaid, detail.currency)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-400">مدفوع من الخزينة/البنك</p>
              <p className="font-black text-emerald-700">{formatMoney(detail.paidAmount, detail.currency)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-400">المتبقي</p>
              <p className="font-black text-amber-700">{formatMoney(detail.remainingAmount, detail.currency)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            {detail.sourceType === "ASSET" && canViewAccounting && (
              <Link
                href={`/dashboard/accounting/assets?search=${encodeURIComponent(detail.description.replace(/^أصل:\s*/, ""))}`}
                className="font-bold text-gray-700 underline"
              >
                فتح الأصل
              </Link>
            )}
            {detail.recognitionEntryNumber && (
              <span className="inline-flex items-center gap-1">قيد المستحق: {entryLink(detail.recognitionEntryNumber)}</span>
            )}
            {detail.fxEntryNumber && (
              <span className="inline-flex items-center gap-1">قيد فرق الصرف: {entryLink(detail.fxEntryNumber)}</span>
            )}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-black text-gray-900">الدفعات اللاحقة</h3>
            {detail.payments.length === 0 ? (
              <p className="text-xs text-gray-500">لا توجد دفعات لاحقة بعد</p>
            ) : (
              <div className="space-y-2">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-gray-900">{formatMoney(payment.amount, detail.currency)}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {dateTime(payment.createdAt)} — {METHOD_LABELS[payment.method] ?? payment.method}
                          {payment.createdByName ? ` — ${payment.createdByName}` : ""}
                        </p>
                        {payment.amountUsd != null && detail.currency === "SDG" && (
                          <p dir="ltr" className="mt-0.5 text-right text-[11px] text-gray-500">
                            {formatMoney(payment.amountUsd, "USD")}
                            {payment.exchangeRate ? ` @ ${payment.exchangeRate}` : ""}
                          </p>
                        )}
                        {payment.notes && <p className="mt-1 text-[11px] text-gray-600">{payment.notes}</p>}
                      </div>
                      {entryLink(payment.journalEntryNumber)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </ModalShell>
  );
}

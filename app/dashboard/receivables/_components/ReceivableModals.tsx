"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { LuCheck, LuLoaderCircle, LuPrinter, LuX } from "react-icons/lu";

import { overpaymentNote } from "@/lib/credit";
import { formatSDG } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import {
  adjustCreditRemaining,
  closeCreditBadDebt,
  getCreditHistory,
  recordCreditPayment,
  type CreditHistory,
  type CreditPaymentResult,
  type ReceivableRow,
} from "../services/receivables.services";

const FIELD =
  "min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm";
const PRIMARY_BUTTON =
  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50";
const SECONDARY_BUTTON =
  "min-h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50";

const METHOD_LABELS: Record<string, string> = {
  CASH: "نقداً / الخزينة",
  CARD: "بطاقة",
  BANK_TRANSFER: "حوالة / البنك",
};

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

export function openPaymentReceipt(orderId: string, paymentId: string) {
  window.open(
    `/dashboard/pos/receipt/${orderId}/payment/${paymentId}`,
    "_blank",
    "width=420,height=700",
  );
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

/* =====================================================================
   تسجيل دفعة
===================================================================== */

export function PaymentModal({
  row,
  onClose,
  onDone,
}: {
  row: ReceivableRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();
  const remaining = Number(row.remaining_sdg ?? 0);

  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");
  const [notes, setNotes] = useState("");
  const [confirmOver, setConfirmOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<CreditPaymentResult | null>(null);

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0 && Math.round(numeric * 100) / 100 === numeric;
  const overpaid = valid ? Math.round((numeric - remaining) * 100) / 100 : 0;

  async function submit(withOverpaymentNote: boolean) {
    if (loading || !valid) return;

    const finalNotes = [notes.trim(), withOverpaymentNote ? overpaymentNote(overpaid) : ""]
      .filter(Boolean)
      .join(" — ");

    const payload = {
      amount: numeric,
      paymentMethod: method,
      notes: finalNotes || null,
    };

    try {
      setLoading(true);
      const result = await recordCreditPayment(row.order_id, payload, {
        idempotencyKey: idempotency.keyFor({ id: row.order_id, ...payload }),
      });
      idempotency.reset();
      toast.success(result.message);
      setDone(result);
      openPaymentReceipt(row.order_id, result.paymentId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفعة");
      setConfirmOver(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      toast.error("أدخل مبلغًا صحيحًا (منزلتان عشريتان كحد أقصى)");
      return;
    }
    if (overpaid > 0.004) {
      setConfirmOver(true);
      return;
    }
    void submit(false);
  }

  if (done) {
    return (
      <ModalShell title="تم تسجيل الدفعة" subtitle={`فاتورة ${row.order_number}`} onClose={onDone}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <LuCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-gray-800">
            {done.closed
              ? "تم سداد الفاتورة بالكامل"
              : `المتبقي بعد الدفعة: ${formatSDG(done.remainingAmount)}`}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => openPaymentReceipt(row.order_id, done.paymentId)} className={SECONDARY_BUTTON}>
              <span className="inline-flex items-center justify-center gap-2">
                <LuPrinter className="h-4 w-4" />
                طباعة الإيصال
              </span>
            </button>
            <button type="button" onClick={onDone} className={PRIMARY_BUTTON}>
              تم
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="تسجيل دفعة" subtitle={`فاتورة ${row.order_number} — ${row.credit_customer_name ?? ""}`} onClose={onClose} busy={loading}>
      {confirmOver ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">
            المبلغ أكبر من المتبقي بـ {formatSDG(overpaid)}، هل هو تعويض عن فرق الصرف؟
          </p>
          <p className="text-xs text-gray-500">
            ستُسجَّل الزيادة إيرادًا عاديًا وتُغلق الفاتورة، وتُضاف ملاحظة تلقائية للدفعة.
          </p>
          <div className="flex gap-3">
            <button type="button" disabled={loading} onClick={() => setConfirmOver(false)} className={SECONDARY_BUTTON}>
              رجوع
            </button>
            <button type="button" disabled={loading} onClick={() => void submit(true)} className={PRIMARY_BUTTON}>
              {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
              نعم، تعويض فرق صرف
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">المتبقي</span>
              <span className="font-black text-amber-700">{formatSDG(remaining)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-gray-700">مبلغ الدفعة (ج.س)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-gray-700">طريقة الدفع</label>
            <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className={FIELD}>
              <option value="CASH">نقداً / الخزينة</option>
              <option value="BANK_TRANSFER">حوالة / البنك</option>
              <option value="CARD">بطاقة</option>
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
              حفظ الدفعة
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

/* =====================================================================
   تعديل المتبقي (owner/admin)
===================================================================== */

export function AdjustModal({
  row,
  onClose,
  onDone,
}: {
  row: ReceivableRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();
  const remaining = Number(row.remaining_sdg ?? 0);

  const [value, setValue] = useState(String(remaining));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric > 0 && Math.round(numeric * 100) / 100 === numeric;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (!valid) {
      toast.error("أدخل متبقيًا صحيحًا أكبر من صفر (لإغلاق الدين استخدم الإغلاق كدين معدوم)");
      return;
    }
    if (numeric === remaining) {
      toast.error("المتبقي الجديد يساوي الحالي");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("سبب التعديل مطلوب");
      return;
    }

    const payload = { newRemaining: numeric, reason: reason.trim() };

    try {
      setLoading(true);
      const result = await adjustCreditRemaining(row.order_id, payload, {
        idempotencyKey: idempotency.keyFor({ id: row.order_id, ...payload }),
      });
      idempotency.reset();
      toast.success(result.message);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تعديل المتبقي");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="تعديل المتبقي" subtitle={`فاتورة ${row.order_number} — ${row.credit_customer_name ?? ""}`} onClose={onClose} busy={loading}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          تعديل المتبقي (زيادة أو نقصانًا بعد تفاوض) لا يُنشئ قيدًا محاسبيًا، ويُسجَّل في سجل التعديلات.
        </p>
        <div className="flex justify-between rounded-lg bg-gray-50 p-3 text-sm">
          <span className="text-gray-500">المتبقي الحالي</span>
          <span className="font-black text-amber-700">{formatSDG(remaining)}</span>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">المتبقي الجديد (ج.س)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">سبب التعديل (إلزامي)</label>
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: اتفاق مع العميل على خصم جزء من المتبقي"
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm"
          />
        </div>

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className={SECONDARY_BUTTON}>
            إلغاء
          </button>
          <button type="submit" disabled={loading} className={PRIMARY_BUTTON}>
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            حفظ التعديل
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* =====================================================================
   إغلاق كدين معدوم (owner/admin)
===================================================================== */

export function CloseDebtModal({
  row,
  onClose,
  onDone,
}: {
  row: ReceivableRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (loading) return;
    const payload = { notes: notes.trim() || null };

    try {
      setLoading(true);
      const result = await closeCreditBadDebt(row.order_id, payload, {
        idempotencyKey: idempotency.keyFor({ id: row.order_id, ...payload }),
      });
      idempotency.reset();
      toast.success(result.message);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إغلاق الدين");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="إغلاق كدين معدوم" subtitle={`فاتورة ${row.order_number} — ${row.credit_customer_name ?? ""}`} onClose={onClose} busy={loading}>
      <div className="space-y-4">
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">
          سيُشطب المتبقي {formatSDG(Number(row.remaining_sdg ?? 0))} نهائيًا، وتتحول التكلفة المؤجلة للجزء غير المحصَّل إلى مصروف.
          لا يمكن التراجع عن هذا الإجراء.
        </p>

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
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            تأكيد الإغلاق كدين معدوم
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* =====================================================================
   سجل الدفعات والتعديلات
===================================================================== */

export function HistoryModal({
  row,
  isManager,
  onClose,
}: {
  row: ReceivableRow;
  isManager: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<CreditHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    getCreditHistory(row.order_id)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((error) => {
        if (!active) return;
        setFailed(true);
        toast.error(error instanceof Error ? error.message : "تعذر تحميل السجل");
      });

    return () => {
      active = false;
    };
  }, [row.order_id]);

  return (
    <ModalShell
      title="سجل الدفعات والتعديلات"
      subtitle={`فاتورة ${row.order_number} — ${row.credit_customer_name ?? ""}`}
      onClose={onClose}
      wide
    >
      {!history && !failed && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <LuLoaderCircle className="h-4 w-4 animate-spin" />
          جارٍ التحميل...
        </div>
      )}

      {failed && <p className="py-6 text-center text-sm text-red-600">تعذر تحميل السجل</p>}

      {history && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-black text-gray-900">الدفعات</h3>
            {history.payments.length === 0 ? (
              <p className="text-xs text-gray-500">لا توجد دفعات</p>
            ) : (
              <div className="space-y-2">
                {history.payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-gray-900">{formatSDG(payment.amount)}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {dateTime(payment.paymentDate)} — {METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                          {payment.createdByName ? ` — ${payment.createdByName}` : ""}
                        </p>
                        {payment.notes && <p className="mt-1 text-[11px] text-gray-600">{payment.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => openPaymentReceipt(row.order_id, payment.id)}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
                      >
                        <LuPrinter className="h-3.5 w-3.5" />
                        إيصال
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {isManager && (
            <section>
              <h3 className="mb-2 text-sm font-black text-gray-900">التعديلات</h3>
              {history.adjustments.length === 0 ? (
                <p className="text-xs text-gray-500">لا توجد تعديلات</p>
              ) : (
                <div className="space-y-2">
                  {history.adjustments.map((adjustment) => (
                    <div key={adjustment.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                      <p className="font-bold text-gray-900">
                        {adjustment.type === "BAD_DEBT" ? "إغلاق كدين معدوم" : "تعديل المتبقي"}:{" "}
                        <span className="text-gray-500">{formatSDG(adjustment.oldRemaining)}</span> ←{" "}
                        <span className="font-black">{formatSDG(adjustment.newRemaining)}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {dateTime(adjustment.createdAt)}
                        {adjustment.createdByName ? ` — ${adjustment.createdByName}` : ""}
                      </p>
                      {adjustment.reason && <p className="mt-1 text-[11px] text-gray-600">{adjustment.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </ModalShell>
  );
}

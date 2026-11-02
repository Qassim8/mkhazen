"use client";

/**
 * نافذة حركة مالية لخياط (بالجنيه) — صفحة الموظفين وصفحة الخياط:
 *   ADVANCE        سلفة مفتوحة غير مرتبطة بالمستحقات (TAILOR_ADVANCES ← الخزينة/البنك)
 *   ADVANCE_RETURN استرداد نقدي لا يتجاوز رصيد السلف
 *   SETTLEMENT     دفع المستحقات (كامل أو جزء) بلا أي خصم تلقائي؛ مع خيار "خصم من رصيد السلف"
 *                  بمبلغ يحدده المستخدم (TAILORS_PAYABLE ← TAILOR_ADVANCES) والصافي من الخزينة/البنك
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { formatSDG } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { payTailorDues } from "@/app/dashboard/accounting/services/accounting.services";

export type TailorPayType = "ADVANCE" | "ADVANCE_RETURN" | "SETTLEMENT";

export interface PayTailorTarget {
  tailorId: string;
  name: string;
  /** المتبقي من المستحقات (كل الشهور) */
  remainingSdg: number;
  /** رصيد السلف العام (المتاح للاسترداد والخصم) */
  advanceBalanceSdg: number;
}

const FIELD = "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base disabled:opacity-60 md:text-sm";

export default function TailorPayModal({
  tailor,
  type,
  onClose,
  onDone,
}: {
  tailor: PayTailorTarget;
  type: TailorPayType;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState(
    type === "SETTLEMENT" ? tailor.remainingSdg.toFixed(2) : type === "ADVANCE_RETURN" ? String(tailor.advanceBalanceSdg) : "",
  );
  const [method, setMethod] = useState<"CASH" | "BANK">("CASH");
  const [notes, setNotes] = useState("");
  const [deductOn, setDeductOn] = useState(false);
  const [deduct, setDeduct] = useState("");
  const [saving, setSaving] = useState(false);

  const value = Number(amount);
  const deductValue = deductOn ? Number(deduct) || 0 : 0;
  const net = Math.round((value - deductValue) * 100) / 100;

  const title =
    type === "ADVANCE"
      ? `سلفة للخياط ${tailor.name}`
      : type === "ADVANCE_RETURN"
        ? `استرداد سلفة من الخياط ${tailor.name}`
        : `دفع مستحقات ${tailor.name}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    if (type === "SETTLEMENT" && value > tailor.remainingSdg) {
      toast.error(`المبلغ يتجاوز المستحقات المتبقية (${formatSDG(tailor.remainingSdg)}).`);
      return;
    }
    if (type === "ADVANCE_RETURN" && value > tailor.advanceBalanceSdg) {
      toast.error(`الاسترداد يتجاوز رصيد السلف (${formatSDG(tailor.advanceBalanceSdg)}).`);
      return;
    }
    if (type === "SETTLEMENT" && deductOn) {
      if (!(deductValue > 0)) {
        toast.error("أدخل مبلغ الخصم من السلف.");
        return;
      }
      if (deductValue > tailor.advanceBalanceSdg) {
        toast.error(`الخصم يتجاوز رصيد السلف (${formatSDG(tailor.advanceBalanceSdg)}).`);
        return;
      }
      if (deductValue > value) {
        toast.error("المخصوم يتجاوز مبلغ السداد.");
        return;
      }
    }

    const payload = {
      tailorId: tailor.tailorId,
      kind: type,
      amount: value,
      paymentMethod: method,
      ...(type === "SETTLEMENT" && deductOn ? { deductAdvance: deductValue } : {}),
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      const response = await payTailorDues(payload, { idempotencyKey: idempotency.keyFor(payload) });
      idempotency.reset();
      toast.success(response.message ?? "تم التسجيل.");
      onDone();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفعة.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        dir="rtl"
        className="max-h-[92vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        noValidate
      >
        <h3 className="text-sm font-black">{title}</h3>

        <div className="space-y-1 rounded-xl bg-gray-50 p-3 text-xs leading-6 text-gray-600">
          <p>
            المستحقات المتبقية: <strong>{formatSDG(tailor.remainingSdg)}</strong>
          </p>
          <p>
            رصيد السلف: <strong>{formatSDG(tailor.advanceBalanceSdg)}</strong>
          </p>
          <p className="text-[11px] text-gray-500">
            {type === "ADVANCE"
              ? "مبلغ مفتوح غير مرتبط بالمستحقات وليس مصروفًا: يُسترد نقدًا أو يُخصم عند دفع المستحقات."
              : type === "ADVANCE_RETURN"
                ? "يدخل المبلغ الخزينة أو البنك ويُنقص رصيد السلف، ولا يتجاوز الرصيد."
                : "دفع المستحقات لا يخصم من السلف تلقائيًا؛ الخصم اختياري وبمبلغ تحدده."}
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-gray-600">
            {type === "SETTLEMENT" ? "مبلغ السداد من المستحقات (ج.س)" : "المبلغ (ج.س)"}
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={saving}
            className={FIELD}
          />
        </label>

        {type === "SETTLEMENT" && tailor.advanceBalanceSdg > 0 && (
          <div className="space-y-2 rounded-xl border border-gray-200 p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-gray-700">
              <input
                type="checkbox"
                checked={deductOn}
                disabled={saving}
                onChange={(event) => {
                  setDeductOn(event.target.checked);
                  if (event.target.checked && !deduct) {
                    setDeduct(String(Math.min(tailor.advanceBalanceSdg, value > 0 ? value : tailor.advanceBalanceSdg)));
                  }
                }}
              />
              خصم من رصيد السلف ({formatSDG(tailor.advanceBalanceSdg)})
            </label>
            {deductOn && (
              <>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={deduct}
                  onChange={(event) => setDeduct(event.target.value)}
                  disabled={saving}
                  placeholder="المبلغ المخصوم"
                  className={FIELD}
                />
                <p className="text-[11px] text-gray-500">
                  تنخفض المستحقات بالمبلغ كاملًا، ويُدفع من الخزينة/البنك الصافي فقط:{" "}
                  <strong>{formatSDG(Math.max(net, 0))}</strong>
                </p>
              </>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-bold text-gray-600">{type === "ADVANCE_RETURN" ? "تُستلم في" : "تُدفع من"}</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as "CASH" | "BANK")}
            disabled={saving}
            className={FIELD}
          >
            <option value="CASH">نقداً / الخزينة</option>
            <option value="BANK">حوالة / البنك</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-gray-600">ملاحظات</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={2}
            disabled={saving}
            className={`${FIELD} resize-none`}
          />
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 flex-1 rounded-xl border border-gray-200 text-xs font-bold">
            إلغاء
          </button>
          <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-xl bg-gray-900 text-xs font-bold text-white disabled:opacity-50">
            {saving ? "جارٍ الحفظ..." : "تأكيد"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

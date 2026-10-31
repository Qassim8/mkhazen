"use client";

import { useState } from "react";

/**
 * قسم "تقسيم الدفع" المشترك بين نموذج الأصل ونموذج المصروف.
 *
 * القيمة الكاملة = دفعه المالك من ماله + المدفوع الآن + المتبقي (مستحق على المحل).
 * الافتراضي: كل المبلغ مدفوع الآن (السلوك المعتاد)؛ لا يُرسل أي جزء للسيرفر إلا عند التقسيم.
 */

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export interface SplitPaymentPayload {
  ownerPaid?: number;
  paidNow?: number;
  remaining?: number;
  dueDate?: string | null;
}

export function useSplitPayment(total: number) {
  const [owner, setOwner] = useState("");
  // null = الباقي كله مدفوع الآن (الافتراضي)
  const [paidNow, setPaidNow] = useState<string | null>(null);
  const [due, setDue] = useState("");

  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const ownerValue = toNumber(owner);
  const paidNowValue = paidNow === null ? Math.max(round2(safeTotal - ownerValue), 0) : toNumber(paidNow);
  const remaining = round2(safeTotal - ownerValue - paidNowValue);

  const isSplit = ownerValue > 0 || remaining > 0.004;

  let error: string | null = null;
  if (remaining < -0.004) {
    error = "مجموع دفعه المالك والمدفوع الآن أكبر من القيمة الكاملة";
  }
  const hasMoreThanTwoDecimals = [ownerValue, paidNowValue].some((value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-6);
  if (!error && hasMoreThanTwoDecimals) {
    error = "المبالغ يجب ألا تتجاوز منزلتين عشريتين";
  }

  const payload = (): SplitPaymentPayload =>
    isSplit
      ? {
          ownerPaid: ownerValue,
          paidNow: paidNowValue,
          remaining: Math.max(remaining, 0),
          dueDate: remaining > 0.004 && due ? due : null,
        }
      : {};

  return {
    owner,
    setOwner,
    paidNow,
    setPaidNow,
    due,
    setDue,
    ownerValue,
    paidNowValue,
    remaining: Math.max(remaining, 0),
    isSplit,
    error,
    payload,
  };
}

export type SplitPaymentState = ReturnType<typeof useSplitPayment>;

const FIELD =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400";

function format(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSplitFields({
  split,
  currency,
  disabled = false,
}: {
  split: SplitPaymentState;
  currency: "USD" | "SDG";
  disabled?: boolean;
}) {
  const unit = currency === "SDG" ? "ج.س" : "$";

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div>
        <h3 className="text-sm font-black text-gray-900">تقسيم الدفع</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          تُسجَّل القيمة الكاملة اليوم، ويمكن دفع جزء منها الآن والباقي لاحقًا. الافتراضي: كل المبلغ مدفوع الآن.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-gray-700">مدفوع الآن</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              disabled={disabled}
              value={split.paidNow === null ? (split.paidNowValue ? String(split.paidNowValue) : "") : split.paidNow}
              onChange={(event) => split.setPaidNow(event.target.value)}
              placeholder="0.00"
              className={`${FIELD} pl-14`}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{unit}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">يُخصم من الخزينة أو البنك حسب طريقة الدفع المختارة.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-gray-700">
            دفعه المالك من ماله
            <span className="mr-1 text-xs font-normal text-gray-400">اختياري</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              disabled={disabled}
              value={split.owner}
              onChange={(event) => split.setOwner(event.target.value)}
              placeholder="0.00"
              className={`${FIELD} pl-14`}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{unit}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">لا يُخصم من الخزينة، ويُضاف إلى رأس المال.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-gray-700">المتبقي (مستحق على المحل)</label>
          <div
            className={`flex h-11 items-center rounded-lg border px-3 text-sm font-black ${
              split.remaining > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-500"
            }`}
          >
            <span dir="ltr">
              {format(split.remaining)} {unit}
            </span>
          </div>
        </div>

        {split.remaining > 0.004 && (
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              تاريخ الاستحقاق
              <span className="mr-1 text-xs font-normal text-gray-400">اختياري</span>
            </label>
            <input
              type="date"
              disabled={disabled}
              value={split.due}
              onChange={(event) => split.setDue(event.target.value)}
              className={FIELD}
            />
          </div>
        )}
      </div>

      {split.error && <p className="text-xs font-semibold text-red-600">{split.error}</p>}
    </section>
  );
}

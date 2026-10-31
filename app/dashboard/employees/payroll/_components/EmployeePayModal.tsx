"use client";

/**
 * نافذة حركة مالية لموظف (بالجنيه) — تُستخدم من صفحة الرواتب وصفحة الموظف:
 *   ADVANCE        سلفة: مبلغ مفتوح غير مرتبط بالراتب (EMPLOYEE_ADVANCES ← الخزينة/البنك)
 *   ADVANCE_RETURN استرداد نقدي: لا يتجاوز رصيد السلف
 *   SALARY         دفع راتب بأي مبلغ وفي أي وقت (الراتب المسجل مجرد اقتراح)، مع ملاحظة للفترة،
 *                  وخيار "خصم من رصيد السلف" (الراتب كاملًا مصروف، والصافي من الخزينة/البنك)
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { serverFetch } from "@/lib/api-client";
import { formatSDG } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

export type EmployeePayType = "ADVANCE" | "ADVANCE_RETURN" | "SALARY";

export interface PayEmployeeTarget {
  userId: string;
  name: string;
  /** الراتب المسجل (اقتراح فقط) */
  salarySdg: number;
  /** رصيد السلف الحالي */
  advanceBalanceSdg: number;
}

const FIELD = "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base disabled:opacity-60 md:text-sm";

export default function EmployeePayModal({
  employee,
  type,
  period,
  onClose,
  onDone,
}: {
  employee: PayEmployeeTarget;
  type: EmployeePayType;
  /** YYYY-MM-01 (الشهر المعروض) */
  period: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState(type === "ADVANCE_RETURN" ? String(employee.advanceBalanceSdg) : "");
  const [month, setMonth] = useState(period.slice(0, 7));
  const [deductOn, setDeductOn] = useState(false);
  const [deduct, setDeduct] = useState("");
  const [method, setMethod] = useState<"CASH" | "BANK">("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const value = Number(amount);
  const deductValue = deductOn ? Number(deduct) || 0 : 0;
  const net = Math.round((value - deductValue) * 100) / 100;

  const title =
    type === "ADVANCE"
      ? `سلفة للموظف ${employee.name}`
      : type === "ADVANCE_RETURN"
        ? `استرداد سلفة من ${employee.name}`
        : `دفع راتب ${employee.name}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    if (type === "ADVANCE_RETURN" && value > employee.advanceBalanceSdg) {
      toast.error(`الاسترداد يتجاوز رصيد السلف (${formatSDG(employee.advanceBalanceSdg)}).`);
      return;
    }

    if (type === "SALARY" && deductOn) {
      if (!(deductValue > 0)) {
        toast.error("أدخل مبلغ الخصم من السلف.");
        return;
      }
      if (deductValue > employee.advanceBalanceSdg) {
        toast.error(`الخصم يتجاوز رصيد السلف (${formatSDG(employee.advanceBalanceSdg)}).`);
        return;
      }
      if (deductValue > value) {
        toast.error("المخصوم يتجاوز مبلغ الراتب.");
        return;
      }
    }

    const payload = {
      employeeId: employee.userId,
      period: type === "SALARY" ? `${month}-01` : period,
      type,
      amount: value,
      paymentMethod: method,
      ...(type === "SALARY" && deductOn ? { deductAdvance: deductValue } : {}),
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      const response = await serverFetch<{ message?: string }>("/api/payroll", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Idempotency-Key": idempotency.keyFor(payload) },
      });
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

        <p className="rounded-xl bg-gray-50 p-3 text-xs leading-6 text-gray-600">
          رصيد السلف الحالي: <strong>{formatSDG(employee.advanceBalanceSdg)}</strong>
          <span className="block">
            {type === "ADVANCE"
              ? "مبلغ مفتوح غير مرتبط بالراتب، وليس مصروفًا: يُسترد نقدًا أو يُخصم من راتب لاحق."
              : type === "ADVANCE_RETURN"
                ? "يدخل المبلغ الخزينة أو البنك ويُنقص رصيد السلف، ولا يتجاوز الرصيد."
                : "مصروف رواتب بأي مبلغ وفي أي وقت؛ الراتب المسجل مجرد اقتراح."}
          </span>
          {type === "SALARY" && employee.salarySdg > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(employee.salarySdg))}
              className="mt-1 font-bold text-(--primary-red) underline"
            >
              استخدام الراتب المسجل ({formatSDG(employee.salarySdg)})
            </button>
          )}
        </p>

        {type === "SALARY" && (
          <label className="block">
            <span className="text-xs font-bold text-gray-600">الفترة (ملاحظة للشهر الذي يخصه الراتب)</span>
            <input
              type="month"
              value={month}
              max={period.slice(0, 7)}
              onChange={(event) => event.target.value && setMonth(event.target.value)}
              disabled={saving}
              className={FIELD}
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs font-bold text-gray-600">المبلغ (ج.س)</span>
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

        {type === "SALARY" && employee.advanceBalanceSdg > 0 && (
          <div className="space-y-2 rounded-xl border border-gray-200 p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-gray-700">
              <input
                type="checkbox"
                checked={deductOn}
                disabled={saving}
                onChange={(event) => {
                  setDeductOn(event.target.checked);
                  if (event.target.checked && !deduct) {
                    setDeduct(String(Math.min(employee.advanceBalanceSdg, value > 0 ? value : employee.advanceBalanceSdg)));
                  }
                }}
              />
              خصم من رصيد السلف ({formatSDG(employee.advanceBalanceSdg)})
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
                  الراتب كاملًا مصروف رواتب، ويُدفع من الخزينة/البنك الصافي فقط:{" "}
                  <strong>{formatSDG(Math.max(net, 0))}</strong>
                </p>
              </>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-bold text-gray-600">
            {type === "ADVANCE_RETURN" ? "تُستلم في" : "تُدفع من"}
          </span>
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

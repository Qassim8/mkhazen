"use client";

/**
 * مودال تحويل العملة (جنيه ⇄ دولار)
 * الكاشير بيستلم جنيه، والمشتريات بتتدفع دولار، فالمدير محتاج يسجّل
 * عملية شراء الدولار (أو بيعه) عشان أرصدة الخزينة بالعملتين تفضل صحيحة.
 * أي فرق بين سعر التحويل الفعلي وسعر النظام بيتسجل ربح/خسارة فروق صرف.
 */

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { LuArrowLeftRight, LuX } from "react-icons/lu";

import { createCurrencyExchange } from "../services/accounting.services";
import { useExchangeRate } from "@/components/shared/useExchangeRate";
import { formatRate, formatUSD } from "@/lib/currency";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Account = "CASH" | "BANK";

export default function CurrencyExchangeModal({ onClose, onCreated }: Props) {
  const { rate: systemRate } = useExchangeRate();

  const [fromCurrency, setFromCurrency] = useState<"SDG" | "USD">("SDG");
  const [fromAccount, setFromAccount] = useState<Account>("CASH");
  const [toAccount, setToAccount] = useState<Account>("CASH");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toCurrency = fromCurrency === "SDG" ? "USD" : "SDG";

  const preview = useMemo(() => {
    const from = Number(fromAmount);
    const to = Number(toAmount);

    if (!(from > 0) || !(to > 0)) return null;

    const sdg = fromCurrency === "SDG" ? from : to;
    const usd = fromCurrency === "SDG" ? to : from;
    const actualRate = sdg / usd;

    // نتيجة فرق الصرف مقارنة بسعر النظام (بالدولار)
    const fx = systemRate
      ? fromCurrency === "SDG"
        ? usd - sdg / systemRate
        : sdg / systemRate - usd
      : 0;

    return { actualRate, fx };
  }, [fromAmount, toAmount, fromCurrency, systemRate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!preview) {
      toast.error("أدخل المبلغين بشكل صحيح");
      return;
    }

    setSubmitting(true);

    try {
      const result = await createCurrencyExchange({
        fromCurrency,
        fromAccount,
        fromAmount: Number(fromAmount),
        toAccount,
        toAmount: Number(toAmount),
        notes: notes.trim() || null,
      });

      toast.success(result.message);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحويل العملة");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        dir="rtl"
        className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
              <LuArrowLeftRight className="h-5 w-5" />
              تحويل عملة
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              سعر النظام الحالي: <span dir="ltr">{formatRate(systemRate)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">نوع العملية</span>
            <select
              value={fromCurrency}
              onChange={(event) => setFromCurrency(event.target.value as "SDG" | "USD")}
              className={fieldClass}
            >
              <option value="SDG">بيع جنيه / شراء دولار</option>
              <option value="USD">بيع دولار / شراء جنيه</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">من حساب</span>
            <select
              value={fromAccount}
              onChange={(event) => setFromAccount(event.target.value as Account)}
              className={fieldClass}
            >
              <option value="CASH">الخزينة</option>
              <option value="BANK">البنك</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              المبلغ الخارج ({fromCurrency === "SDG" ? "ج.س" : "$"})
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={fromAmount}
              onChange={(event) => setFromAmount(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              المبلغ الداخل ({toCurrency === "SDG" ? "ج.س" : "$"})
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={toAmount}
              onChange={(event) => setToAmount(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">إلى حساب</span>
            <select
              value={toAccount}
              onChange={(event) => setToAccount(event.target.value as Account)}
              className={fieldClass}
            >
              <option value="CASH">الخزينة</option>
              <option value="BANK">البنك</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">ملاحظة</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="مثال: صرافة السوق"
              className={fieldClass}
            />
          </label>
        </div>

        {preview && (
          <div className="rounded-xl bg-gray-50 p-3 text-xs">
            <p>
              سعر التحويل الفعلي:{" "}
              <strong dir="ltr">{formatRate(preview.actualRate)}</strong>
            </p>
            {systemRate ? (
              <p
                className={`mt-1 font-bold ${
                  preview.fx < 0 ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {preview.fx < 0 ? "خسارة" : "ربح"} فرق صرف تقريبي:{" "}
                <span dir="ltr">{formatUSD(Math.abs(preview.fx))}</span>
              </p>
            ) : null}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-700"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting || !preview}
            className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "جارٍ التسجيل..." : "تسجيل التحويل"}
          </button>
        </div>
      </form>
    </div>
  );
}

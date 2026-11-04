"use client";

import { formatUSD } from "@/lib/currency";

import type { PurchasePaymentFunds } from "../services/order.services";

/** رقم موجب من حقل نصي، وإلا صفر (بمنزلتين) */
export function parseMixedAmount(value: string) {
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

/** رصيد الحساب لا يكفي جزءه (لا يُعرف الرصيد للكاشير فلا يُحجب شيء هنا) */
export function isMixedPartShort(funds: PurchasePaymentFunds | null, account: "cash" | "bank", amount: number) {
  if (!funds?.visible || amount <= 0) return false;
  return Math.round(amount * 100) > Math.round(funds[account].usd * 100);
}

interface Props {
  cash: string;
  bank: string;
  funds: PurchasePaymentFunds | null;
  disabled?: boolean;
  onChange: (next: { cash: string; bank: string }) => void;
}

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm outline-none transition focus:border-(--primary-red)";

/** حقلا مبلغ (خزينة + بنك) مع الرصيد المتاح تحت كل واحد ومجموعهما */
export default function MixedPaymentFields({ cash, bank, funds, disabled, onChange }: Props) {
  const cashValue = parseMixedAmount(cash);
  const bankValue = parseMixedAmount(bank);
  const total = Math.round((cashValue + bankValue) * 100) / 100;

  const parts = [
    { key: "cash" as const, label: "من الخزينة", value: cash, number: cashValue },
    { key: "bank" as const, label: "من البنك", value: bank, number: bankValue },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {parts.map((part) => {
          const available = funds?.visible ? funds[part.key].usd : null;
          const short = isMixedPartShort(funds, part.key, part.number);

          return (
            <div key={part.key}>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                {part.label}
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={part.value}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    cash: part.key === "cash" ? event.target.value : cash,
                    bank: part.key === "bank" ? event.target.value : bank,
                  })
                }
                className={inputClass}
              />

              {available !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  المتاح في {part.key === "cash" ? "الخزينة" : "البنك"}:{" "}
                  <span className="font-mono font-bold text-gray-800">{formatUSD(available)}</span>
                </p>
              )}

              {short && available !== null && (
                <p className="mt-1 text-xs font-semibold text-rose-600">
                  {`رصيد ${part.key === "cash" ? "الخزينة" : "البنك"} غير كافٍ: المتاح ${available.toFixed(2)} دولار، والمطلوب ${part.number.toFixed(2)} دولار. موّل الحساب أولًا أو أدخل مبلغ دفع أقل.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
        <span className="text-gray-500">مجموع الدفعة (خزينة + بنك)</span>
        <span className="font-mono font-bold text-gray-900">{formatUSD(total)}</span>
      </div>
    </div>
  );
}

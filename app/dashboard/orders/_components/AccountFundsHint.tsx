"use client";

import { formatSDG, formatUSD } from "@/lib/currency";
import {
  accountLabel,
  conversionLine,
  insufficientMessage,
  planFunding,
  staleRateAge,
} from "@/lib/purchase-funding";

import type { PurchasePaymentFunds } from "../services/order.services";

/** خطة تمويل حساب (null لو الأرصدة غير ظاهرة لهذا الدور أو لم تُحمَّل) */
export function accountPlan(funds: PurchasePaymentFunds | null, account: "cash" | "bank", amount: number) {
  if (!funds?.visible || amount <= 0) return null;
  return planFunding(funds[account], amount, funds.rate);
}

/** سطور التحويل لملخص التأكيد */
export function conversionNotes(funds: PurchasePaymentFunds | null, parts: { account: "cash" | "bank"; amount: number }[]) {
  return parts.flatMap(({ account, amount }) => {
    const plan = accountPlan(funds, account, amount);
    return plan && plan.covered && plan.sdgNeeded > 0 ? [conversionLine(plan, funds?.rate ?? null, account)] : [];
  });
}

/** تحت حقل المبلغ: رصيد الحساب بالدولار والجنيه، وسطر التحويل أو سبب الرفض */
export default function AccountFundsHint({
  funds,
  account,
  amount,
}: {
  funds: PurchasePaymentFunds | null;
  account: "cash" | "bank";
  amount: number;
}) {
  if (!funds?.visible) return null;

  const balances = funds[account];
  const plan = accountPlan(funds, account, amount);

  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className="text-gray-500">
        المتاح في {accountLabel(account)}:{" "}
        <span className="font-mono font-bold text-gray-800">{formatUSD(balances.usd)}</span> و{" "}
        <span className="font-mono font-bold text-gray-800">{formatSDG(balances.sdg)}</span>
      </p>

      {plan && plan.covered && plan.sdgNeeded > 0 && (
        <p className="rounded-lg bg-sky-50 px-2 py-1 font-semibold text-sky-800">{conversionLine(plan, funds.rate)}</p>
      )}

      {plan && !plan.covered && (
        <p className="font-semibold text-rose-600">{insufficientMessage(account, balances, amount, funds.rate)}</p>
      )}
    </div>
  );
}

/** تنبيه غير مانع: سعر الصرف قديم (أكثر من 6 ساعات) وسيُستخدم في تحويل */
export function RateAgeWarning({ funds, show }: { funds: PurchasePaymentFunds | null; show: boolean }) {
  const age = show ? staleRateAge(funds?.rateUpdatedAt) : null;
  if (!age) return null;

  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
      سعر الصرف آخر تحديث له قبل {age}. حدّثه قبل التحويل.
    </p>
  );
}

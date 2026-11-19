/**
 * lib/purchase-funding.ts — معاينة تمويل دفع المشتريات بالدولار (نفس حساب check_purchase_payment_funds)
 *
 * shortfall_usd = المطلوب − رصيد الدولار (لو > 0)
 * sdg_needed    = round(shortfall_usd × سعر الصرف الحالي، 2)
 * يكفي لو رصيد الجنيه في نفس الحساب ≥ sdg_needed. التحويل الفعلي يتم في قاعدة البيانات.
 */

export interface AccountBalances {
  usd: number;
  sdg: number;
}

export interface FundingPlan {
  /** المبلغ المطلوب بالدولار (بمنزلتين) */
  amountUsd: number;
  /** الناقص بالدولار الذي سيُحوَّل من الجنيه (0 = الدولار يكفي) */
  shortfallUsd: number;
  /** الجنيه الذي سيُحوَّل (0 = لا تحويل) */
  sdgNeeded: number;
  /** الدولار + الجنيه يغطيان المبلغ */
  covered: boolean;
}

const cents = (value: number) => Math.round((Number(value) || 0) * 100);
const round2 = (value: number) => cents(value) / 100;

export function planFunding(balances: AccountBalances, amount: number, rate: number | null): FundingPlan {
  const amountUsd = round2(amount);

  if (cents(amountUsd) <= cents(balances.usd)) {
    return { amountUsd, shortfallUsd: 0, sdgNeeded: 0, covered: true };
  }

  const shortfallUsd = round2(amountUsd - balances.usd);

  if (!rate || rate <= 0) {
    return { amountUsd, shortfallUsd, sdgNeeded: 0, covered: false };
  }

  const sdgNeeded = round2(shortfallUsd * rate);

  return { amountUsd, shortfallUsd, sdgNeeded, covered: cents(balances.sdg) >= cents(sdgNeeded) };
}

export function accountLabel(account: "cash" | "bank") {
  return account === "bank" ? "البنك" : "الخزينة";
}

const plain = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

/** نفس نص رفض قاعدة البيانات */
export function insufficientMessage(account: "cash" | "bank", balances: AccountBalances, amount: number, rate: number | null) {
  const asUsd = rate && rate > 0 ? `${plain(balances.sdg / rate)}$` : "؟ (لا يوجد سعر صرف مسجل)";

  return `رصيد ${accountLabel(account)} غير كافٍ: المتاح ${plain(balances.usd)}$ و ${plain(balances.sdg)} ج.س (= ${asUsd})، والمطلوب ${plain(amount)}$.`;
}

/** سطر التحويل الذي يظهر قبل التأكيد وفي ملخصه */
export function conversionLine(plan: FundingPlan, rate: number | null, account?: "cash" | "bank") {
  const from = account ? ` من ${accountLabel(account)}` : "";
  return `سيتم تحويل ${plan.sdgNeeded.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.س${from} إلى ${plan.shortfallUsd.toFixed(2)}$ بسعر ${(rate ?? 0).toLocaleString("en-US")}`;
}

const STALE_RATE_MS = 6 * 60 * 60 * 1000;

/** "قبل N ساعة/يوم" لو آخر تحديث لسعر الصرف أقدم من 6 ساعات، وإلا null */
export function staleRateAge(rateUpdatedAt: string | null | undefined, now = Date.now()) {
  if (!rateUpdatedAt) return null;

  const age = now - Date.parse(rateUpdatedAt);
  if (!Number.isFinite(age) || age < STALE_RATE_MS) return null;

  const hours = Math.floor(age / (60 * 60 * 1000));
  if (hours < 48) return `${hours} ساعة`;

  return `${Math.floor(hours / 24)} يوم`;
}

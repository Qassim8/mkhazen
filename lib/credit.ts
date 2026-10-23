/**
 * lib/credit.ts — حسابات وعرض البيع بالتقسيط (آمن للسيرفر والعميل)
 *
 * الدين بالجنيه فقط. التقييم بالدولار للعرض: المتبقي ÷ سعر الصرف، مرة بسعر يوم البيع
 * ومرة بسعر اليوم، والفرق هو الخسارة (انخفاض قيمة الجنيه). لا يظهر هنا أي تكلفة أو ربح.
 */

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface CreditValuation {
  remainingSdg: number;
  saleRate: number | null;
  currentRate: number | null;
  /** المتبقي بالدولار بسعر يوم البيع */
  usdAtSale: number | null;
  /** المتبقي بالدولار بسعر اليوم */
  usdNow: number | null;
  /** موجب = خسارة بسبب انخفاض الجنيه، سالب = مكسب */
  lossUsd: number | null;
  /** نسبة الانخفاض من القيمة الأصلية (0–100) */
  lossPct: number | null;
  /** المبلغ بالجنيه الذي يعادل القيمة الأصلية للمتبقي بسعر اليوم */
  equivalentSdgToday: number | null;
}

export function creditValuation(input: {
  remainingSdg: number;
  saleRate: number | null | undefined;
  currentRate: number | null | undefined;
}): CreditValuation {
  const remaining = Number(input.remainingSdg) || 0;
  const saleRate = input.saleRate && input.saleRate > 0 ? Number(input.saleRate) : null;
  const currentRate = input.currentRate && input.currentRate > 0 ? Number(input.currentRate) : null;

  const rawAtSale = saleRate ? remaining / saleRate : null;
  const rawNow = currentRate ? remaining / currentRate : null;
  const loss = rawAtSale != null && rawNow != null ? rawAtSale - rawNow : null;

  return {
    remainingSdg: remaining,
    saleRate,
    currentRate,
    usdAtSale: rawAtSale != null ? r2(rawAtSale) : null,
    usdNow: rawNow != null ? r2(rawNow) : null,
    lossUsd: loss != null ? r2(loss) : null,
    lossPct: loss != null && rawAtSale && rawAtSale > 0 ? r2((loss / rawAtSale) * 100) : null,
    equivalentSdgToday: rawAtSale != null && currentRate ? r2(rawAtSale * currentRate) : null,
  };
}

export type SalesPaymentTone = "good" | "warn" | "bad" | "credit" | "muted";

/** شارة حالة الدفع في صفحة المبيعات: مدفوعة / جزئية / آجلة / معدوم */
export function salesPaymentBadge(input: {
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID" | string;
  isCredit?: boolean | null;
  creditClosedReason?: "PAID" | "BAD_DEBT" | string | null;
}): { label: string; tone: SalesPaymentTone } {
  if (input.isCredit) {
    if (input.creditClosedReason === "BAD_DEBT") return { label: "معدوم", tone: "bad" };
    if (input.creditClosedReason === "PAID" || input.paymentStatus === "PAID") {
      return { label: "مدفوعة", tone: "good" };
    }
    return { label: "آجلة", tone: "credit" };
  }

  if (input.paymentStatus === "PAID") return { label: "مدفوعة", tone: "good" };
  if (input.paymentStatus === "PARTIAL") return { label: "جزئية", tone: "warn" };
  return { label: "غير مدفوعة", tone: "bad" };
}

export const SALES_PAYMENT_TONE_CLASS: Record<SalesPaymentTone, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-orange-50 text-orange-700",
  bad: "bg-red-50 text-red-700",
  credit: "bg-amber-50 text-amber-700",
  muted: "bg-gray-100 text-gray-600",
};

/** ملاحظة الدفعة الزائدة عن المتبقي (تعويض فرق الصرف) */
export function overpaymentNote(overpaid: number) {
  return `تعويض فرق الصرف: زيادة ${overpaid.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.س عن المتبقي`;
}

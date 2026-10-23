import { roundMoney } from "@/lib/currency";

/** حالة نموذج "تقسيط" في سلة الكاشير (الدين بالجنيه ومربوط بالفاتورة نفسها) */
export interface CreditFormState {
  enabled: boolean;
  name: string;
  phone: string;
  /** المدفوع الآن بالجنيه (نص ليقبل الحقل الفارغ) */
  paidNow: string;
  /** تاريخ استحقاق اختياري YYYY-MM-DD */
  dueDate: string;
}

export const EMPTY_CREDIT: CreditFormState = {
  enabled: false,
  name: "",
  phone: "",
  paidNow: "",
  dueDate: "",
};

export function creditPaidNow(credit: CreditFormState) {
  const value = Number(credit.paidNow);
  return Number.isFinite(value) && value > 0 ? roundMoney(value) : 0;
}

export function creditRemaining(credit: CreditFormState, totalAmount: number) {
  return roundMoney(totalAmount - creditPaidNow(credit));
}

/** رسالة الخطأ الأولى، أو null لو النموذج صالح */
export function validateCredit(
  credit: CreditFormState,
  totalAmount: number,
  giftOnly: boolean,
): string | null {
  if (!credit.enabled) return null;
  if (giftOnly) return "فاتورة الهدايا لا تُباع بالتقسيط";
  if (!credit.name.trim()) return "اسم العميل مطلوب للبيع بالتقسيط";
  if (!credit.phone.trim()) return "رقم هاتف العميل مطلوب للبيع بالتقسيط";

  const raw = credit.paidNow.trim();
  if (raw !== "") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return "المدفوع الآن غير صالح";
    if (Math.round(value * 100) / 100 !== value) return "المدفوع الآن يجب ألا يتجاوز منزلتين عشريتين";
  }

  if (creditPaidNow(credit) >= totalAmount) {
    return "المدفوع الآن يجب أن يكون أقل من إجمالي الفاتورة";
  }

  return null;
}

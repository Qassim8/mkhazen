/**
 * مسودة سلة الكاشير + مفتاح منع التكرار
 *
 * • المسودة بتتحفظ في sessionStorage (نفس التاب بس) عشان لو الجلسة انتهت
 *   والمستخدم سجّل دخول تاني في نفس النافذة، السلة ترجع زي ما هي.
 *   (sessionStorage مش localStorage: جهاز كاشير مشترك ما يورّثش سلة موظف لموظف تاني
 *   بعد قفل التاب).
 * • مفتاح Idempotency-Key ثابت لنفس السلة: لو البيع اتبعت والرد ما وصلش،
 *   إعادة المحاولة بنفس السلة بترجع نفس الفاتورة بدل بيع مكرر.
 */
import type { PaymentMethod, PaymentSplit } from "../schemas/pos.schemas";
import type { POSCartItem } from "./POSClient";

const STORAGE_KEY = "mkhazen:pos-draft:v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface CheckoutKey {
  fingerprint: string;
  key: string;
  /** المحاولة السابقة نتيجتها غير معروفة (انقطاع اتصال) */
  uncertain: boolean;
}

export interface PosDraft {
  savedAt: number;
  cart: POSCartItem[];
  discountAmount: number;
  discountInput: string;
  paymentMethod: PaymentMethod;
  paymentSplits: PaymentSplit[];
  checkoutKey: CheckoutKey | null;
}

export function loadPosDraft(): PosDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as PosDraft;
    if (!draft || !Array.isArray(draft.cart) || Date.now() - draft.savedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function savePosDraft(draft: Omit<PosDraft, "savedAt">) {
  try {
    if (draft.cart.length === 0 && !draft.checkoutKey?.uncertain) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // التخزين ممكن يكون مقفول (وضع خاص) — السلة بتفضل في الذاكرة عادي
  }
}

export function clearPosDraft() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { newIdempotencyKey } from "@/lib/use-idempotency-key";

/** بصمة اللي هيتبعت فعلًا: أي تغيير في السلة/الخصم/الدفع/السعر = عملية جديدة */
export function checkoutFingerprint(input: {
  cart: POSCartItem[];
  discountAmount: number;
  paymentMethod: PaymentMethod;
  paymentSplits: PaymentSplit[];
  exchangeRate: number | null;
}): string {
  return JSON.stringify({
    items: input.cart.map((item) => [item.variant.id, item.qty, item.isGift, item.giftNote ?? null]),
    discount: input.discountAmount,
    method: input.paymentMethod,
    splits: input.paymentSplits.map((split) => [split.method, split.amount]),
    rate: input.exchangeRate,
  });
}

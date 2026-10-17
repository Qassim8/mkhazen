/**
 * التحقق من أسعار السلة على السيرفر قبل البيع.
 *
 * دالة complete_sales_checkout تحسب الأسعار من قاعدة البيانات، إلا السطر الذي
 * أرسل له الكاشير سعرًا معدّلًا (unitPriceSdg). هنا نتأكد أن المجموع المرسل هو
 * نفسه المحسوب من أسعار قاعدة البيانات وسعر الصرف الحالي (أو السعر المعدّل)،
 * حتى لا يتم بيع بأسعار قديمة معروضة على شاشة الكاشير.
 *
 * المعادلة (نفس POSClient و complete_sales_checkout):
 *   سطر = round2( سعر الوحدة بالجنيه × الكمية ) — والهدية = 0
 *   سعر الوحدة = unitPriceSdg إن أُرسل، وإلا round2(سعر البيع بالدولار × سعر الصرف)
 */

export interface PricingItem {
  variantId: string;
  quantity: number;
  isGift: boolean;
  /** سعر معدّل بالجنيه من الكاشير */
  unitPriceSdg?: number | null;
}

export interface PricingVariant {
  sellingPrice: number;
  isActive: boolean;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type PricingCheck =
  | { ok: true; subtotal: number }
  | { ok: false; reason: "VARIANT_UNAVAILABLE" | "PRICE_CHANGED"; message: string; subtotal?: number };

export function verifyCheckoutSubtotal(params: {
  items: PricingItem[];
  variants: Map<string, PricingVariant>;
  rate: number;
  clientSubtotal: number;
}): PricingCheck {
  const { items, variants, rate, clientSubtotal } = params;

  let subtotal = 0;

  for (const item of items) {
    const variant = variants.get(item.variantId);
    if (!variant || !variant.isActive) {
      return {
        ok: false,
        reason: "VARIANT_UNAVAILABLE",
        message: "أحد المنتجات في السلة لم يعد متاحًا للبيع. حدّث السلة وحاول مرة أخرى.",
      };
    }

    if (item.isGift) continue;

    const unitSdg =
      item.unitPriceSdg != null ? round2(item.unitPriceSdg) : round2(variant.sellingPrice * rate);
    subtotal = round2(subtotal + round2(unitSdg * item.quantity));
  }

  if (Math.abs(subtotal - clientSubtotal) >= 0.01) {
    return {
      ok: false,
      reason: "PRICE_CHANGED",
      subtotal,
      message: "تغيّرت أسعار بعض المنتجات منذ إضافتها للسلة. حدّث الصفحة وراجع الإجمالي قبل البيع.",
    };
  }

  return { ok: true, subtotal };
}

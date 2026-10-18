/**
 * إخفاء التكلفة عن الخياط (لا صلاحية له على المنتجات أصلًا).
 * الكاشير صار يرى "سعر التكلفة" (averageCost) بطلب صريح من المالك — يظهر له
 * في واجهة الكاشير وعند اختيار قماش لطلب تفصيل، بزر إظهار/إخفاء من عنده.
 * "آخر سعر شراء" (purchasePrice) يبقى مخفيًا عن الكاشير (مرجعي للمدير فقط).
 */

const PURCHASE_PRICE_KEYS = ["purchasePrice", "purchase_price"] as const;
const COST_KEYS = [...PURCHASE_PRICE_KEYS, "averageCost", "average_cost"] as const;

function stripKeys(value: unknown, keys: readonly string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  if (Array.isArray(copy.variants)) {
    copy.variants = copy.variants.map((variant) => stripKeys(variant, keys));
  }
  return copy;
}

/** يحذف كل مفاتيح التكلفة (averageCost وpurchasePrice) — للخياط */
export function stripProductCosts<T>(data: T): T {
  if (Array.isArray(data)) return data.map((row) => stripKeys(row, COST_KEYS)) as T;
  return stripKeys(data, COST_KEYS) as T;
}

/** يحذف آخر سعر شراء فقط، ويُبقي averageCost (سعر التكلفة) — للكاشير */
export function stripPurchasePriceOnly<T>(data: T): T {
  if (Array.isArray(data)) return data.map((row) => stripKeys(row, PURCHASE_PRICE_KEYS)) as T;
  return stripKeys(data, PURCHASE_PRICE_KEYS) as T;
}

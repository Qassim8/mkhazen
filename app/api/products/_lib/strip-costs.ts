/**
 * إخفاء التكلفة عن الكاشير والخياط (CLAUDE.md: لا يرون التكلفة ولا سعر الشراء ولا averageCost).
 * يُطبَّق على ردود المنتجات لمن لا يملك صلاحية catalog.manage.
 */

const COST_KEYS = ["purchasePrice", "averageCost", "average_cost", "purchase_price"] as const;

function stripObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of COST_KEYS) delete copy[key];
  if (Array.isArray(copy.variants)) copy.variants = copy.variants.map(stripObject);
  return copy;
}

export function stripProductCosts<T>(data: T): T {
  if (Array.isArray(data)) return data.map(stripObject) as T;
  return stripObject(data) as T;
}

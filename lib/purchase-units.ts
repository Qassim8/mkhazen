/**
 * lib/purchase-units.ts — عرض وحدة الشراء ووحدة البيع في المشتريات (عرض فقط)
 *
 * الكمية في أمر الشراء بوحدة الشراء (كرتونة)، والمخزون بوحدة البيع (قطعة)
 * = الكمية × معامل التحويل. لا تغيّر هذه الدوال أي حساب: تعرض فقط ما يحسبه النظام أصلًا.
 */

export interface PurchaseUnitInfo {
  purchaseUnit: string;
  sellingUnit: string;
  /** معامل التحويل (عدد وحدات البيع في وحدة الشراء)، 1 لو غير معروف */
  factor: number;
}

interface UnitSource {
  purchaseUnit?: string | null;
  sellingUnit?: string | null;
  conversionFactor?: number | string | null;
}

/** نفس تطبيع معامل التحويل في الخادم: غير الصالح = 1 */
export function normalizeFactor(value: unknown) {
  const factor = Number(value ?? 1);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function purchaseUnitInfo(source: UnitSource | null | undefined): PurchaseUnitInfo {
  const purchaseUnit = source?.purchaseUnit?.trim() || "وحدة";
  const sellingUnit = source?.sellingUnit?.trim() || purchaseUnit;

  return { purchaseUnit, sellingUnit, factor: normalizeFactor(source?.conversionFactor) };
}

/** رقم بحد أقصى منزلتين (أو الحد المطلوب) بدون أصفار زائدة: 240 ، 12.5 ، 0.42 */
export function formatUnitNumber(value: number, maxFractionDigits = 2) {
  const safe = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(safe);
}

/** ما سيُضاف للمخزون بوحدة البيع */
export function stockQuantity(quantity: number, info: PurchaseUnitInfo) {
  return Math.round(Number(quantity || 0) * info.factor * 100) / 100;
}

/** سعر وحدة الشراء ÷ المعامل = لكل وحدة بيع */
export function pricePerSellingUnit(unitCost: number, info: PurchaseUnitInfo) {
  return Number(unitCost || 0) / info.factor;
}

/** "{الكمية} {وحدة الشراء} ({الناتج} {وحدة البيع})" ، أو الوحدة فقط لو المعامل 1 */
export function describePurchaseQuantity(quantity: number, info: PurchaseUnitInfo) {
  const base = `${formatUnitNumber(quantity)} ${info.purchaseUnit}`;

  if (info.factor === 1) return base;

  return `${base} (${formatUnitNumber(stockQuantity(quantity, info))} ${info.sellingUnit})`;
}

/** تنبيه غير مانع: المعامل > 1 والكمية ≥ 10، يوضح الفرق بين وحدة الشراء ووحدة البيع */
export function largeQuantityWarning(quantity: number, info: PurchaseUnitInfo) {
  const qty = Number(quantity || 0);

  if (info.factor <= 1 || qty < 10) return null;

  return `تأكد: أدخلت ${formatUnitNumber(qty)} ${info.purchaseUnit} = ${formatUnitNumber(
    stockQuantity(qty, info),
  )} ${info.sellingUnit}. لو كنت تقصد ${formatUnitNumber(qty)} ${info.sellingUnit} فقط، اكتب ${formatUnitNumber(
    qty / info.factor,
  )} ${info.purchaseUnit}.`;
}

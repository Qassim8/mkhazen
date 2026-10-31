/**
 * lib/customer-phone.ts — مرآة لدالة SQL normalize_customer_phone (آمن للسيرفر والعميل)
 *
 * أرقام فقط، و09xxxxxxxx و+2499xxxxxxxx و2499xxxxxxxx و9xxxxxxxx و00249… تتوحد إلى 2499xxxxxxxx.
 * أي تعديل هنا يلزمه تعديل مماثل في database/migrations/20261026_01_customers_hub.sql.
 */

export function normalizeCustomerPhone(value: string | null | undefined): string {
  let digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("249")) return digits;
  if (digits.length === 10 && digits.startsWith("0")) return `249${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("1"))) return `249${digits}`;

  return digits;
}

/**
 * الصيغة المخزَّنة في customers.whatsapp_number: أرقام فقط بدون 00 البادئة
 * (نفس ما تفعله دوال التفصيل، ويحافظ على القيد UNIQUE(branch_id, whatsapp_number)).
 */
export function cleanCustomerPhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export function isValidCustomerPhone(value: string | null | undefined): boolean {
  const digits = cleanCustomerPhone(value);
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * صيغ البحث بالهاتف: النص كما هو (أرقامه)، وصيغته الموحدة، ولو بدأ بصفر فبديلها 249…
 * (يُستخدم للبحث الجزئي في الأرقام المخزنة بصيغ مختلفة).
 */
export function phoneSearchVariants(term: string): string[] {
  const digits = String(term ?? "").replace(/[^0-9]/g, "");
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  const normalized = normalizeCustomerPhone(term);
  if (normalized) variants.add(normalized);
  if (digits.startsWith("0")) variants.add(`249${digits.slice(1)}`);
  return [...variants];
}

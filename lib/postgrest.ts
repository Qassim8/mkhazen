/**
 * lib/postgrest.ts — تنظيف نص البحث قبل ما يدخل فلتر PostgREST
 *
 * فلاتر .or("name.ilike.%x%,phone.ilike.%x%") بتتبني كنص؛ لو المستخدم كتب
 * فاصلة أو أقواس أو علامات تنصيص بيقدر يغيّر شكل الفلتر نفسه (filter injection)
 * أو يوقع الاستعلام بخطأ 500. هنا بنشيل الرموز دي ونسيب الحروف والأرقام والمسافات
 * والرموز العادية (- _ . @ / +).
 *
 * % و * علامات wildcard في ilike فبنشيلها كمان (البحث "يحتوي على" أصلًا).
 */
export function sanitizeSearchTerm(value: unknown, maxLength = 100): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[,()"'\\*%:;{}[\]<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

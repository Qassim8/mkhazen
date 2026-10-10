/**
 * =====================================================================
 * lib/api-codes.ts — عقد الأخطاء المشترك بين الـ API والواجهة
 * =====================================================================
 * آمن للاستخدام في السيرفر والعميل والـ proxy (مفيش أي استيراد سيرفر).
 *
 * كل رد خطأ من الـ API بيكون بالشكل:
 *   { "message": "<رسالة عربية للمستخدم>", "code": "<ApiErrorCode>" }
 *
 * • 401 + UNAUTHENTICATED  → مفيش جلسة أصلًا
 * • 401 + SESSION_EXPIRED  → كانت فيه جلسة وانتهت/اتلغت (كلمة السر اتغيرت، الحساب اتعطل)
 * • 403 + FORBIDDEN        → الجلسة سليمة لكن الدور ما يسمحش بالعملية
 */

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "CSRF_REJECTED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "RATE_LIMITED"
  | "BUSINESS_RULE"
  | "DB_MIGRATION_REQUIRED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export const AUTH_ERROR_CODES: readonly ApiErrorCode[] = [
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
];

export const MESSAGES = {
  UNAUTHENTICATED: "يرجى تسجيل الدخول أولاً.",
  SESSION_EXPIRED: "عذرًا، انتهت جلستك. سجّل الدخول مرة أخرى لمتابعة العمل.",
  FORBIDDEN: "عذراً، ليس لديك صلاحية لهذه العملية.",
  CSRF_REJECTED: "تم رفض الطلب لأنه لم يصدر من صفحات النظام.",
  SERVICE_UNAVAILABLE: "تعذر الاتصال بالخادم مؤقتًا. حاول مرة أخرى بعد قليل.",
  INTERNAL_ERROR: "حدث خطأ داخلي غير متوقع. لم يتم حفظ أي تغيير غير مكتمل؛ حاول مرة أخرى أو تواصل مع الدعم.",
  RATE_LIMITED: "محاولات كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.",
  NETWORK: "تعذر الوصول إلى الخادم. تحقق من الاتصال بالإنترنت.",
} as const;

/** هل الكود ده معناه إن المستخدم لازم يسجّل دخول من جديد؟ */
export function isAuthErrorCode(code: unknown): boolean {
  return typeof code === "string" && (AUTH_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * مسار الرجوع بعد تسجيل الدخول: مسار داخلي بس (منع open redirect).
 * أي حاجة مش بادئة بـ /dashboard بترجع null.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/dashboard")) return null;
  // ممنوع "//evil.com" أو "/\evil.com" أو أي بروتوكول أو أحرف تحكم
  if (path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return null;
  if (/^\/dashboard[^/?#]/.test(path)) return null;
  return path.length > 500 ? null : path;
}

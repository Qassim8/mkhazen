/**
 * =====================================================================
 * lib/api-client.ts — استدعاء الـ API من الواجهة والـ Server Components
 * =====================================================================
 * ⚠️ الملف ده مش "use server" (كان قبل كده Server Action عامة بتجيب أي
 * رابط → SSRF، وكمان رسائل الأخطاء كانت بتضيع في الإنتاج).
 *
 * • في المتصفح: fetch مباشر لـ /api بكوكي الجلسة (same-origin).
 *   - 401 → تحويل لصفحة "انتهت جلستك" (مرة واحدة) + ApiError
 *   - 403 → ApiError برسالة "ليس لديك صلاحية"
 * • في السيرفر (Server Components): استدعاء الـ route handler نفسه داخل
 *   نفس العملية (من غير HTTP) عن طريق lib/api-transport.server.ts.
 *
 * المسار لازم يكون مسار داخلي تحت /api — أي حاجة تانية بترفض.
 */

import { MESSAGES, isAuthErrorCode, type ApiErrorCode } from "@/lib/api-codes";

export type ResponseType = "json" | "arraybuffer" | "blob" | "text";

export interface FetchOptions extends Omit<RequestInit, "headers"> {
  /** قيم الـ query (undefined / null / "" بتتشال) */
  params?: object;
  /** متجاهل — كل الطلبات بكوكي الجلسة (موجود للتوافق مع الكود القديم) */
  withAuth?: boolean;
  responseType?: ResponseType;
  headers?: Record<string, string>;
  /** متجاهل — مفيش كاش لبيانات المستخدم (موجود للتوافق مع الكود القديم) */
  next?: { tags?: string[]; revalidate?: number | false };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode | string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuthError() {
    return this.status === 401 || isAuthErrorCode(this.code);
  }

  get isForbidden() {
    return this.status === 403;
  }

  /** خطأ مؤقت يستاهل إعادة المحاولة (شبكة/خادم غير متاح) */
  get isRetryable() {
    return this.status === 0 || this.status === 503 || this.status === 502 || this.status === 504;
  }
}

/** /api/... بحروف آمنة بس (مفيش "//" ولا ".." ولا بروتوكول ولا @) */
const SAFE_ENDPOINT = /^\/api(?:\/[A-Za-z0-9._~-]+)+\/?$/;

export function assertSafeEndpoint(endpoint: string): void {
  if (
    typeof endpoint !== "string" ||
    !SAFE_ENDPOINT.test(endpoint) ||
    endpoint.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "مسار API غير صالح.");
  }
}

export function buildQueryString(params?: object): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : "";
}

/** تحويل أي رد غير ناجح لـ ApiError برسالة عربية مفهومة */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as
    | { message?: unknown; error?: unknown; code?: unknown; errors?: unknown }
    | null;

  const rawMessage =
    typeof data?.message === "string"
      ? data.message
      : typeof data?.error === "string"
        ? data.error
        : null;

  let code = typeof data?.code === "string" ? data.code : "";

  if (!code) {
    if (res.status === 401) code = "UNAUTHENTICATED";
    else if (res.status === 403) code = "FORBIDDEN";
    else if (res.status === 404) code = "NOT_FOUND";
    else if (res.status === 409) code = "CONFLICT";
    else if (res.status === 422 || res.status === 400) code = "VALIDATION_ERROR";
    else if (res.status === 429) code = "RATE_LIMITED";
    else if (res.status === 503) code = "SERVICE_UNAVAILABLE";
    else code = "INTERNAL_ERROR";
  }

  const fallback =
    res.status === 401
      ? MESSAGES.SESSION_EXPIRED
      : res.status === 403
        ? MESSAGES.FORBIDDEN
        : res.status === 503
          ? MESSAGES.SERVICE_UNAVAILABLE
          : res.status >= 500
            ? MESSAGES.INTERNAL_ERROR
            : `تعذر تنفيذ الطلب (${res.status}).`;

  return new ApiError(res.status, code, rawMessage || fallback, data?.errors);
}

export async function readBody<T>(res: Response, responseType: ResponseType): Promise<T> {
  if (responseType === "arraybuffer") return (await res.arrayBuffer()) as T;
  if (responseType === "blob") return (await res.blob()) as T;
  if (responseType === "text") return (await res.text()) as T;

  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, "INTERNAL_ERROR", "استجابة الخادم غير مفهومة.");
  }
}

/* =========================================================
   المتصفح
========================================================= */

let redirectingToLogin = false;

/**
 * نفس طلب التعديل (نفس المسار والبيانات) لو اتبعت تاني وهو لسه شغال
 * (نقرتين سريعتين على "حفظ") بيرجع نفس الـ Promise بدل طلب تاني.
 */
const inFlightMutations = new Map<string, Promise<unknown>>();

/** تحويل لصفحة "انتهت جلستك" مع الرجوع لنفس الصفحة بعد الدخول */
function handleSessionExpired() {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;

  try {
    window.dispatchEvent(new CustomEvent("mkhazen:session-expired"));
  } catch {
    // متصفحات قديمة — التحويل تحت كافي
  }

  const next = `${window.location.pathname}${window.location.search}`;
  // تحميل كامل (مش router.push): يمسح أي حالة قديمة في الذاكرة ويعدّي على الـ proxy.
  // replace مش assign: الصفحة اللي الجلسة انتهت فيها ما تفضلش في سجل الرجوع.
  window.location.replace(`/session-expired?next=${encodeURIComponent(next)}`);
}

async function browserTransport<T>(endpoint: string, options: FetchOptions): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const body = options.body;

  if (method !== "GET" && method !== "HEAD" && (body === undefined || typeof body === "string")) {
    const dedupeKey = [
      method,
      endpoint,
      buildQueryString(options.params),
      options.headers?.["Idempotency-Key"] ?? "",
      body ?? "",
    ].join("\u0000");

    const existing = inFlightMutations.get(dedupeKey);
    if (existing) return existing as Promise<T>;

    const promise = sendBrowserRequest<T>(endpoint, options).finally(() => {
      inFlightMutations.delete(dedupeKey);
    });
    inFlightMutations.set(dedupeKey, promise);
    return promise;
  }

  return sendBrowserRequest<T>(endpoint, options);
}

async function sendBrowserRequest<T>(endpoint: string, options: FetchOptions): Promise<T> {
  const {
    params,
    responseType = "json",
    headers: customHeaders,
    withAuth: _withAuth,
    next: _next,
    ...init
  } = options;
  void _withAuth;
  void _next;

  const headers: Record<string, string> = { ...(customHeaders ?? {}) };
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${endpoint}${buildQueryString(params)}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // الطلب ما وصلش (أو الرد ما رجعش) — ممكن العملية تكون اتنفذت!
    throw new ApiError(0, "SERVICE_UNAVAILABLE", MESSAGES.NETWORK);
  }

  if (!res.ok) {
    const error = await errorFromResponse(res);
    if (error.isAuthError) handleSessionExpired();
    throw error;
  }

  return readBody<T>(res, responseType);
}

/* =========================================================
   السيرفر — الـ transport بيتسجل من lib/api-transport.server.ts
   (اللي بيتحمّل من app/layout.tsx) عشان كود السيرفر ما يدخلش
   في bundle المتصفح.
========================================================= */

export type ServerTransport = <T>(endpoint: string, options: FetchOptions) => Promise<T>;

const SERVER_TRANSPORT_KEY = Symbol.for("mkhazen.api.serverTransport");

type GlobalWithTransport = typeof globalThis & {
  [SERVER_TRANSPORT_KEY]?: ServerTransport;
};

export function registerServerTransport(transport: ServerTransport) {
  (globalThis as GlobalWithTransport)[SERVER_TRANSPORT_KEY] = transport;
}

export async function serverFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  assertSafeEndpoint(endpoint);

  if (typeof window !== "undefined") {
    return browserTransport<T>(endpoint, options);
  }

  const transport = (globalThis as GlobalWithTransport)[SERVER_TRANSPORT_KEY];
  if (!transport) {
    throw new Error("API server transport is not registered (import lib/api-transport.server in app/layout.tsx).");
  }

  return transport<T>(endpoint, options);
}

/** اسم أوضح لنفس الدالة (للكود الجديد) */
export const apiFetch = serverFetch;

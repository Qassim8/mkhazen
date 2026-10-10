import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveSession } from "@/lib/auth";
import { MESSAGES, type ApiErrorCode } from "@/lib/api-codes";
import { canAccessPath, homePageFor } from "@/lib/permissions";
import {
  AUTH_COOKIE_NAME,
  cookieOptions,
  refreshSessionTokenIfNeeded,
  verifySessionToken,
} from "@/lib/session-token";

/**
 * حماية الصفحات والـ API. قواعد الصلاحيات نفسها في lib/permissions.ts
 * (نفس المرجع اللي بتستخدمه الـ APIs والقائمة الجانبية).
 *
 * • /api/*  : فحص التوكن (من غير قاعدة بيانات) → 401 JSON بكود واضح.
 *             الـ route نفسه بيعمل الفحص الكامل (الحساب نشط؟ كلمة السر اتغيرت؟ الدور؟).
 *             طلبات التعديل من origin مختلف بتترفض (CSRF).
 * • الصفحات : الجلسة المنتهية → /session-expired (مش رجوع صامت لصفحة الدخول).
 * • الجلسة بتتجدد تلقائيًا مع الاستخدام (sliding) لحد الحد الأقصى المطلق.
 */

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/request-reset",
]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function jsonError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json(
    { message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...cookieOptions(0), expires: new Date(0) });
  return response;
}

/** طلب تعديل جاي من موقع تاني؟ (المتصفحات بتبعت Origin مع أي POST) */
function isCrossOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function serviceUnavailablePage() {
  return new NextResponse(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الخدمة غير متاحة مؤقتًا</title></head><body style="font-family:system-ui,sans-serif;background:#f9fafb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px"><main style="max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;text-align:center"><h1 style="font-size:18px;margin:0 0 8px">تعذر الاتصال بالخادم مؤقتًا</h1><p style="color:#4b5563;font-size:14px;margin:0 0 16px">${MESSAGES.SERVICE_UNAVAILABLE} جلستك لم تنتهِ.</p><a href="" style="display:inline-block;background:#111827;color:#fff;border-radius:12px;padding:10px 18px;text-decoration:none;font-size:14px">إعادة المحاولة</a></main></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "10" } },
  );
}

async function withRefreshedCookie(response: NextResponse, token: string | undefined) {
  const verified = await verifySessionToken(token);
  if (!verified.ok) return response;

  const refreshed = await refreshSessionTokenIfNeeded(verified.claims);
  if (refreshed) {
    response.cookies.set(AUTH_COOKIE_NAME, refreshed.token, cookieOptions(refreshed.maxAge));
  }
  return response;
}

async function handleApi(req: NextRequest, pathname: string, token: string | undefined) {
  if (MUTATING_METHODS.has(req.method) && isCrossOrigin(req)) {
    return jsonError(403, "CSRF_REJECTED", MESSAGES.CSRF_REJECTED);
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const verified = await verifySessionToken(token);

  if (!verified.ok) {
    const response =
      verified.reason === "missing"
        ? jsonError(401, "UNAUTHENTICATED", MESSAGES.UNAUTHENTICATED)
        : jsonError(401, "SESSION_EXPIRED", MESSAGES.SESSION_EXPIRED);
    return verified.reason === "missing" ? response : clearAuthCookie(response);
  }

  // طلبات الخلفية (سحب الإشعارات) مش نشاط من المستخدم → ما تجددش مهلة الخمول
  if (req.headers.get("x-mkhazen-background") === "1") {
    return NextResponse.next();
  }

  return withRefreshedCookie(NextResponse.next(), token);
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (pathname.startsWith("/api")) {
    return handleApi(req, pathname, token);
  }

  // صفحة "انتهت جلستك" متاحة دايمًا (من غير تحويل → مفيش حلقات)
  if (pathname === "/session-expired") {
    const verified = await verifySessionToken(token);
    const response = NextResponse.next();
    return token && !verified.ok ? clearAuthCookie(response) : response;
  }

  const isAuthPage = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");

  if (!isAuthPage && !isDashboard) {
    return NextResponse.next();
  }

  const result = await resolveSession(token);

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return isDashboard ? serviceUnavailablePage() : NextResponse.next();
    }

    if (isAuthPage) {
      // توكن قديم/ملغي على صفحة الدخول: نمسحه ونعرض الصفحة عادي
      return token ? clearAuthCookie(NextResponse.next()) : NextResponse.next();
    }

    // 1. غير مسجل دخول ويحاول يفتح الداشبورد
    if (result.reason === "missing") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // 2. كانت فيه جلسة وانتهت → صفحة توضح السبب، مع الرجوع لنفس الصفحة بعد الدخول
    const expiredUrl = new URL("/session-expired", req.url);
    expiredUrl.searchParams.set("next", `${pathname}${search}`);
    return clearAuthCookie(NextResponse.redirect(expiredUrl));
  }

  const session = result.session;

  // 3. توجيه من صفحة الدخول
  if (isAuthPage) {
    const target = session.isPasswordChanged
      ? homePageFor(session.role)
      : "/dashboard/settings?forceChange=true";
    return NextResponse.redirect(new URL(target, req.url));
  }

  // 4. لازم يغيّر كلمة السر الأول
  if (!session.isPasswordChanged && !pathname.startsWith("/dashboard/settings")) {
    return NextResponse.redirect(new URL("/dashboard/settings?forceChange=true", req.url));
  }

  // 5. صلاحية الصفحة
  if (!canAccessPath(session.role, pathname)) {
    return NextResponse.redirect(new URL(homePageFor(session.role), req.url));
  }

  return withRefreshedCookie(NextResponse.next(), token);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

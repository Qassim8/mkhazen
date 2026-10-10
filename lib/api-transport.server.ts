/**
 * =====================================================================
 * lib/api-transport.server.ts — serverFetch داخل Server Components
 * =====================================================================
 * بدل ما الصفحة تعمل طلب HTTP لنفس الموقع (APP_URL) بالكوكي، بننادي
 * الـ route handler نفسه داخل نفس العملية:
 *   • مفيش SSRF (المسار لازم يطابق جدول API_ROUTES).
 *   • مفيش اعتماد على APP_URL ولا رحلة شبكة إضافية (أسرع وأرخص على Vercel).
 *   • الـ route بيقرا كوكي الجلسة من نفس الطلب (cookies()) ويعمل نفس فحص الصلاحية.
 *
 * بيتحمّل مرة واحدة من app/layout.tsx.
 */
import "server-only";

import { NextRequest, connection } from "next/server";

import { API_ROUTES } from "@/lib/api-routes";
import {
  buildQueryString,
  errorFromResponse,
  readBody,
  registerServerTransport,
  type FetchOptions,
} from "@/lib/api-client";

type Handler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

const INTERNAL_ORIGIN = "http://internal.mkhazen.local";

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.replace(/\/$/, "").split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i];
    const actual = pathParts[i];

    if (expected.startsWith("[") && expected.endsWith("]")) {
      params[expected.slice(1, -1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }

  return params;
}

/** المسار الثابت يكسب على الديناميكي (/api/sales/checkout قبل /api/sales/[id]) */
const ORDERED_ROUTES = [...API_ROUTES].sort((a, b) => {
  const dynamicCount = (pattern: string) => (pattern.match(/\[/g) ?? []).length;
  return dynamicCount(a.pattern) - dynamicCount(b.pattern);
});

export function resolveApiRoute(pathname: string) {
  for (const route of ORDERED_ROUTES) {
    const params = matchPattern(route.pattern, pathname);
    if (params) return { route, params };
  }
  return null;
}

async function inProcessTransport<T>(endpoint: string, options: FetchOptions): Promise<T> {
  const {
    params,
    responseType = "json",
    headers: customHeaders,
    method = "GET",
    body,
  } = options;

  // بيانات المستخدم لازم تتجاب وقت الطلب بس (مش وقت الـ build).
  // لازم يحصل هنا قبل الـ route handler: الـ handlers جواها try/catch
  // كانت بتبلع إشارة Next.js للتحويل لـ dynamic rendering.
  await connection();

  const match = resolveApiRoute(endpoint);
  if (!match) {
    throw new Error(`مسار API غير مسجل في lib/api-routes.ts: ${endpoint}`);
  }

  const routeModule = (await match.route.load()) as Record<string, unknown>;
  const handler = routeModule[method.toUpperCase()] as Handler | undefined;

  if (typeof handler !== "function") {
    throw new Error(`المسار ${endpoint} لا يدعم ${method}`);
  }

  const headers = new Headers(customHeaders ?? {});
  if (body !== undefined && body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const request = new NextRequest(`${INTERNAL_ORIGIN}${endpoint}${buildQueryString(params)}`, {
    method,
    headers,
    body: body as BodyInit | null | undefined,
  });

  const response = await handler(request, { params: Promise.resolve(match.params) });

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  return readBody<T>(response, responseType);
}

registerServerTransport(inProcessTransport);

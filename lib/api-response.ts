/**
 * =====================================================================
 * lib/api-response.ts — ردود الأخطاء الموحدة في الـ API routes
 * =====================================================================
 * الهدف: الواجهة تفرّق بين (جلسة منتهية / مفيش صلاحية / بيانات غلط /
 * خطأ مؤقت / خطأ داخلي) من غير ما تظهر تفاصيل قاعدة البيانات للمستخدم.
 */

import { NextResponse } from "next/server";

import { MESSAGES, type ApiErrorCode } from "@/lib/api-codes";

const NO_STORE = { "Cache-Control": "no-store" };

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ...extra, message, code }, { status, headers: NO_STORE });
}

type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isDbErrorLike(value: unknown): value is DbErrorLike {
  return typeof value === "object" && value !== null && ("code" in value || "message" in value);
}

/**
 * رسائل RAISE EXCEPTION من دوال قاعدة البيانات (SQLSTATE P0001 أو 22023)
 * مكتوبة بالعربي للمستخدم (زي "الرصيد غير كافٍ") فبتتعرض زي ما هي.
 * أي خطأ تاني (أعمدة، صلاحيات، اتصال…) بيتسجل في اللوج وبيرجع رسالة عامة.
 */
export function dbErrorResponse(error: unknown, context: string, fallbackMessage?: string) {
  const db = isDbErrorLike(error) ? error : null;
  const code = db?.code ?? "";
  const message = db?.message ?? (error instanceof Error ? error.message : "");

  switch (code) {
    case "P0001":
    case "22023":
      return apiError(400, "BUSINESS_RULE", message || fallbackMessage || MESSAGES.INTERNAL_ERROR);
    case "23505":
      return apiError(409, "CONFLICT", "تعذر الحفظ لأن البيانات مكررة (رقم أو كود مستخدم من قبل).");
    case "23503":
      return apiError(409, "CONFLICT", "تعذر تنفيذ العملية لأن السجل مرتبط ببيانات أخرى.");
    case "23514":
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
      return apiError(422, "VALIDATION_ERROR", "البيانات المرسلة غير صالحة.");
    case "40001":
    case "40P01":
    case "55P03":
      return apiError(409, "CONFLICT", "تزامنت العملية مع عملية أخرى على نفس البيانات. حاول مرة أخرى.");
    case "42501":
      // service_role has every privilege it needs (verify.sql). permission denied
      // therefore means the server is misconfigured: the key in
      // SUPABASE_SERVICE_ROLE_KEY is not the service_role key, or a migration
      // revoked a grant. Never shown to the user in detail.
      console.error(
        `[${context}] permission denied (42501) — check SUPABASE_SERVICE_ROLE_KEY and run database/migrations/20261010_verify.sql:`,
        message,
      );
      return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
    case "PGRST116":
      return apiError(404, "NOT_FOUND", fallbackMessage || "السجل غير موجود.");
    case "PGRST202":
    case "42883":
    case "42P01":
    case "PGRST205":
      console.error(`[${context}] missing database object — migration required:`, message);
      return apiError(
        503,
        "DB_MIGRATION_REQUIRED",
        "هذه العملية تحتاج تحديثًا لقاعدة البيانات لم يُطبّق بعد. تواصل مع مسؤول النظام.",
      );
    default:
      break;
  }

  if (!code && /fetch failed|network|ECONNRESET|ETIMEDOUT|timeout/i.test(message)) {
    console.error(`[${context}] database unreachable:`, message);
    return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
  }

  console.error(`[${context}] unexpected error:`, error);
  return apiError(500, "INTERNAL_ERROR", fallbackMessage || MESSAGES.INTERNAL_ERROR);
}

/** قراءة JSON من الطلب؛ JSON تالف بيرجع null بدل ما يوقع الـ route */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const invalidJsonResponse = () =>
  apiError(400, "VALIDATION_ERROR", "بيانات الطلب ليست JSON صالحة.");

/**
 * هل قاعدة البيانات رفضت العملية فعلًا (رجعت SQLSTATE / كود PostgREST)؟
 * لو أيوه فالمعاملة اترجعت بالكامل. أخطاء الشبكة بترجع من supabase-js بكود فاضي
 * ("fetch failed") ومعناها إن النتيجة غير معروفة (ممكن تكون اتنفذت).
 */
export function isDefiniteDbRejection(error: unknown): boolean {
  if (!isDbErrorLike(error)) return false;
  return typeof error.code === "string" && error.code.length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

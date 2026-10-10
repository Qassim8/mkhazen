/**
 * lib/permissions-server.ts — فحص الصلاحية في API routes و Server Components
 *
 * الاستخدام في أي route:
 *   const guard = await requirePermission("catalog.manage");
 *   if (!guard.ok) return guard.response;
 *   const user = guard.session;
 *
 * الردود:
 *   401 UNAUTHENTICATED  — مفيش جلسة
 *   401 SESSION_EXPIRED  — الجلسة انتهت أو اتلغت (الواجهة بتحوّل لصفحة "انتهت جلستك")
 *   403 FORBIDDEN        — الدور ما يسمحش
 *   503 SERVICE_UNAVAILABLE — تعذر التحقق من الحساب (مش خروج؛ المستخدم يحاول تاني)
 */

import type { NextResponse } from "next/server";

import { getSessionResult, type SessionFailure, type TokenPayload } from "@/lib/auth";
import { MESSAGES } from "@/lib/api-codes";
import { apiError } from "@/lib/api-response";
import { can, type Permission } from "@/lib/permissions";

type Guard =
  | { ok: true; session: TokenPayload }
  | { ok: false; response: NextResponse };

export function sessionFailureResponse(reason: SessionFailure) {
  if (reason === "unavailable") {
    return apiError(503, "SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE);
  }

  if (reason === "missing") {
    return apiError(401, "UNAUTHENTICATED", MESSAGES.UNAUTHENTICATED);
  }

  return apiError(401, "SESSION_EXPIRED", MESSAGES.SESSION_EXPIRED);
}

export function forbiddenResponse(message: string = MESSAGES.FORBIDDEN) {
  return apiError(403, "FORBIDDEN", message);
}

/** أي مستخدم مسجّل دخول (للقراءات المشتركة زي قائمة المنتجات) */
export async function requireLogin(): Promise<Guard> {
  const result = await getSessionResult();

  if (!result.ok) {
    return { ok: false, response: sessionFailureResponse(result.reason) };
  }

  return { ok: true, session: result.session };
}

export async function requirePermission(
  permission: Permission,
  forbiddenMessage?: string,
): Promise<Guard> {
  const guard = await requireLogin();
  if (!guard.ok) return guard;

  if (!can(guard.session.role, permission)) {
    return { ok: false, response: forbiddenResponse(forbiddenMessage) };
  }

  return guard;
}

/** يكفي إن المستخدم عنده صلاحية واحدة من القائمة */
export async function requireAnyPermission(
  permissions: Permission[],
  forbiddenMessage?: string,
): Promise<Guard> {
  const guard = await requireLogin();
  if (!guard.ok) return guard;

  if (!permissions.some((permission) => can(guard.session.role, permission))) {
    return { ok: false, response: forbiddenResponse(forbiddenMessage) };
  }

  return guard;
}

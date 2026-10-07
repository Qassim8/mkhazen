/**
 * lib/permissions-server.ts — فحص الصلاحية في API routes و Server Components
 */

import { NextResponse } from "next/server";

import { getSession, type TokenPayload } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

type Guard =
  | { ok: true; session: TokenPayload }
  | { ok: false; response: NextResponse };

/**
 * الاستخدام في أي route:
 *   const guard = await requirePermission("catalog.manage");
 *   if (!guard.ok) return guard.response;
 *   const user = guard.session;
 */
export async function requirePermission(permission: Permission): Promise<Guard> {
  const session = await getSession();

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 }),
    };
  }

  if (!can(session.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "عذراً، ليس لديك صلاحية لهذه العملية." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}

/** أي مستخدم مسجّل دخول (للقراءات المشتركة زي قائمة المنتجات) */
export async function requireLogin(): Promise<Guard> {
  const session = await getSession();

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 }),
    };
  }

  return { ok: true, session };
}

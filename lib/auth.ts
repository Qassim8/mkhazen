// lib/auth.ts — الجلسة في الـ API routes والـ Server Components
import { cookies, headers } from "next/headers";

import { supabaseAdmin } from "@/lib/supabase";
import {
  AUTH_COOKIE_NAME,
  cookieOptions,
  passwordFingerprint,
  signSessionToken,
  verifySessionToken,
  type TokenPayload,
} from "@/lib/session-token";

export type { TokenPayload } from "@/lib/session-token";

/**
 * سبب عدم وجود جلسة صالحة:
 * • missing  → مفيش توكن (مستخدم مش مسجّل)
 * • expired  → التوكن انتهى أو اتلغى (كلمة السر اتغيرت، الحساب اتعطل/اتحذف)
 * • invalid  → توكن متلاعب بيه
 * • unavailable → تعذر التحقق من الحساب (قاعدة البيانات مش متاحة) — مش خروج
 */
export type SessionFailure = "missing" | "expired" | "invalid" | "unavailable";

export type SessionResult =
  | { ok: true; session: TokenPayload }
  | { ok: false; reason: SessionFailure };

// 1. إنشاء الجلسة (بعد تسجيل الدخول أو تغيير كلمة السر)
export async function createSession(payload: TokenPayload & { passwordHash: string }) {
  const { passwordHash, ...claims } = payload;
  const { token, maxAge } = await signSessionToken({
    ...claims,
    pwv: await passwordFingerprint(passwordHash),
  });

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, cookieOptions(maxAge));

  invalidateAccountCache(payload.userId);
  return token;
}

async function readToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (fromCookie) return fromCookie;

  const headerList = await headers();
  const authHeader = headerList.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
}

// 2. فحص الجلسة بالتفصيل (عشان نفرّق بين 401 و 503)
export async function getSessionResult(): Promise<SessionResult> {
  return resolveSession(await readToken());
}

export async function resolveSession(token: string | undefined): Promise<SessionResult> {
  const verified = await verifySessionToken(token);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  const { claims } = verified;

  let account: AccountState | null;
  try {
    account = await getAccountState(claims.userId);
  } catch (error) {
    console.error("getSession account validation:", error);
    return { ok: false, reason: "unavailable" };
  }

  // الحساب اتحذف أو اتعطل أو كلمة السر اتغيرت بعد إصدار الجلسة
  if (!account || !account.isActive || account.pwv !== claims.pwv) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    session: {
      userId: claims.userId,
      email: claims.email,
      name: claims.name,
      role: account.role,
      isPasswordChanged: account.isPasswordChanged,
    },
  };
}

// تصلح للـ APIs والـ Server Components (null = مفيش جلسة صالحة لأي سبب)
export async function getSession(): Promise<TokenPayload | null> {
  const result = await getSessionResult();
  return result.ok ? result.session : null;
}

type AccountState = {
  role: string;
  isActive: boolean;
  isPasswordChanged: boolean;
  pwv: string;
};

const ACCOUNT_CACHE_MS = 30 * 1000;
const accountCache = new Map<string, { at: number; value: AccountState | null }>();

async function getAccountState(userId: string): Promise<AccountState | null> {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select('role, "isActive", "isPasswordChanged", password')
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`تعذر التحقق من حالة الحساب: ${error.message}`);
  }

  const value: AccountState | null = data
    ? {
        role: String(data.role ?? ""),
        isActive: isAccountActive(data.isActive),
        isPasswordChanged: Boolean(data.isPasswordChanged),
        pwv: await passwordFingerprint(String(data.password ?? "")),
      }
    : null;

  accountCache.set(userId, { at: Date.now(), value });
  return value;
}

export function isAccountActive(value: unknown): boolean {
  return (
    value !== false &&
    !(typeof value === "string" && value.trim().toLowerCase() === "false")
  );
}

export function invalidateAccountCache(userId: string) {
  accountCache.delete(userId);
}

// 3. إنهاء الجلسة
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    ...cookieOptions(0),
    expires: new Date(0),
  });
}

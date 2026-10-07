// src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET غير مُعرّف في متغيرات البيئة.");
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-only-secret-do-not-use-in-production",
);

const AUTH_COOKIE_NAME = "auth_token";
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  isPasswordChanged: boolean;
}

// 1. إنشاء الجلسة
export async function createSession(payload: TokenPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 7,
  });

  return token;
}

// 2. فحص الجلسة (تصلح للـ APIs والـ Server Components)
export async function getSession(): Promise<TokenPayload | null> {
  let token: string | undefined;

  // جلب التوكن من الكوكيز أولاً
  const cookieStore = await cookies();
  token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  // إذا لم يوجد في الكوكيز، نجربه من الـ Header
  if (!token) {
    const headerList = await headers();
    const authHeader = headerList.get("authorization");
    token = authHeader?.split(" ")[1];
  }

  if (!token) return null;

  let payload: TokenPayload;

  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    payload = verified.payload as unknown as TokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.userId !== "string" || !payload.userId) return null;

  let account: AccountState | null;
  try {
    account = await getAccountState(payload.userId);
  } catch (error) {
    console.error("getSession account validation:", error);
    return null;
  }

  if (!account || !account.isActive) return null;

  return {
    ...payload,
    role: account.role,
    isPasswordChanged: account.isPasswordChanged,
  };
}

type AccountState = {
  role: string;
  isActive: boolean;
  isPasswordChanged: boolean;
};

const ACCOUNT_CACHE_MS = 30 * 1000;
const accountCache = new Map<string, { at: number; value: AccountState | null }>();

async function getAccountState(userId: string): Promise<AccountState | null> {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select('role, "isActive", "isPasswordChanged"')
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
      }
    : null;

  accountCache.set(userId, { at: Date.now(), value });
  return value;
}

export function isAccountActive(value: unknown): boolean {
  return value !== false && !(typeof value === "string" && value.trim().toLowerCase() === "false");
}

export function invalidateAccountCache(userId: string) {
  accountCache.delete(userId);
}

// 3. إنهاء الجلسة
export async function destroySession() {
  const cookieStore = await cookies();
  // مسح الكوكي صراحة وتعيين الصلاحية لـ 0
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    ...AUTH_COOKIE_OPTIONS,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

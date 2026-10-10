/**
 * =====================================================================
 * lib/session-token.ts — توقيع والتحقق من توكن الجلسة (JWT)
 * =====================================================================
 * دوال نقية (من غير cookies أو قاعدة بيانات) عشان تتختبر لوحدها
 * وتشتغل في الـ proxy والـ API routes.
 *
 * سياسة الجلسة:
 * • مهلة خمول (idle): التوكن صالح SESSION_IDLE_HOURS ساعة (افتراضي 12)،
 *   وبيتجدد تلقائيًا مع الاستخدام (sliding) من الـ proxy.
 * • حد أقصى مطلق: SESSION_MAX_DAYS يوم من وقت تسجيل الدخول (افتراضي 7)
 *   مهما اتجدد التوكن، بعدها لازم تسجيل دخول جديد.
 * • pwv: بصمة من هاش كلمة السر. لما كلمة السر تتغير (من المستخدم أو
 *   إعادة تعيين من الإدارة) كل الجلسات القديمة بتبطل فورًا.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

export const AUTH_COOKIE_NAME = "auth_token";

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  isPasswordChanged: boolean;
}

export interface SessionClaims extends TokenPayload {
  /** بصمة كلمة السر وقت إصدار الجلسة */
  pwv: string;
  /** وقت بدء الجلسة الأصلي (ثواني) — للحد الأقصى المطلق */
  sat: number;
  iat: number;
  exp: number;
}

export type TokenVerification =
  | { ok: true; claims: SessionClaims }
  | { ok: false; reason: "missing" | "expired" | "invalid" };

function positiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function sessionIdleSeconds() {
  return Math.round(positiveNumberEnv("SESSION_IDLE_HOURS", 12) * 3600);
}

export function sessionMaxSeconds() {
  return Math.round(positiveNumberEnv("SESSION_MAX_DAYS", 7) * 86400);
}

/** التجديد بيحصل لو التوكن عدّى عليه أكتر من كده (يقلل كتابة الكوكي) */
export const REFRESH_AFTER_SECONDS = 15 * 60;

let warnedShortSecret = false;

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET غير مُعرّف في متغيرات البيئة.");
    }
    return new TextEncoder().encode("dev-only-secret-do-not-use-in-production");
  }

  if (process.env.NODE_ENV === "production" && secret.length < 32 && !warnedShortSecret) {
    warnedShortSecret = true;
    console.warn("[auth] JWT_SECRET أقصر من 32 حرفًا — يُنصح بقيمة عشوائية أطول.");
  }

  return new TextEncoder().encode(secret);
}

/** بصمة غير قابلة للعكس من هاش كلمة السر (مش الهاش نفسه) */
export async function passwordFingerprint(passwordHash: string): Promise<string> {
  const data = new TextEncoder().encode(`pwv:${passwordHash}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let binary = "";
  for (const byte of digest.slice(0, 16)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function signSessionToken(
  payload: TokenPayload & { pwv: string; sat?: number },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; maxAge: number }> {
  const sat = payload.sat ?? nowSeconds;
  const absoluteEnd = sat + sessionMaxSeconds();
  const exp = Math.min(nowSeconds + sessionIdleSeconds(), absoluteEnd);
  const maxAge = Math.max(0, exp - nowSeconds);

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    isPasswordChanged: payload.isPasswordChanged,
    pwv: payload.pwv,
    sat,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(exp)
    .sign(getJwtSecret());

  return { token, maxAge };
}

export async function verifySessionToken(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TokenVerification> {
  if (!token) return { ok: false, reason: "missing" };

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      currentDate: new Date(nowSeconds * 1000),
    });

    const claims = payload as unknown as SessionClaims;

    if (
      typeof claims.userId !== "string" ||
      !claims.userId ||
      typeof claims.pwv !== "string" ||
      !claims.pwv ||
      typeof claims.sat !== "number"
    ) {
      // توكنات قديمة (قبل التحديث) ما فيهاش pwv/sat → لازم دخول جديد
      return { ok: false, reason: "expired" };
    }

    if (nowSeconds >= claims.sat + sessionMaxSeconds()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, claims };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}

/** توكن جديد بنفس الجلسة (نفس sat و pwv) لو التوكن الحالي قديم شوية */
export async function refreshSessionTokenIfNeeded(
  claims: SessionClaims,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; maxAge: number } | null> {
  if (nowSeconds - claims.iat < REFRESH_AFTER_SECONDS) return null;
  if (nowSeconds >= claims.sat + sessionMaxSeconds()) return null;

  return signSessionToken(
    {
      userId: claims.userId,
      email: claims.email,
      name: claims.name,
      role: claims.role,
      isPasswordChanged: claims.isPasswordChanged,
      pwv: claims.pwv,
      sat: claims.sat,
    },
    nowSeconds,
  );
}

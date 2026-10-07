// src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-fallback-secret-key-make-it-long-and-secure",
);

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
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return token;
}

// 2. فحص الجلسة (تصلح للـ APIs والـ Server Components)
export async function getSession(): Promise<TokenPayload | null> {
  let token: string | undefined;

  // جلب التوكن من الكوكيز أولاً
  const cookieStore = await cookies();
  token = cookieStore.get("auth_token")?.value;

  // إذا لم يوجد في الكوكيز، نجربه من الـ Header
  if (!token) {
    const headerList = await headers();
    const authHeader = headerList.get("authorization");
    token = authHeader?.split(" ")[1];
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// 3. إنهاء الجلسة
export async function destroySession() {
  const cookieStore = await cookies();
  // مسح الكوكي صراحة وتعيين الصلاحية لـ 0
  cookieStore.set("auth_token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { canAccessPath, homePageFor } from "@/lib/permissions";

/**
 * حماية الصفحات. قواعد الصلاحيات نفسها في lib/permissions.ts
 * (نفس المرجع اللي بتستخدمه الـ APIs والقائمة الجانبية).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const session = await getSession();

  const isAuthPage = pathname === "/";
  const isSettingsPage = pathname.startsWith("/dashboard/settings");

  // 1. غير مسجل دخول ويحاول يفتح الداشبورد
  if (!session && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session) {
    // 2. توجيه من صفحة الدخول
    if (isAuthPage) {
      if (!session.isPasswordChanged) {
        return NextResponse.redirect(new URL("/dashboard/settings?forceChange=true", req.url));
      }
      return NextResponse.redirect(new URL(homePageFor(session.role), req.url));
    }

    // 3. لازم يغيّر كلمة السر الأول
    if (!session.isPasswordChanged && !isSettingsPage) {
      return NextResponse.redirect(new URL("/dashboard/settings?forceChange=true", req.url));
    }

    // 4. صلاحية الصفحة
    if (pathname.startsWith("/dashboard") && !canAccessPath(session.role, pathname)) {
      return NextResponse.redirect(new URL(homePageFor(session.role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

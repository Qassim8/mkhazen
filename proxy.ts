import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

const ROLE_HOME_PAGES: Record<string, string> = {
  admin: "/dashboard",
  cashier: "/dashboard/pos",
  tailor: "/dashboard/orders",
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const session = await getSession();

  const isAuthPage = pathname === "/";
  const isSettingsPage = pathname.startsWith("/dashboard/settings");

  // 1. إذا لم يكن مسجلاً الدخول وحاول الوصول للداشبورد
  if (!session && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session) {
    const userRole = (session.role || "").toLowerCase();

    // 2. توجيه من صفحة اللوجن
    if (isAuthPage) {
      if (!session.isPasswordChanged) {
        return NextResponse.redirect(
          new URL("/dashboard/settings?forceChange=true", req.url),
        );
      }
      const defaultPage = ROLE_HOME_PAGES[userRole] || "/dashboard";
      return NextResponse.redirect(new URL(defaultPage, req.url));
    }

    // 3. حظر التنقل إذا لم يُغيّر كلمة المرور
    if (!session.isPasswordChanged && !isSettingsPage) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?forceChange=true", req.url),
      );
    }

    // 4. حماية مسارات الأدمن المقيدة (تضمن المقارنة بـ lowercase)
    const isAdminOnlyRoute =
      pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/employees") ||
      pathname.startsWith("/dashboard/products") ||
      pathname.startsWith("/dashboard/categories") ||
      pathname.startsWith("/dashboard/suppliers") ||
      pathname.startsWith("/dashboard/inventory") ||
      pathname.startsWith("/dashboard/accounting") ||
      pathname.startsWith("/dashboard/reports") ||
      pathname.startsWith("/dashboard/admin");

    if (isAdminOnlyRoute && userRole !== "admin") {
      const userHome = ROLE_HOME_PAGES[userRole] || "/dashboard/settings";
      return NextResponse.redirect(new URL(userHome, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

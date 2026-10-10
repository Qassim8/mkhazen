/**
 * GET /api/reports — بيانات التقارير (JSON) للمدير فقط
 * الفلاتر: preset=today|week|month|last_month|quarter|year|custom
 *          from, to (YYYY-MM-DD عند custom) — categoryId — productId
 */

import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { buildReport, resolveReportFilters } from "@/lib/reports/build-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "reports.view")) {
      return NextResponse.json({ message: "غير مسموح لك بالوصول.", code: "FORBIDDEN" }, { status: 403 });
    }

    const filters = resolveReportFilters(Object.fromEntries(request.nextUrl.searchParams));
    const report = await buildReport(filters);

    return NextResponse.json({ data: report });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "حدث خطأ أثناء جلب التقارير." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reports/export — تصدير التقرير كملف Excel (.xlsx)
 * نفس فلاتر /api/reports. الملف فيه ورقة لكل قسم، من اليمين لليسار.
 */

import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildXlsx } from "@/lib/xlsx-writer";
import {
  buildReport,
  describeFilters,
  resolveReportFilters,
} from "@/lib/reports/build-report";
import { buildReportSheets } from "@/lib/reports/report-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();

    if (!user || !can(user.role, "reports.view")) {
      return NextResponse.json({ message: "غير مسموح لك بالوصول." }, { status: 403 });
    }

    const filters = resolveReportFilters(Object.fromEntries(request.nextUrl.searchParams));
    const report = await buildReport(filters);
    const buffer = buildXlsx(buildReportSheets(report, describeFilters(report)));

    const fileName = `تقرير-${filters.from}-${filters.to}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-${filters.from}-${filters.to}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/reports/export error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر تصدير التقرير." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/payroll/sales?employeeId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * إجمالي مبيعات موظف (cashier_id) في فترة، كمرجع عند صرف العمولة (نسبة من الأرباح).
 * يستخدم buildReport نفسه فتطابق الأرقام تقرير "مبيعات الكاشير" (المحصّل بالجنيه والدولار،
 * فواتير الكاشير المكتملة)، فلا يوجد منطق مبيعات ثانٍ. المبلغ المصروف يُدخل يدويًا.
 * المالك والمدير فقط (payroll.manage).
 */

import { NextRequest, NextResponse } from "next/server";

import { apiError, isUuid } from "@/lib/api-response";
import { requirePermission } from "@/lib/permissions-server";
import { buildReport } from "@/lib/reports/build-report";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const guard = await requirePermission("payroll.manage", "مبيعات الموظف متاحة للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const employeeId = params.get("employeeId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  if (!isUuid(employeeId) || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return apiError(422, "VALIDATION_ERROR", "الموظف أو الفترة غير صالحة.");
  }

  try {
    const report = await buildReport({ preset: "custom", from, to, categoryId: null, productId: null });
    const row = report.cashiers.find((cashier) => cashier.cashierId === employeeId);

    return NextResponse.json({
      data: {
        employeeId,
        from,
        to,
        invoices: row?.invoices ?? 0,
        quantity: row?.quantity ?? 0,
        revenueSdg: row?.revenueSdg ?? 0,
        revenueUsd: row?.revenueUsd ?? 0,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/payroll/sales:", error);
    return apiError(500, "INTERNAL_ERROR", "تعذر جلب مبيعات الموظف.");
  }
}

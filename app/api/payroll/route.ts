/**
 * /api/payroll — السلف والمستحقات (المالك والمدير)
 * GET  ?period=YYYY-MM → ملخص الشهر: الموظفين بالراتب + الخياطين
 * POST → pay_employee (سلفة أو راتب): قيد مدين SALARIES / دائن الخزينة أو البنك بالجنيه
 * (سداد وسلف الخياطين من /api/accounting/tailor-dues)
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, invalidJsonResponse, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { loadPayrollMonth, normalizePeriod } from "./_lib/payroll";

const payEmployeeSchema = z.object({
  employeeId: z.string().uuid("معرف الموظف غير صالح"),
  period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "الشهر غير صالح"),
  type: z.enum(["ADVANCE", "SALARY"], { message: "نوع الدفعة غير صالح" }),
  amount: z
    .number({ message: "المبلغ غير صالح" })
    .positive("المبلغ يجب أن يكون أكبر من صفر")
    .refine((value) => Number(value.toFixed(2)) === value, "منزلتين عشريتين كحد أقصى"),
  paymentMethod: z.enum(["CASH", "BANK"], { message: "طريقة الدفع غير صالحة" }),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const guard = await requirePermission("payroll.manage");
  if (!guard.ok) return guard.response;

  try {
    const period = normalizePeriod(new URL(request.url).searchParams.get("period"));
    return NextResponse.json({ data: await loadPayrollMonth(period) });
  } catch (error) {
    console.error("GET /api/payroll:", error);
    return apiError(500, "INTERNAL_ERROR", "تعذر جلب الرواتب.");
  }
}

export async function POST(request: Request) {
  const guard = await requirePermission("payroll.manage", "صرف الرواتب والسلف متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = payEmployeeSchema.safeParse(body);
  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات الدفعة غير صالحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }
  const value = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request,
    scope: "payroll.pay-employee",
    userId: user.userId,
    payload: value,
    context: "pay_employee",
    fallbackMessage: "تعذر تسجيل الدفعة.",
    rpc: () =>
      supabaseAdmin.rpc("pay_employee", {
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_employee_id: value.employeeId,
        p_period: normalizePeriod(value.period),
        p_type: value.type,
        p_amount: value.amount,
        p_payment_method: value.paymentMethod,
        p_notes: value.notes ?? null,
      }),
    onSuccess: (data) => ({
      status: 201,
      body: {
        message: value.type === "ADVANCE" ? "تم تسجيل السلفة." : "تم صرف الراتب.",
        data,
      },
    }),
  });
}

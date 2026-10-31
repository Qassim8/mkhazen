/**
 * /api/payroll — الرواتب والسلف (المالك والمدير)
 * GET  ?period=YYYY-MM → ملخص الشهر: الموظفون (رصيد السلف وحركات الشهر) + الخياطون
 * POST → pay_employee بالجنيه:
 *   ADVANCE        سلفة (مبلغ مفتوح): EMPLOYEE_ADVANCES / الخزينة أو البنك
 *   ADVANCE_RETURN استرداد نقدي: الخزينة أو البنك / EMPLOYEE_ADVANCES (لا يتجاوز الرصيد)
 *   SALARY         راتب بأي مبلغ: SALARIES / الخزينة أو البنك (+ خصم اختياري من رصيد السلف)
 *   COMMISSION     نسبة من الأرباح: SALARIES / الخزينة أو البنك (لا تمس رصيد السلف)
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
  type: z.enum(["ADVANCE", "ADVANCE_RETURN", "SALARY", "COMMISSION"], { message: "نوع الدفعة غير صالح" }),
  amount: z
    .number({ message: "المبلغ غير صالح" })
    .positive("المبلغ يجب أن يكون أكبر من صفر")
    .refine((value) => Number(value.toFixed(2)) === value, "منزلتين عشريتين كحد أقصى"),
  paymentMethod: z.enum(["CASH", "BANK"], { message: "طريقة الدفع غير صالحة" }),
  /** خصم من رصيد السلف عند صرف الراتب (يُجمع مع الصافي ليساوي مبلغ الراتب الكامل) */
  deductAdvance: z
    .number({ message: "مبلغ الخصم غير صالح" })
    .min(0, "مبلغ الخصم غير صالح")
    .refine((value) => Number(value.toFixed(2)) === value, "منزلتين عشريتين كحد أقصى")
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const SUCCESS_MESSAGES = {
  ADVANCE: "تم تسجيل السلفة.",
  ADVANCE_RETURN: "تم تسجيل استرداد السلفة.",
  SALARY: "تم صرف الراتب.",
  COMMISSION: "تم صرف العمولة.",
} as const;

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
        p_deduct_advance: value.deductAdvance ?? 0,
      }),
    onSuccess: (data) => ({
      status: 201,
      body: {
        message: SUCCESS_MESSAGES[value.type],
        data,
      },
    }),
  });
}

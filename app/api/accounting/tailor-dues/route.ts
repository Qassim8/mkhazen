import { NextResponse } from "next/server";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, dbErrorResponse, invalidJsonResponse, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { notifyTailorPayment } from "@/app/api/tailoring/_lib/notify";
import { payTailorDuesSchema } from "@/app/dashboard/accounting/schemas/accounting.schema";
import { mapTailorDuesRow } from "@/app/api/accounting/_lib/tailor-dues";

/** GET — مستحقات كل الخياطين (أجرة الطلبات المثبتة − المدفوع والسلف) */
export async function GET() {
  const guard = await requirePermission("accounting.view");
  if (!guard.ok) return guard.response;

  const { data, error } = await supabaseAdmin.rpc("get_tailor_dues", {
    p_branch_id: MAIN_BRANCH_ID,
    p_tailor_id: null,
  });
  if (error) return dbErrorResponse(error, "get_tailor_dues", "تعذر جلب مستحقات الخياطين.");

  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapTailorDuesRow);
  return NextResponse.json({
    data: rows,
    totals: {
      remainingSdg: Number(rows.reduce((sum, row) => sum + row.remainingSdg, 0).toFixed(2)),
      advancesSdg: Number(rows.reduce((sum, row) => sum + row.advancesSdg, 0).toFixed(2)),
    },
  });
}

/** POST — سداد المستحق كاملًا أو سلفة للخياط (ذرّي في pay_tailor_dues + منع التكرار) */
export async function POST(request: Request) {
  const guard = await requirePermission("accounting.manage", "سداد مستحقات الخياطين متاح للمدير أو المالك فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = payTailorDuesSchema.safeParse(body);
  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات الدفعة غير صالحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const value = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request,
    scope: "accounting.tailor-dues",
    userId: user.userId,
    payload: value,
    context: "pay_tailor_dues",
    fallbackMessage: "تعذر تسجيل الدفعة للخياط.",
    rpc: () =>
      supabaseAdmin.rpc("pay_tailor_dues", {
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_tailor_id: value.tailorId,
        p_kind: value.kind,
        p_amount: value.amount,
        p_payment_method: value.paymentMethod,
        p_notes: value.notes ?? null,
      }),
    onSuccess: async (data) => {
      await notifyTailorPayment({
        tailorId: value.tailorId,
        amount: Number(data?.amount ?? value.amount),
        currency: "SDG",
        salesOrderId: null,
        isAdvance: value.kind === "ADVANCE",
        actor: user,
      });

      return {
        status: 201,
        body: {
          message:
            value.kind === "ADVANCE"
              ? "تم تسجيل السلفة للخياط وخصمها من مستحقاته."
              : "تم سداد مستحقات الخياط بالكامل.",
          data,
        },
      };
    },
  });
}

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, invalidJsonResponse, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { notifyTailorPayment } from "@/app/api/tailoring/_lib/notify";
import { payTailorPaymentSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

/** POST — دفع مستحقات/سلفة لخياط (ذرّي في pay_tailor_payment + منع التكرار) */
export async function POST(request: Request) {
  const guard = await requirePermission("tailoring.manage", "دفع مستحقات الخياط متاح للمدير أو المالك فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = payTailorPaymentSchema.safeParse(body);
  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات دفعة الخياط غير صالحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const value = validation.data;

  return runIdempotentRpc<{ payment_type?: string } & Record<string, unknown>>({
    request,
    scope: "tailoring.tailor-payment",
    userId: user.userId,
    payload: value,
    context: "pay_tailor_payment",
    fallbackMessage: "تعذر تسجيل دفعة الخياط.",
    rpc: () =>
      supabaseAdmin.rpc("pay_tailor_payment", {
        p_branch_id: MAIN_BRANCH_ID,
        p_tailor_id: value.tailorId,
        p_user_id: user.userId,
        p_amount: value.amount,
        p_payment_method: value.paymentMethod,
        p_sales_order_id: value.salesOrderId ?? null,
        p_notes: value.notes ?? null,
        p_currency: value.currency,
      }),
    onSuccess: async (data) => {
      await notifyTailorPayment({
        tailorId: value.tailorId,
        amount: Number(value.amount),
        currency: value.currency,
        salesOrderId: value.salesOrderId ?? null,
        isAdvance: data?.payment_type === "ADVANCE",
        actor: user,
      });

      return {
        status: 201,
        body: {
          message:
            data?.payment_type === "ADVANCE"
              ? "تم تسجيل الدفعة المقدمة للخياط بنجاح."
              : "تم تسجيل سداد مستحقات الخياط بنجاح.",
          data,
        },
      };
    },
  });
}

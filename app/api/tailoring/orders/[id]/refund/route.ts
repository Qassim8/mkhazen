import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, invalidJsonResponse, isUuid, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { refundCustomerAdvanceSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("tailoring.manage", "استرداد عربون العميل متاح للمدير أو المالك فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "طلب التفصيل غير موجود.");

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const parsed = refundCustomerAdvanceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات الاسترداد غير صالحة.", {
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  return runIdempotentRpc({
    request,
    scope: "tailoring.refund",
    userId: user.userId,
    payload: { id, ...parsed.data },
    context: "refund_customer_advance",
    fallbackMessage: "تعذر استرداد العربون.",
    rpc: () =>
      supabaseAdmin.rpc("refund_customer_advance", {
        p_order_id: id,
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_amount: parsed.data.amount,
        p_payment_method: parsed.data.paymentMethod,
        p_notes: parsed.data.notes,
      }),
    onSuccess: async (data) => {
      await notifyTailoringUpdate({ orderId: id, event: "REFUNDED", actor: user });
      return { body: { message: "تم استرداد العربون وتسجيل القيد المحاسبي بنجاح.", data } };
    },
  });
}

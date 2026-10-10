import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, dbErrorResponse, invalidJsonResponse, isUuid, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { completeTailoringPickupSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

/**
 * POST /api/tailoring/orders/:id/pickup — استلام العميل لطلبه وتحصيل الباقي
 * (ذرّي في complete_tailoring_pickup + منع التكرار بـ Idempotency-Key)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission(
    "tailoring.operate",
    "استلام طلب العميل وتحصيل الباقي متاح للكاشير أو الإدارة فقط.",
  );
  if (!guard.ok) return guard.response;
  const user = guard.session;
  const role = String(user.role).toLowerCase();

  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "طلب تفصيل العميل غير موجود.");

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = completeTailoringPickupSchema.safeParse(body);
  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "بيانات الاستلام غير صالحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("sales_orders")
    .select("id")
    .eq("id", id)
    .eq("branch_id", MAIN_BRANCH_ID)
    .eq("order_type", "TAILORING")
    .eq("tailoring_purpose", "CUSTOMER")
    .maybeSingle();

  if (orderError) return dbErrorResponse(orderError, "pickup lookup", "تعذر تحميل الطلب.");
  if (!order) return apiError(404, "NOT_FOUND", "طلب تفصيل العميل غير موجود.");

  return runIdempotentRpc<{ order_number: string } & Record<string, unknown>>({
    request,
    scope: "tailoring.pickup",
    userId: user.userId,
    payload: { id, ...validation.data },
    context: "complete_tailoring_pickup",
    fallbackMessage: "تعذر إتمام استلام الطلب.",
    rpc: () =>
      supabaseAdmin.rpc("complete_tailoring_pickup", {
        p_order_id: id,
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_payment_method: validation.data.paymentMethod,
      }),
    onSuccess: async (data) => {
      await notifyTailoringUpdate({ orderId: id, event: "RECEIVED", actor: user });
      return {
        body: {
          message: `تم استلام الطلب ${data.order_number} وتحصيل المبلغ المتبقي بنجاح.`,
          data: can(role, "tailoring.manage")
            ? data
            : { id, order_number: data.order_number, tailoring_status: "RECEIVED" },
        },
      };
    },
  });
}

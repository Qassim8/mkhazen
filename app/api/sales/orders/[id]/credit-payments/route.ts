/**
 * POST /api/sales/orders/[id]/credit-payments — تحصيل دفعة على فاتورة آجلة
 *
 * • ذرّي داخل record_credit_payment: الدفعة + قيد الإيراد بسعر صرف لحظتها + تحرير التكلفة المؤجلة.
 * • تقبل مبلغًا أكبر من المتبقي (تعويض فرق الصرف): الزيادة إيراد عادي والفاتورة تُغلق.
 * • الكاشير وما فوق (sales.pos).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { apiError, invalidJsonResponse, isUuid, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { creditPaymentSchema } from "@/app/dashboard/pos/schemas/credit.schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("sales.pos", "عذراً، تحصيل الدفعات غير متاح لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف الفاتورة غير صالح.");

  const body = await readJson(req);
  if (body === null) return invalidJsonResponse();

  const validation = creditPaymentSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات الدفعة غير صالحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { amount, paymentMethod, notes } = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request: req,
    scope: "sales.creditPayment",
    userId: user.userId,
    payload: { id, ...validation.data },
    context: "record_credit_payment",
    fallbackMessage: "تعذر تسجيل الدفعة.",
    hideBalances: true,
    rpc: () =>
      supabaseAdmin.rpc("record_credit_payment", {
        p_order_id: id,
        p_amount_sdg: amount,
        p_method: paymentMethod,
        p_user_id: user.userId,
        p_branch_id: MAIN_BRANCH_ID,
        p_notes: notes ?? null,
      }),
    onSuccess: (result) => {
      revalidateTag("accounting-entries", "default");
      revalidateTag("accounting-summary", "default");
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/accounting");

      return {
        status: 201,
        body: {
          message: result.closed ? "تم تسجيل الدفعة وسداد الفاتورة بالكامل." : "تم تسجيل الدفعة بنجاح.",
          orderId: result.order_id,
          orderNumber: result.order_number,
          paymentId: result.payment_id,
          amount: Number(result.amount),
          exchangeRateUsed: Number(result.exchange_rate_used),
          remainingBefore: Number(result.remaining_before),
          remainingAmount: Number(result.remaining_amount),
          overpaidAmount: Number(result.overpaid_amount),
          paymentStatus: result.payment_status,
          closed: result.closed === true,
        },
      };
    },
  });
}

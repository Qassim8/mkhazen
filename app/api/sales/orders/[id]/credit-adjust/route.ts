/**
 * POST /api/sales/orders/[id]/credit-adjust — تعديل متبقي فاتورة آجلة (تفاوض)، زيادة أو نقصانًا
 *
 * بدون قيد محاسبي، مع سجل في credit_adjustments (القديم ← الجديد + السبب + المستخدم).
 * المالك والمدير فقط (sales.creditManage).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { apiError, invalidJsonResponse, isUuid, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { creditAdjustSchema } from "@/app/dashboard/pos/schemas/credit.schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("sales.creditManage", "تعديل متبقي الفاتورة الآجلة متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف الفاتورة غير صالح.");

  const body = await readJson(req);
  if (body === null) return invalidJsonResponse();

  const validation = creditAdjustSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات التعديل غير صالحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { newRemaining, reason } = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request: req,
    scope: "sales.creditAdjust",
    userId: user.userId,
    payload: { id, ...validation.data },
    context: "adjust_credit_remaining",
    fallbackMessage: "تعذر تعديل المتبقي.",
    rpc: () =>
      supabaseAdmin.rpc("adjust_credit_remaining", {
        p_order_id: id,
        p_new_remaining: newRemaining,
        p_reason: reason,
        p_user_id: user.userId,
      }),
    onSuccess: (result) => {
      revalidatePath("/dashboard/sales");

      return {
        status: 200,
        body: {
          message: "تم تعديل المتبقي وتسجيله في السجل.",
          orderId: result.order_id,
          orderNumber: result.order_number,
          oldRemaining: Number(result.old_remaining),
          newRemaining: Number(result.new_remaining),
        },
      };
    },
  });
}

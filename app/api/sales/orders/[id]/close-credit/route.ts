/**
 * POST /api/sales/orders/[id]/close-credit — إغلاق فاتورة آجلة كدين معدوم
 *
 * remaining_amount = 0، وتتحول التكلفة المؤجلة المتبقية إلى مصروف
 * (OTHER_EXPENSE ← DEFERRED_COGS). المالك والمدير فقط (sales.creditManage).
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { apiError, isUuid, readJson } from "@/lib/api-response";
import { runIdempotentRpc } from "@/lib/idempotency";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { closeCreditSchema } from "@/app/dashboard/pos/schemas/credit.schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("sales.creditManage", "إغلاق الدين المعدوم متاح للمالك أو المدير فقط.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف الفاتورة غير صالح.");

  // الجسم اختياري (ملاحظات فقط)
  const body = (await readJson(req)) ?? {};
  const validation = closeCreditSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات الإغلاق غير صالحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { notes } = validation.data;

  return runIdempotentRpc<Record<string, unknown>>({
    request: req,
    scope: "sales.closeCredit",
    userId: user.userId,
    payload: { id, ...validation.data },
    context: "close_credit_bad_debt",
    fallbackMessage: "تعذر إغلاق الدين.",
    rpc: () =>
      supabaseAdmin.rpc("close_credit_bad_debt", {
        p_order_id: id,
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
        status: 200,
        body: {
          message: "تم إغلاق الفاتورة كدين معدوم.",
          orderId: result.order_id,
          orderNumber: result.order_number,
          writtenOffSdg: Number(result.written_off_sdg),
          expensedCostUsd: Number(result.expensed_cost_usd),
        },
      };
    },
  });
}

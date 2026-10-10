/**
 * POST /api/accounting/exchange — تحويل عملة (جنيه ⇄ دولار)
 * مثال: المدير باع 2,500,000 ج.س من الخزينة واشترى بيهم 950 $
 */

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";
import { revalidatePath, revalidateTag } from "next/cache";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { runIdempotentRpc } from "@/lib/idempotency";

import { currencyExchangeSchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

export async function POST(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "accounting.manage")) {
      return NextResponse.json(
        { message: "عذراً، تحويل العملة مقتصر على المدير فقط", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = currencyExchangeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التحويل غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const value = validation.data;

    return await runIdempotentRpc<{ fx_result_usd?: number | string } & Record<string, unknown>>({
      request,
      scope: "accounting.exchange",
      userId: user.userId,
      payload: value,
      context: "exchange_currency",
      fallbackMessage: "تعذر تنفيذ تحويل العملة",
      rpc: () =>
        supabaseAdmin.rpc("exchange_currency", {
          p_branch_id: MAIN_BRANCH_ID,
          p_user_id: user.userId,
          p_from_currency: value.fromCurrency,
          p_from_account: value.fromAccount,
          p_from_amount: value.fromAmount,
          p_to_account: value.toAccount,
          p_to_amount: value.toAmount,
          p_notes: value.notes ?? null,
        }),
      onSuccess: (data) => {
        revalidateTag("accounting-entries", "default");
        revalidateTag("accounting-summary", "default");
        revalidateTag("accounting-overview", "default");
        revalidatePath("/dashboard/accounting");

        const fx = Number(data?.fx_result_usd ?? 0);

        return {
          status: 201,
          body: {
            message:
              fx === 0
                ? "تم تحويل العملة بنجاح"
                : fx > 0
                  ? `تم تحويل العملة بنجاح — ربح فرق صرف ${fx.toFixed(2)} $`
                  : `تم تحويل العملة بنجاح — خسارة فرق صرف ${Math.abs(fx).toFixed(2)} $`,
            data,
          },
        };
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/accounting/exchange:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "خطأ غير متوقع" },
      { status: 500 },
    );
  }
}

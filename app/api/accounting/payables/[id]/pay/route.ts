/**
 * POST /api/accounting/payables/[id]/pay — دفعة (جزئية أو كاملة) على مستحق
 *
 * ذرّية في pay_payable: OTHER_PAYABLES ← الخزينة/البنك مع فحص الرصيد، ولا تتجاوز المتبقي،
 * وعند اكتمال سداد مستحق بالجنيه يُغلق فرق الدولار على CURRENCY_EXCHANGE.
 * من يسجّل الأصول والمصروفات يستطيع الدفع. دفعة الكاشير تُشعِر المالك.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { money, notifyOwnerOfCashierAction } from "@/app/api/_lib/cashier-audit";
import { apiError, isUuid, readJson } from "@/lib/api-response";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { runIdempotentRpc } from "@/lib/idempotency";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

const paySchema = z.object({
  amount: z
    .number({ error: "مبلغ الدفعة مطلوب" })
    .finite("مبلغ الدفعة غير صالح")
    .positive("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    .max(1_000_000_000, "مبلغ الدفعة كبير جدًا")
    .refine((value) => Number(value.toFixed(2)) === value, "مبلغ الدفعة يجب ألا يتجاوز منزلتين عشريتين"),
  method: z.enum(["CASH", "BANK"], { message: "طريقة الدفع يجب أن تكون خزينة أو بنك" }),
  notes: z.string().trim().max(500, "الملاحظات طويلة جدًا").nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("payables.manage", "دفع المستحقات غير متاح لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف المستحق غير صالح.");

  const body = await readJson(request);
  if (body === null) return apiError(400, "VALIDATION_ERROR", "جسم الطلب غير صالح.");

  const validation = paySchema.safeParse(body);
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

  const { amount, method, notes } = validation.data;

  return runIdempotentRpc<{
    payment_id: string;
    journal_entry_id: string;
    amount: number;
    remaining_amount: number;
    status: "OPEN" | "PAID";
    fx_entry_id: string | null;
  }>({
    request,
    scope: "accounting.payable-payment",
    userId: user.userId,
    payload: { id, ...validation.data },
    context: "pay_payable",
    fallbackMessage: "تعذر تسجيل دفعة المستحق",
    // الكاشير لا يرى أرصدة الخزينة/البنك
    hideBalances: !can(user.role, "accounting.view"),
    rpc: () =>
      supabaseAdmin.rpc("pay_payable", {
        p_payable_id: id,
        p_amount: amount,
        p_method: method,
        p_user_id: user.userId,
        p_branch_id: MAIN_BRANCH_ID,
        p_notes: notes ?? null,
      }),
    onSuccess: async (data) => {
      const { data: payable } = await supabaseAdmin
        .from("payables")
        .select("description, currency")
        .eq("id", id)
        .maybeSingle();

      const currency = (payable?.currency === "SDG" ? "SDG" : "USD") as "USD" | "SDG";

      await notifyOwnerOfCashierAction({
        actor: user,
        kind: "PAYABLE_PAYMENT",
        title: "دفعة مستحقات من الكاشير",
        details: `دفع ${money(amount, currency)} (${method === "BANK" ? "من البنك" : "من الخزينة"}) على «${payable?.description ?? "مستحق"}» — المتبقي ${money(Number(data.remaining_amount), currency)}`,
        link: "/dashboard/accounting/payables",
        amount,
        currency,
        metadata: { payable_id: id, payment_id: data.payment_id, journal_entry_id: data.journal_entry_id },
      });

      revalidateTag("accounting-assets", "default");
      revalidateTag("accounting-entries", "default");
      revalidateTag("accounting-summary", "default");
      revalidateTag("accounting-overview", "default");
      revalidatePath("/dashboard/accounting");
      revalidatePath("/dashboard/accounting/assets");
      revalidatePath("/dashboard/accounting/payables");

      return {
        status: 201,
        body: {
          message: data.status === "PAID" ? "تم سداد المستحق بالكامل" : "تم تسجيل الدفعة",
          data,
        },
      };
    },
  });
}

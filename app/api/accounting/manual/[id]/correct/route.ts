/**
 * /api/accounting/manual/[id]/correct — "تعديل" قيد يدوي
 *
 * لا يُعدَّل ولا يُحذف القيد الأصلي أبدًا: التنفيذ كله ذرّي داخل
 * correct_manual_journal_entry — قيد عكسي يلغي الأصل رياضيًا + قيد جديد
 * بالقيمة الصحيحة. متاح فقط للقيود اليدوية (رأس مال / مصروف / إيراد آخر).
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireLogin } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { runIdempotentRpc } from "@/lib/idempotency";

import { correctManualJournalEntrySchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Props) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "accounting.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ message: "معرف القيد مطلوب" }, { status: 400 });
    }

    const body = await request.json();

    const validation = correctManualJournalEntrySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التصحيح غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { amount, currency, paymentMethod, account, reference, description, notes } =
      validation.data;

    return await runIdempotentRpc<unknown>({
      request,
      scope: "accounting.manual.correct",
      userId: user.userId,
      payload: { id, ...validation.data },
      context: "correct_manual_journal_entry",
      fallbackMessage: "تعذر تصحيح القيد",
      rpc: () =>
        supabaseAdmin.rpc("correct_manual_journal_entry", {
          p_branch_id: MAIN_BRANCH_ID,
          p_user_id: user.userId ?? null,
          p_entry_id: id,
          p_new_amount: amount,
          p_new_currency: currency,
          p_new_payment_method: paymentMethod ?? null,
          p_new_account: account ?? null,
          p_new_description: description,
          p_new_reference: reference ?? null,
          p_notes: notes ?? null,
        }),
      onSuccess: (result) => {
        revalidateTag("accounting-entries", "default");
        revalidateTag("accounting-summary", "default");
        revalidatePath("/dashboard/accounting");

        const row = result as {
          reversal_entry_id: string;
          reversal_entry_number: string;
          new_entry_id: string;
          new_entry_number: string;
        };

        return {
          status: 200,
          body: {
            message: "تم تصحيح القيد بنجاح",
            data: {
              reversalEntryId: row.reversal_entry_id,
              reversalEntryNumber: row.reversal_entry_number,
              newEntryId: row.new_entry_id,
              newEntryNumber: row.new_entry_number,
            },
          },
        };
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/accounting/manual/[id]/correct:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { createManualJournalEntrySchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

import { can } from "@/lib/permissions";
import { dbErrorResponse, isDefiniteDbRejection } from "@/lib/api-response";
import { maskBalanceError } from "@/lib/idempotency";
import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { beginIdempotentOperation, readIdempotencyKey } from "@/lib/idempotency";
import { money, notifyOwnerOfCashierAction } from "@/app/api/_lib/cashier-audit";

import {
  createJournalEntry,
  formatBalanceMessage,
  getAccountBalance,
} from "../_lib/accounting";

export async function POST(request: Request) {
  // لو حصل خطأ قبل كتابة القيد نحرر مفتاح منع التكرار (مفيش أي أثر اتسجل)
  let wroteEntry = false;
  let releaseKey: (() => Promise<void>) | null = null;

  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    // الكاشير يسجّل مصروفًا فقط (expenses.record)؛ باقي الأنواع تتطلب accounting.manage
    const canManage = !!user && can(user.role, "accounting.manage");

    if (!user || !(canManage || can(user.role, "expenses.record"))) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    const validation = createManualJournalEntrySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات القيد غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      entryType,
      amount,
      paymentMethod,
      account,
      reference,
      description,
      currency,
      ownerPaid,
      paidNow,
      remaining,
      dueDate,
    } = validation.data;

    if (!canManage && entryType !== "EXPENSE") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    /* =====================================================
       CAPITAL

       DR BANK / CASH
       CR CAPITAL
    ===================================================== */

    // منع تسجيل نفس القيد مرتين (نقرتين / إعادة إرسال بعد انقطاع)
    const idempotency = await beginIdempotentOperation({
      scope: "accounting.manual",
      userId: user.userId,
      clientKey: readIdempotencyKey(request),
      payload: validation.data,
    });
    if (idempotency.kind === "response") return idempotency.response;

    releaseKey = () => idempotency.abandon();

    const respond = async (status: number, body: Record<string, unknown>) => {
      if (status < 300) await idempotency.finish(status, body);
      else await idempotency.abandon();
      return NextResponse.json(body, { status });
    };

    const createEntry: typeof createJournalEntry = async (params) => {
      wroteEntry = true;
      try {
        return await createJournalEntry(params);
      } catch (entryError) {
        if (isDefiniteDbRejection((entryError as { dbError?: unknown }).dbError)) {
          await idempotency.abandon();
        }
        throw entryError;
      }
    };

    if (entryType === "CAPITAL" && !can(user.role, "accounting.capital")) {
      return respond(403, { message: "قيود رأس المال متاحة للمالك فقط." });
    }

    if (entryType === "CAPITAL") {
      if (!paymentMethod) {
        return respond(422, {
            message: "يجب تحديد البنك أو الخزينة",
          });
      }

      const debitAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      const entry = await createEntry({
        entryType: "CAPITAL",
        amount,
        debitAccount,
        creditAccount: "CAPITAL",
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      return respond(201, {
          message: "تم تسجيل رأس المال بنجاح",
          data: entry,
        });
    }

    /* =====================================================
       EXPENSE

       DR EXPENSE
       CR BANK / CASH
    ===================================================== */

    if (entryType === "EXPENSE") {
      const isSplit = ownerPaid !== undefined || paidNow !== undefined || remaining !== undefined;
      // طريقة الدفع مطلوبة فقط لو سيُدفع شيء من الخزنة/البنك الآن
      const paysNow = isSplit ? (paidNow ?? 0) > 0 : true;

      if ((!paymentMethod && paysNow) || !account) {
        return respond(422, {
            message: "يجب تحديد نوع المصروف وطريقة الدفع",
          });
      }

      // الرواتب تُصرف من صفحة "السلف والمستحقات" فقط (employee_payments)
      // حتى لا يُسجَّل القيد مرتين ويظهر في متبقي راتب الموظف
      if (account === "SALARIES") {
        return respond(422, {
          message: "الرواتب والسلف تُصرف من صفحة الموظفين > السلف والمستحقات وليس من القيد اليدوي.",
        });
      }

      // الكاشير: كهرباء/ماء/إنترنت، صيانة، أخرى (بدون إيجارات)
      const allowedExpenseAccounts: readonly string[] = canManage
        ? ["STAFF_DAILY_EXPENSES", "UTILITIES", "RENTS", "MAINTENANCE", "OTHER_EXPENSE"]
        : ["STAFF_DAILY_EXPENSES", "UTILITIES", "MAINTENANCE", "OTHER_EXPENSE"];

      if (!allowedExpenseAccounts.includes(account)) {
        return respond(422, {
            message: "حساب المصروف غير صالح",
          });
      }

      /* =================================================
         الدفع المجزأ (اختياري): دفعه المالك / المدفوع الآن / المتبقي كمستحق على المحل.
         ذرّي في record_expense_with_payable. بدون تجزئة يبقى المسار الحالي كما هو.
      ================================================= */

      if (isSplit) {
        wroteEntry = true;

        const { data: split, error: splitError } = await supabaseAdmin.rpc("record_expense_with_payable", {
          p_branch_id: MAIN_BRANCH_ID,
          p_created_by: user.userId,
          p_account: account,
          p_amount: amount,
          p_currency: currency,
          p_payment_method: paymentMethod ?? null,
          p_owner_paid: ownerPaid ?? 0,
          p_paid_now: paidNow ?? 0,
          p_remaining: remaining ?? 0,
          p_due_date: dueDate ?? null,
          p_description: description,
          p_reference: reference ?? null,
        });

        if (splitError) {
          if (isDefiniteDbRejection(splitError)) await idempotency.abandon();
          // الكاشير لا يرى أرصدة الخزينة/البنك
          throw Object.assign(new Error(splitError.message), {
            dbError: canManage ? splitError : maskBalanceError(splitError),
          });
        }

        const result = split as { id: string; entry_ids: string[]; payable_id: string | null };

        await notifyOwnerOfCashierAction({
          actor: user,
          kind: "EXPENSE",
          title: "مصروف جديد من الكاشير",
          details: `سجّل مصروفًا بقيمة ${money(amount, currency)} — دفعه المالك ${money(ownerPaid ?? 0, currency)}، مدفوع الآن ${money(paidNow ?? 0, currency)}${paymentMethod ? ` (${paymentMethod === "BANK" ? "من البنك" : "من الخزينة"})` : ""}، والمتبقي ${money(remaining ?? 0, currency)} — ${description}`,
          link: "/dashboard/accounting/journals",
          amount,
          currency,
          metadata: { journal_entry_id: result.id, expense_account: account, payable_id: result.payable_id },
        });

        return respond(201, {
          message: "تم تسجيل المصروف بنجاح",
          data: { id: result.id, entryIds: result.entry_ids, payableId: result.payable_id },
        });
      }

      const creditAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      /* =================================================
         CHECK BALANCE
      ================================================= */
      const currentBalance = await getAccountBalance(creditAccount, currency);

      if (amount > currentBalance) {
        // الكاشير لا يرى أرصدة الخزينة/البنك
        return respond(400, {
          message: canManage
            ? formatBalanceMessage(creditAccount, currency, currentBalance)
            : "الرصيد المتاح غير كافٍ لتسجيل هذا المصروف.",
        });
      }

      const entry = await createEntry({
        entryType: "EXPENSE",
        amount,
        debitAccount: account,
        creditAccount,
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      await notifyOwnerOfCashierAction({
        actor: user,
        kind: "EXPENSE",
        title: "مصروف جديد من الكاشير",
        details: `سجّل مصروفًا بقيمة ${money(amount, currency)} (${paymentMethod === "BANK" ? "من البنك" : "من الخزينة"}) — ${description}`,
        link: "/dashboard/accounting/journals",
        amount,
        currency,
        metadata: { journal_entry_id: entry.id, expense_account: account },
      });

      return respond(201, {
          message: "تم تسجيل المصروف بنجاح",
          data: entry,
        });
    }

    /* =====================================================
       OTHER INCOME

       DR BANK / CASH
       CR OTHER_INCOME
    ===================================================== */

    if (entryType === "OTHER") {
      if (!paymentMethod) {
        return respond(422, {
            message: "يجب تحديد طريقة استلام الإيراد",
          });
      }

      const debitAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      const entry = await createEntry({
        entryType: "OTHER",
        amount,
        debitAccount,
        creditAccount: "OTHER_INCOME",
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      return respond(201, {
          message: "تم تسجيل الإيراد بنجاح",
          data: entry,
        });
    }

    return respond(422, {
        message: "نوع القيد غير مدعوم",
      });
  } catch (error: unknown) {
    if (!wroteEntry && releaseKey) await releaseKey();

    const dbError = (error as { dbError?: unknown })?.dbError;
    return dbErrorResponse(dbError ?? error, "Manual journal entry", "تعذر إنشاء القيد");
  }
}

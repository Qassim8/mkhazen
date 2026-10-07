import { NextResponse } from "next/server";

import { createManualJournalEntrySchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import {
  createJournalEntry,
  formatBalanceMessage,
  getAccountBalance,
} from "../_lib/accounting";

export async function POST(request: Request) {
  try {
    const user = await getSession();

    if (!user || !can(user.role, "accounting.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
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
    } = validation.data;

    /* =====================================================
       CAPITAL

       DR BANK / CASH
       CR CAPITAL
    ===================================================== */

    if (entryType === "CAPITAL" && !can(user.role, "accounting.capital")) {
      return NextResponse.json(
        { message: "قيود رأس المال متاحة للمالك فقط." },
        { status: 403 },
      );
    }

    if (entryType === "CAPITAL") {
      if (!paymentMethod) {
        return NextResponse.json(
          {
            message: "يجب تحديد البنك أو الخزينة",
          },
          { status: 422 },
        );
      }

      const debitAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      const entry = await createJournalEntry({
        entryType: "CAPITAL",
        amount,
        debitAccount,
        creditAccount: "CAPITAL",
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      return NextResponse.json(
        {
          message: "تم تسجيل رأس المال بنجاح",
          data: entry,
        },
        { status: 201 },
      );
    }

    /* =====================================================
       EXPENSE

       DR EXPENSE
       CR BANK / CASH
    ===================================================== */

    if (entryType === "EXPENSE") {
      if (!paymentMethod || !account) {
        return NextResponse.json(
          {
            message: "يجب تحديد نوع المصروف وطريقة الدفع",
          },
          { status: 422 },
        );
      }

      const allowedExpenseAccounts = [
        "UTILITIES",
        "RENTS",
        "SALARIES",
        "MAINTENANCE",
        "OTHER_EXPENSE",
      ] as const;

      if (
        !allowedExpenseAccounts.includes(
          account as (typeof allowedExpenseAccounts)[number],
        )
      ) {
        return NextResponse.json(
          {
            message: "حساب المصروف غير صالح",
          },
          { status: 422 },
        );
      }

      const creditAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      /* =================================================
         CHECK BALANCE
      ================================================= */

      const currentBalance = await getAccountBalance(creditAccount, currency);

      if (amount > currentBalance) {
        return NextResponse.json(
          { message: formatBalanceMessage(creditAccount, currency, currentBalance) },
          { status: 400 },
        );
      }

      const entry = await createJournalEntry({
        entryType: "EXPENSE",
        amount,
        debitAccount: account,
        creditAccount,
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      return NextResponse.json(
        {
          message: "تم تسجيل المصروف بنجاح",
          data: entry,
        },
        { status: 201 },
      );
    }

    /* =====================================================
       OTHER INCOME

       DR BANK / CASH
       CR OTHER_INCOME
    ===================================================== */

    if (entryType === "OTHER") {
      if (!paymentMethod) {
        return NextResponse.json(
          {
            message: "يجب تحديد طريقة استلام الإيراد",
          },
          { status: 422 },
        );
      }

      const debitAccount = paymentMethod === "BANK" ? "BANK" : "CASH";

      const entry = await createJournalEntry({
        entryType: "OTHER",
        amount,
        debitAccount,
        creditAccount: "OTHER_INCOME",
        description,
        reference,
        createdBy: user.userId ?? null,
        currency,
      });

      return NextResponse.json(
        {
          message: "تم تسجيل الإيراد بنجاح",
          data: entry,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        message: "نوع القيد غير مدعوم",
      },
      { status: 422 },
    );
  } catch (error: unknown) {
    console.error("Manual journal entry:", error);

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "تعذر إنشاء القيد",
      },
      { status: 500 },
    );
  }
}

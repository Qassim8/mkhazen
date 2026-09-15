import { NextResponse } from "next/server";

import { createManualJournalEntrySchema } from "@/app/dashboard/accounting/schemas/accounting.schema";

import { getSession } from "@/lib/auth";

import { createJournalEntry, getAccountBalance } from "../_lib/accounting";

export async function POST(request: Request) {
  try {
    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط",
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
    } = validation.data;

    /* =====================================================
       CAPITAL

       DR BANK / CASH
       CR CAPITAL
    ===================================================== */

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
        "ELECTRICITY",
        "WATER",
        "INTERNET",
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

      const currentBalance = await getAccountBalance(creditAccount);

      if (amount > currentBalance) {
        const accountLabel = creditAccount === "BANK" ? "البنك" : "الخزينة";

        return NextResponse.json(
          {
            message: `الرصيد غير كافٍ في ${accountLabel}. الرصيد الحالي ${currentBalance.toFixed(
              2,
            )} ريال`,
          },
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

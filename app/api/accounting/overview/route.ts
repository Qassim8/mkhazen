import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";

const EXPENSE_ACCOUNTS = [
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "SALARIES",
  "MAINTENANCE",
  "OTHER_EXPENSE",
] as const;

const EXPENSE_LABELS: Record<(typeof EXPENSE_ACCOUNTS)[number], string> = {
  ELECTRICITY: "الكهرباء",
  WATER: "الماء",
  INTERNET: "الإنترنت",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  OTHER_EXPENSE: "مصروفات أخرى",
};

const MONTH_LABELS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function getAccountBalance(
  entries: {
    amount: number;
    debit_account: string;
    credit_account: string;
  }[],
  account: string,
) {
  return entries.reduce((balance, entry) => {
    const amount = Number(entry.amount ?? 0);

    if (entry.debit_account === account) {
      return balance + amount;
    }

    if (entry.credit_account === account) {
      return balance - amount;
    }

    return balance;
  }, 0);
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);

    const requestedYear = Number(searchParams.get("year"));

    const year =
      Number.isInteger(requestedYear) &&
      requestedYear >= 2000 &&
      requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();

    const startDate = `${year}-01-01T00:00:00.000Z`;
    const nextYearDate = `${year + 1}-01-01T00:00:00.000Z`;

    /* =====================================================
       ALL ENTRIES UP TO THE END OF SELECTED YEAR

       Used for continuing balances:
       BANK / CASH / SUPPLIERS / ASSETS / INVENTORY
    ===================================================== */

    const { data: balanceEntries, error: balanceError } = await supabaseAdmin
      .from("journal_entries")
      .select("amount, debit_account, credit_account, created_at")
      .eq("branch_id", MAIN_BRANCH_ID)
      .lt("created_at", nextYearDate);

    if (balanceError) {
      console.error("Accounting overview balance:", balanceError);

      return NextResponse.json(
        {
          message: "تعذر تحميل أرصدة المحاسبة",
        },
        { status: 500 },
      );
    }

    /* =====================================================
       SELECTED YEAR ENTRIES

       Used for:
       Revenue / Expenses / Monthly charts
    ===================================================== */

    const { data: yearEntries, error: yearError } = await supabaseAdmin
      .from("journal_entries")
      .select("amount, debit_account, credit_account, entry_type, created_at")
      .eq("branch_id", MAIN_BRANCH_ID)
      .gte("created_at", startDate)
      .lt("created_at", nextYearDate)
      .order("created_at", {
        ascending: true,
      });

    if (yearError) {
      console.error("Accounting overview year:", yearError);

      return NextResponse.json(
        {
          message: "تعذر تحميل بيانات الفترة المحاسبية",
        },
        { status: 500 },
      );
    }

    const allEntries = balanceEntries ?? [];
    const entries = yearEntries ?? [];

    /* =====================================================
       MONTHLY DATA
    ===================================================== */

    const monthly = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: MONTH_LABELS[index],
      revenue: 0,
      expenses: 0,
    }));

    const expenseBreakdown = EXPENSE_ACCOUNTS.map((account) => ({
      account,
      label: EXPENSE_LABELS[account],
      value: 0,
    }));

    let revenue = 0;
    let expenses = 0;

    for (const entry of entries) {
      const amount = Number(entry.amount ?? 0);

      const date = new Date(entry.created_at);

      const monthIndex = date.getUTCMonth();

      /* =========================
         REVENUE
      ========================= */

      if (
        entry.credit_account === "SALES" ||
        entry.credit_account === "OTHER_INCOME"
      ) {
        revenue += amount;
        monthly[monthIndex].revenue += amount;
      }

      /* =========================
         EXPENSES
      ========================= */

      const expense = expenseBreakdown.find(
        (item) => item.account === entry.debit_account,
      );

      if (expense) {
        expense.value += amount;
        expenses += amount;
        monthly[monthIndex].expenses += amount;
      }
    }

    /* =====================================================
       END-OF-YEAR BALANCES
    ===================================================== */

    const bank = getAccountBalance(allEntries, "BANK");

    const cash = getAccountBalance(allEntries, "CASH");

    const supplierDebts = Math.max(
      0,
      getAccountBalance(allEntries, "SUPPLIERS") * -1,
    );

    const assets = Math.max(0, getAccountBalance(allEntries, "ASSETS"));

    const inventory = Math.max(0, getAccountBalance(allEntries, "INVENTORY"));

    return NextResponse.json({
      data: {
        year,

        cards: {
          revenue: Number(revenue.toFixed(2)),
          expenses: Number(expenses.toFixed(2)),
          netProfit: Number((revenue - expenses).toFixed(2)),

          supplierDebts: Number(supplierDebts.toFixed(2)),

          bank: Number(bank.toFixed(2)),
          cash: Number(cash.toFixed(2)),

          assets: Number(assets.toFixed(2)),
          inventory: Number(inventory.toFixed(2)),
        },

        monthly,

        expenseBreakdown: expenseBreakdown
          .filter((item) => item.value > 0)
          .map((item) => ({
            ...item,
            value: Number(item.value.toFixed(2)),
          })),
      },
    });
  } catch (error: unknown) {
    console.error("Accounting overview:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

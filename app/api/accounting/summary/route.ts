import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";

const sumAccountBalance = (
  entries: Array<{
    amount: number;
    debit_account: string;
    credit_account: string;
  }>,
  account: string,
) => {
  return entries.reduce((sum, entry) => {
    const amount = Number(entry.amount) || 0;

    if (entry.debit_account === account) {
      return sum + amount;
    }

    if (entry.credit_account === account) {
      return sum - amount;
    }

    return sum;
  }, 0);
};

const sumCreditBalance = (
  entries: Array<{
    amount: number;
    debit_account: string;
    credit_account: string;
  }>,
  account: string,
) => {
  return entries.reduce((sum, entry) => {
    if (entry.credit_account === account) {
      return sum + Number(entry.amount);
    }

    if (entry.debit_account === account) {
      return sum - Number(entry.amount);
    }

    return sum;
  }, 0);
};

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

    const currentYear = new Date().getFullYear();

    const year =
      requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : currentYear;

    /* =====================================================
       ALL ENTRIES
       Used for current balances
    ===================================================== */

    const { data: allEntries, error: allEntriesError } = await supabaseAdmin
      .from("journal_entries")
      .select(
        `
          amount,
          debit_account,
          credit_account
        `,
      )
      .eq("branch_id", MAIN_BRANCH_ID);

    if (allEntriesError) {
      throw new Error(allEntriesError.message);
    }

    /* =====================================================
       YEAR ENTRIES
       Used for revenue / expenses / profit
    ===================================================== */

    const { data: yearEntries, error: yearEntriesError } = await supabaseAdmin
      .from("journal_entries")
      .select(
        `
          amount,
          debit_account,
          credit_account
        `,
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .gte("created_at", `${year}-01-01T00:00:00.000Z`)
      .lt("created_at", `${year + 1}-01-01T00:00:00.000Z`);

    if (yearEntriesError) {
      throw new Error(yearEntriesError.message);
    }

    const entries = (allEntries ?? []) as Array<{
      amount: number;
      debit_account: string;
      credit_account: string;
    }>;

    const currentYearEntries = (yearEntries ?? []) as Array<{
      amount: number;
      debit_account: string;
      credit_account: string;
    }>;

    const bank = sumAccountBalance(entries, "BANK");

    const cash = sumAccountBalance(entries, "CASH");

    const suppliers = sumCreditBalance(entries, "SUPPLIERS");

    const capital = sumCreditBalance(entries, "CAPITAL");

    const sales = sumCreditBalance(currentYearEntries, "SALES");

    const otherIncome = sumCreditBalance(currentYearEntries, "OTHER_INCOME");

    const electricity = sumAccountBalance(currentYearEntries, "ELECTRICITY");

    const water = sumAccountBalance(currentYearEntries, "WATER");

    const internet = sumAccountBalance(currentYearEntries, "INTERNET");

    const salaries = sumAccountBalance(currentYearEntries, "SALARIES");

    const maintenance = sumAccountBalance(currentYearEntries, "MAINTENANCE");

    const otherExpense = sumAccountBalance(currentYearEntries, "OTHER_EXPENSE");

    const totalRevenue = sales + otherIncome;

    const totalExpenses =
      electricity + water + internet + salaries + maintenance + otherExpense;

    const profit = totalRevenue - totalExpenses;

    const assets = sumAccountBalance(entries, "ASSETS");

    const inventory = sumAccountBalance(entries, "INVENTORY");

    return NextResponse.json({
      year,

      data: {
        cash: Math.max(0, Number(cash.toFixed(2))),

        bank: Math.max(0, Number(bank.toFixed(2))),

        totalCash: Number((cash + bank).toFixed(2)),

        suppliersDebt: Math.max(0, Number(suppliers.toFixed(2))),

        capital: Number(capital.toFixed(2)),

        assets: Number(assets.toFixed(2)),

        inventory: Number(inventory.toFixed(2)),

        revenue: Number(totalRevenue.toFixed(2)),

        expenses: Number(totalExpenses.toFixed(2)),

        profit: Number(profit.toFixed(2)),
      },
    });
  } catch (error: unknown) {
    console.error("Accounting summary:", error);

    return NextResponse.json(
      {
        message: "حدث خطأ أثناء حساب الإحصائيات",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { fetchAllResult } from "@/lib/supabase-fetch-all";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import {
  computeBalances,
  computePerformance,
  currentSudanYear,
  sudanYearRange,
  LEDGER_SELECT,
  LedgerEntry,
} from "../_lib/ledger";

export async function GET(request: Request) {
  try {
    const user = await getSession();

    if (!user || !can(user.role, "accounting.view")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedYear = Number(searchParams.get("year"));
    const currentYear = currentSudanYear();
    const year = requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear;

    const yearRange = sudanYearRange(year);

    const [allResult, yearResult, rateResult] = await Promise.all([
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(LEDGER_SELECT)
          .eq("branch_id", MAIN_BRANCH_ID)
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(LEDGER_SELECT)
          .eq("branch_id", MAIN_BRANCH_ID)
          .gte("created_at", yearRange.start)
          .lt("created_at", yearRange.end)
          .order("id")
          .range(from, to),
      ),
      supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
    ]);

    if (allResult.error) throw new Error(allResult.error.message);
    if (yearResult.error) throw new Error(yearResult.error.message);

    const currentRate = rateResult.data != null ? Number(rateResult.data) : null;
    const balances = computeBalances((allResult.data ?? []) as LedgerEntry[], currentRate);
    const performance = computePerformance((yearResult.data ?? []) as LedgerEntry[]);

    return NextResponse.json({
      year,
      data: {
        currency: "USD",
        exchangeRate: currentRate,
        cashUsd: balances.cashUsd,
        cashSdg: balances.cashSdg,
        bankUsd: balances.bankUsd,
        bankSdg: balances.bankSdg,
        totalLiquidityUsd: balances.totalLiquidityUsd,
        suppliersDebt: balances.supplierDebts,
        capital: balances.capital,
        assets: balances.assets,
        inventory: balances.inventory,
        revenue: performance.revenue,
        expenses: performance.expenses,
        profit: performance.netProfit,
      },
    });
  } catch (error: unknown) {
    console.error("Accounting summary:", error);
    return NextResponse.json(
      { message: "حدث خطأ أثناء حساب الإحصائيات" },
      { status: 500 },
    );
  }
}

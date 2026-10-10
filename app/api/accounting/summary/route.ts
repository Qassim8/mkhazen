import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import {
  computeBalances,
  computePerformance,
  currentSudanYear,
  sudanYearRange,
} from "../_lib/ledger";
import { entriesBetween, loadLedgerEntries } from "../_lib/ledger-source";

export async function GET(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "accounting.view")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedYear = Number(searchParams.get("year"));
    const currentYear = currentSudanYear();
    const year = requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear;

    const yearRange = sudanYearRange(year);

    const [ledger, rateResult] = await Promise.all([
      loadLedgerEntries({ branchId: MAIN_BRANCH_ID }),
      supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
    ]);

    const currentRate = rateResult.data != null ? Number(rateResult.data) : null;
    const balances = computeBalances(ledger.entries, currentRate);
    const performance = computePerformance(entriesBetween(ledger.entries, yearRange.start, yearRange.end));

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

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
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : currentSudanYear();

    const { start: startDate, end: nextYearDate } = sudanYearRange(year);

    const [balanceResult, yearResult, rateResult] = await Promise.all([
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(LEDGER_SELECT)
          .eq("branch_id", MAIN_BRANCH_ID)
          .lt("created_at", nextYearDate)
          .order("id")
          .range(from, to),
      ),
      fetchAllResult((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select(LEDGER_SELECT)
          .eq("branch_id", MAIN_BRANCH_ID)
          .gte("created_at", startDate)
          .lt("created_at", nextYearDate)
          .order("id")
          .range(from, to),
      ),
      supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
    ]);

    if (balanceResult.error || yearResult.error) {
      console.error("Accounting overview:", balanceResult.error ?? yearResult.error);
      return NextResponse.json(
        { message: "تعذر تحميل بيانات المحاسبة" },
        { status: 500 },
      );
    }

    const currentRate = rateResult.data != null ? Number(rateResult.data) : null;

    const balances = computeBalances(
      (balanceResult.data ?? []) as LedgerEntry[],
      currentRate,
    );
    const performance = computePerformance((yearResult.data ?? []) as LedgerEntry[]);

    return NextResponse.json({
      data: {
        year,
        currency: "USD",
        exchangeRate: currentRate,
        cards: {
          revenue: performance.revenue,
          cogs: performance.cogs,
          grossProfit: performance.grossProfit,
          expenses: performance.expenses,
          realizedFx: performance.realizedFx,
          netProfit: performance.netProfit,
          ...balances,
        },
        monthly: performance.monthly,
        expenseBreakdown: performance.expenseBreakdown,
      },
    });
  } catch (error: unknown) {
    console.error("Accounting overview:", error);
    return NextResponse.json({ message: "خطأ في السيرفر" }, { status: 500 });
  }
}

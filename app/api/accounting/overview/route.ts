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
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : currentSudanYear();

    const { start: startDate, end: nextYearDate } = sudanYearRange(year);

    // مصدر واحد (مجاميع من قاعدة البيانات) للأرصدة حتى نهاية السنة وأداء السنة نفسها
    const [ledger, rateResult] = await Promise.all([
      loadLedgerEntries({ branchId: MAIN_BRANCH_ID, before: nextYearDate }),
      supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
    ]);

    const currentRate = rateResult.data != null ? Number(rateResult.data) : null;

    const balances = computeBalances(ledger.entries, currentRate);
    const performance = computePerformance(entriesBetween(ledger.entries, startDate, nextYearDate));

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

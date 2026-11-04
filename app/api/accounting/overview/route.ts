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
import { getFiscalYears } from "../_lib/fiscal-years";
import { loadReceivablesSnapshot } from "@/lib/credit-server";
import { loadPayrollTotals } from "@/lib/reports/payroll-totals";
import { STAFF_DAILY_EXPENSES_ACCOUNT, buildStaffCost } from "@/lib/staff-cost";

type PayablesBucketRaw = {
  count?: number;
  overdue_count?: number;
  remaining_sdg?: number | string;
  remaining_usd?: number | string;
  book_usd?: number | string;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function payablesBucket(raw: PayablesBucketRaw | undefined) {
  return {
    count: Number(raw?.count ?? 0),
    overdueCount: Number(raw?.overdue_count ?? 0),
    remainingSdg: round2(Number(raw?.remaining_sdg ?? 0)),
    remainingUsdNative: round2(Number(raw?.remaining_usd ?? 0)),
    /** رصيدها الدفتري بالدولار (ما يحمله حساب OTHER_PAYABLES) */
    bookUsd: round2(Number(raw?.book_usd ?? 0)),
  };
}

function buildPayables(raw: unknown, supplierDebts: number) {
  const summary = (raw ?? {}) as { assets?: PayablesBucketRaw; expenses?: PayablesBucketRaw };
  const assets = payablesBucket(summary.assets);
  const expenses = payablesBucket(summary.expenses);

  return {
    assets,
    expenses,
    supplierDebts: round2(supplierDebts),
    totalUsd: round2(assets.bookUsd + expenses.bookUsd + supplierDebts),
  };
}

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
    const [ledger, rateResult, years, receivables, payablesResult, advancesResult, payroll] = await Promise.all([
      loadLedgerEntries({ branchId: MAIN_BRANCH_ID, before: nextYearDate }),
      supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: MAIN_BRANCH_ID }),
      getFiscalYears(),
      // ديون العملاء (فواتير آجلة مفتوحة) — لقطة حالية
      loadReceivablesSnapshot(),
      // المستحقات على المحل (متبقي الأصول والمصروفات) — لقطة حالية
      supabaseAdmin.rpc("get_payables_summary"),
      // سلف الموظفين (أصل): رصيد المستحق على الموظفين — لقطة حالية
      supabaseAdmin.rpc("get_employee_advances_summary", { p_branch_id: MAIN_BRANCH_ID }),
      // الرواتب والعمولات المصروفة في السنة (كل واحد منفصل) لمجموعة تكلفة الموظفين؛ عرض فقط
      loadPayrollTotals(startDate, nextYearDate).catch((error) => {
        console.error("overview payroll totals:", error);
        return null;
      }),
    ]);

    if (payablesResult.error) {
      throw new Error(`تعذر جلب المستحقات: ${payablesResult.error.message}`);
    }
    if (advancesResult.error) {
      throw new Error(`تعذر جلب سلف الموظفين: ${advancesResult.error.message}`);
    }
    const advances = (advancesResult.data ?? {}) as Record<string, unknown>;

    const currentRate = rateResult.data != null ? Number(rateResult.data) : null;

    const balances = computeBalances(ledger.entries, currentRate);
    const performance = computePerformance(entriesBetween(ledger.entries, startDate, nextYearDate));

    return NextResponse.json({
      data: {
        year,
        // السنوات اللي فيها قيود فعلًا حتى السنة الحالية
        years,
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
        // تكلفة الموظفين: الرواتب والعمولات والمصروفات اليومية كل بند منفصل ثم الإجمالي (عرض فقط)
        staffCost: payroll
          ? buildStaffCost({
              salariesUsd: payroll.salariesUsd,
              commissionsUsd: payroll.commissionsUsd,
              dailyExpensesUsd:
                performance.expenseBreakdown.find((item) => item.account === STAFF_DAILY_EXPENSES_ACCOUNT)?.value ?? 0,
            })
          : null,
        // المستحقات على المحل: الأصول والمصروفات (من جدول المستحقات) وديون الموردين (من المشتريات)
        payables: buildPayables(payablesResult.data, balances.supplierDebts),
        employeeAdvances: {
          totalBalanceSdg: round2(Number(advances.total_balance_sdg ?? 0)),
          employeesCount: Number(advances.employees_count ?? 0),
          /** رصيد حساب EMPLOYEE_ADVANCES الدفتري بالدولار */
          bookUsd: round2(Number(advances.book_usd ?? 0)),
        },
        receivables: {
          posCredit: receivables.posCredit,
          tailoringInProgress: receivables.tailoringInProgress,
          total: receivables.total,
          openCount: receivables.openCount,
          overdueCount: receivables.overdueCount,
          totalRemainingSdg: receivables.totalRemainingSdg,
          totalUsdAtSale: receivables.totalUsdAtSale,
          totalUsdNow: receivables.totalUsdNow,
          totalLossUsd: receivables.totalLossUsd,
        },
      },
    });
  } catch (error: unknown) {
    console.error("Accounting overview:", error);
    return NextResponse.json({ message: "خطأ في السيرفر" }, { status: 500 });
  }
}

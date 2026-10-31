import "server-only";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll, fetchIn } from "@/lib/supabase-fetch-all";

/**
 * إجمالي الرواتب والعمولات المصروفة للموظفين في فترة التقرير، كل واحد منفصل.
 * • المبلغ بالجنيه = المبلغ الكامل للدفعة (الراتب كاملًا حتى لو خُصم جزء منه من رصيد السلف).
 * • بالدولار = مجموع قيودها (بسعر صرف يوم الصرف).
 * • السلف واستردادها ليست مصروفًا ولا تدخل هنا (EMPLOYEE_ADVANCES).
 */
export interface PayrollTotals {
  salariesCount: number;
  salariesSdg: number;
  salariesUsd: number;
  commissionsCount: number;
  commissionsSdg: number;
  commissionsUsd: number;
}

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadPayrollTotals(startIso: string, endIso: string): Promise<PayrollTotals> {
  const payments = await fetchAll<{
    id: string;
    type: string;
    amount: number | string;
    journal_entry_id: string | null;
    deduction_entry_id: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("employee_payments")
      .select("id, type, amount, journal_entry_id, deduction_entry_id")
      .eq("branch_id", MAIN_BRANCH_ID)
      .in("type", ["SALARY", "COMMISSION"])
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("id")
      .range(from, to),
  );

  const entryIds = payments.flatMap((payment) =>
    [payment.journal_entry_id, payment.deduction_entry_id].filter((id): id is string => Boolean(id)),
  );

  const entries = await fetchIn<{ id: string; amount_usd: number | string }>(entryIds, (chunk, from, to) =>
    supabaseAdmin.from("journal_entries").select("id, amount_usd").in("id", chunk).order("id").range(from, to),
  );
  const usdOf = new Map(entries.map((entry) => [entry.id, num(entry.amount_usd)]));

  const totals: PayrollTotals = {
    salariesCount: 0,
    salariesSdg: 0,
    salariesUsd: 0,
    commissionsCount: 0,
    commissionsSdg: 0,
    commissionsUsd: 0,
  };

  for (const payment of payments) {
    // قيد الراتب بالصافي وقيد الخصم من السلف (لو الصافي صفر فالقيدان هما نفسه فلا يُعدّ مرتين)
    const ids = new Set([payment.journal_entry_id, payment.deduction_entry_id].filter((id): id is string => Boolean(id)));
    const usd = [...ids].reduce((sum, id) => sum + (usdOf.get(id) ?? 0), 0);

    if (payment.type === "COMMISSION") {
      totals.commissionsCount += 1;
      totals.commissionsSdg += num(payment.amount);
      totals.commissionsUsd += usd;
    } else {
      totals.salariesCount += 1;
      totals.salariesSdg += num(payment.amount);
      totals.salariesUsd += usd;
    }
  }

  return {
    salariesCount: totals.salariesCount,
    salariesSdg: r2(totals.salariesSdg),
    salariesUsd: r2(totals.salariesUsd),
    commissionsCount: totals.commissionsCount,
    commissionsSdg: r2(totals.commissionsSdg),
    commissionsUsd: r2(totals.commissionsUsd),
  };
}

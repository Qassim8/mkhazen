/**
 * مصدر بيانات دفتر القيود لصفحات المحاسبة.
 *
 * • الطريقة السريعة: ledger_period_totals (مجاميع من قاعدة البيانات، صفوف قليلة).
 * • لو الدالة مش موجودة (الـ migration لسه ما اتطبقتش): الطريقة القديمة
 *   (تنزيل كل القيود على دفعات) — نفس النتيجة بالظبط لكن أبطأ.
 *
 * المجاميع بتتحول لـ "قيود مجمّعة" بنفس شكل LedgerEntry وتاريخها منتصف الشهر،
 * فدوال computeBalances / computePerformance بتشتغل عليها من غير أي تغيير.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll } from "@/lib/supabase-fetch-all";

import { LEDGER_SELECT, type LedgerEntry } from "./ledger";
import { totalsToEntries, type TotalsRow } from "./ledger-aggregate";

export { entriesBetween } from "./ledger-aggregate";

let warnedMissing = false;

/** كل القيود (أو مجاميعها) قبل تاريخ معين (أو كل الوقت) */
export async function loadLedgerEntries(params: {
  branchId: string;
  before?: string | null;
}): Promise<{ entries: LedgerEntry[]; source: "aggregate" | "raw" }> {
  const { data, error } = await supabaseAdmin.rpc("ledger_period_totals", {
    p_branch_id: params.branchId,
    p_from: null,
    p_to: params.before ?? null,
  });

  if (!error) {
    return { entries: totalsToEntries((data ?? []) as TotalsRow[]), source: "aggregate" };
  }

  if (error.code !== "PGRST202" && error.code !== "42883") {
    throw new Error(error.message);
  }

  if (!warnedMissing) {
    warnedMissing = true;
    console.warn("[accounting] ledger_period_totals missing — apply migration 20261009_02 (falling back to full scan).");
  }

  const entries = await fetchAll<LedgerEntry>((from, to) => {
    let query = supabaseAdmin
      .from("journal_entries")
      .select(LEDGER_SELECT)
      .eq("branch_id", params.branchId);
    if (params.before) query = query.lt("created_at", params.before);
    return query.order("id").range(from, to);
  });

  return { entries, source: "raw" };
}

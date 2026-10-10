/**
 * تحويل مجاميع ledger_period_totals لقيود مجمّعة + فلترة الفترات (دوال نقية).
 */
import type { LedgerEntry } from "./ledger";

export type TotalsRow = {
  debit_account: string;
  credit_account: string;
  currency: "USD" | "SDG" | null;
  entry_type: string | null;
  month_key: string;
  amount: number | string;
  amount_usd: number | string;
};

export function totalsToEntries(rows: TotalsRow[]): LedgerEntry[] {
  return rows.map((row) => ({
    amount: Number(row.amount ?? 0),
    amount_usd: Number(row.amount_usd ?? 0),
    currency: row.currency as LedgerEntry["currency"],
    debit_account: row.debit_account,
    credit_account: row.credit_account,
    entry_type: row.entry_type ?? undefined,
    // منتصف الشهر (UTC) → نفس الشهر بتوقيت السودان في computePerformance
    created_at: `${row.month_key}-15T00:00:00.000Z`,
  }));
}

/** القيود داخل فترة [start, end) — تشتغل على القيود الخام والمجمّعة */
export function entriesBetween(entries: LedgerEntry[], start: string, end: string) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return entries.filter((entry) => {
    const at = entry.created_at ? Date.parse(entry.created_at) : NaN;
    return at >= startMs && at < endMs;
  });
}

/**
 * ledger_period_totals (20261010_03) on the REAL live schema, called as
 * service_role after the hardening sequence: balances and profit computed from
 * the grouped totals equal the ones computed from the raw journal entries.
 * Entries go through the live journal_entries_currency_snapshot trigger.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { computeBalances, computePerformance, sudanYearRange, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import { entriesBetween, totalsToEntries, type TotalsRow } from "@/app/api/accounting/_lib/ledger-aggregate";
import { BRANCH_ID, OTHER_BRANCH_ID, RELEASE_SEQUENCE, asRole, createLiveDb, releaseTemplate, seedBase } from "./db-harness";

after(releaseTemplate);

// قيود متنوعة: بيع/تكلفة/مصروفات/تحويل عملة/رأس مال، بعملتين، وعلى حدود الشهور والسنين
const ENTRY_SPECS: { type: string; debit: string; credit: string; currency: "USD" | "SDG" }[] = [
  { type: "CAPITAL", debit: "CASH", credit: "CAPITAL", currency: "USD" },
  { type: "CAPITAL", debit: "BANK", credit: "CAPITAL", currency: "SDG" },
  { type: "SALE", debit: "CASH", credit: "SALES", currency: "SDG" },
  { type: "SALE", debit: "BANK", credit: "SALES", currency: "SDG" },
  { type: "COGS", debit: "COGS", credit: "INVENTORY", currency: "USD" },
  { type: "PURCHASE", debit: "INVENTORY", credit: "SUPPLIERS", currency: "USD" },
  { type: "PURCHASE_PAYMENT", debit: "SUPPLIERS", credit: "CASH", currency: "USD" },
  { type: "EXPENSE", debit: "OTHER_EXPENSE", credit: "CASH", currency: "SDG" },
  { type: "OTHER", debit: "CASH", credit: "SALES", currency: "USD" },
  { type: "CAPITAL", debit: "CASH", credit: "BANK", currency: "SDG" },
];

describe("ledger_period_totals", () => {
  it("المجاميع المجمّعة بتدي نفس الأرصدة والأرباح الشهرية بالظبط (بما فيها حدود الشهر بتوقيت السودان)", async () => {
    const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    await seedBase(db);

    // قيود عشوائية ثابتة (seed) على 2025-2026 + قيود قريبة من منتصف الليل UTC وحدود السنة
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const fixedTimes = [
      "2025-12-31T21:59:59.000Z", // 23:59 بتوقيت السودان — لسه 2025
      "2025-12-31T22:00:00.000Z", // 00:00 بتوقيت السودان — 2026
      "2026-03-31T22:30:00.000Z", // أبريل بتوقيت السودان
      "2026-02-28T21:00:00.000Z",
    ];

    for (let i = 0; i < 400; i++) {
      const spec = ENTRY_SPECS[Math.floor(rand() * ENTRY_SPECS.length)];
      const createdAt =
        i < fixedTimes.length
          ? fixedTimes[i]
          : new Date(Date.UTC(2025, 0, 1) + Math.floor(rand() * 730 * 86400_000)).toISOString();
      const amount = Math.round((1 + rand() * 5000) * 100) / 100;
      await db.query(
        `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency, exchange_rate_used, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          `JE-${randomUUID().slice(0, 30)}`,
          BRANCH_ID,
          spec.type,
          amount,
          spec.debit,
          spec.credit,
          spec.currency,
          spec.currency === "USD" ? null : Math.round(2000 + rand() * 1000),
          createdAt,
        ],
      );
    }
    // قيد لفرع تاني ما يدخلش في الحساب
    await db.query(
      `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
       VALUES ('JE-OTHER', $1, 'CAPITAL', 999999, 'CASH', 'CAPITAL', 'USD')`,
      [OTHER_BRANCH_ID],
    );

    const raw = (
      await db.query<LedgerEntry>(
        `SELECT amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at::text AS created_at
         FROM public.journal_entries WHERE branch_id = $1`,
        [BRANCH_ID],
      )
    ).rows.map((row) => ({ ...row, created_at: new Date(row.created_at as string).toISOString() }));

    for (const year of [2025, 2026]) {
      const { start, end } = sudanYearRange(year);

      const totals = await asRole(db, "service_role", () =>
        db.query<TotalsRow>(`SELECT * FROM public.ledger_period_totals($1, NULL, $2)`, [BRANCH_ID, end]),
      );
      const aggregated = totalsToEntries(totals.rows);
      assert.ok(aggregated.length < raw.length, "aggregate returns fewer rows than raw entries");

      const rawUntil = raw.filter((entry) => Date.parse(entry.created_at!) < Date.parse(end));

      assert.deepEqual(computeBalances(aggregated, 2500), computeBalances(rawUntil, 2500), `balances ${year}`);
      assert.deepEqual(
        computePerformance(entriesBetween(aggregated, start, end)),
        computePerformance(entriesBetween(rawUntil, start, end)),
        `performance ${year}`,
      );
    }

    await db.close();
  });
});

/**
 * 20261013_01 — manual tailoring deposit + tailor dues / advances
 * (pay_tailor_dues spreads one payment over the tailor's orders, oldest first,
 * so settle_tailor_fx keeps closing the FX difference per order).
 * Live schema export, PGlite. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import { computeBalances, computePerformance, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import { BRANCH_ID, RELEASE_SEQUENCE, M, asRole, createLiveDb, fundAccount, num, releaseTemplate, rpcError, runVerify, seedBase, sql, type Users } from "./db-harness";

const MIGRATION = M.tailorDues;
const MEASUREMENTS = JSON.stringify([{ label: "الطول", value: 150, unit: "CM" }]);

after(releaseTemplate);

describe("manual deposit + tailor dues (20261013_01)", () => {
  let db: PGliteInterface;
  let users: Users;
  const orders: string[] = [];

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const createOrder = (total: number, deposit: number | null, cost: number, source: string | null = null) =>
    svc<{ r: Record<string, unknown> }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', 'عميل', '0912345678', $4::jsonb, current_date, current_date + 7,
              NULL, NULL, $5, $6, $7, $8, $9, 'جلابية', NULL, NULL) AS r`,
      [BRANCH_ID, users.owner, users.tailor, MEASUREMENTS, total, deposit, cost, source ? null : "CASH", source],
    );

  async function deliver(orderId: string) {
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'UNDER_TAILORING')`, [orderId, BRANCH_ID, users.owner]);
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'READY_FOR_PICKUP')`, [orderId, BRANCH_ID, users.owner]);
    await svc(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH')`, [orderId, BRANCH_ID, users.owner]);
  }

  const dues = async () =>
    (await svc<Record<string, string>>(`SELECT * FROM public.get_tailor_dues($1, $2)`, [BRANCH_ID, users.tailor])).rows[0];

  const pay = (kind: "SETTLEMENT" | "ADVANCE", amount: number | null, userId = users.owner) =>
    svc<{ r: Record<string, unknown> }>(
      `SELECT public.pay_tailor_dues($1, $2, $3, $4, $5, 'CASH', 'ملاحظة') AS r`,
      [BRANCH_ID, userId, users.tailor, kind, amount],
    );

  async function ledger() {
    const entries = (
      await db.query<LedgerEntry>(
        `SELECT amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at::text AS created_at
         FROM public.journal_entries WHERE branch_id = $1`,
        [BRANCH_ID],
      )
    ).rows;
    return { b: computeBalances(entries, 2500), p: computePerformance(entries) };
  }

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await fundAccount(db, "CASH", 1_000_000, "SDG");
  });
  after(() => db.close());

  it("is re-runnable and keeps the verify checks green", async () => {
    await db.exec(sql(MIGRATION));
    // 20261014_01 replaces create_tailoring_order again → re-run what follows in the release
    await db.exec(sql(M.depositGiftsPayroll));
    await db.exec(sql(M.reassert));
    const { failed, raised } = await runVerify(db);
    assert.deepEqual(failed, []);
    assert.equal(raised, null);
  });

  it("deposit is manual: > 0 and ≤ total", async () => {
    assert.match(await rpcError(createOrder(100_000, 0, 25_000)), /أكبر من صفر/);
    assert.match(await rpcError(createOrder(100_000, 100_001, 25_000)), /يتجاوز المبلغ الإجمالي/);

    const { rows } = await createOrder(100_000, 30_000, 25_000);
    assert.equal(num(rows[0].r.deposit_amount), 30_000);
    assert.equal(num(rows[0].r.remaining_amount), 70_000);
    orders.push(String(rows[0].r.id));

    const full = await createOrder(80_000, 80_000, 40_000);
    orders.push(String(full.rows[0].r.id));
  });

  it("replacement order transfers the whole available advance (20261014_01)", async () => {
    const { rows } = await createOrder(50_000, 10_000, 5_000);
    const sourceId = String(rows[0].r.id);
    await svc(`SELECT public.cancel_tailoring_order($1, $2, $3, 'test')`, [sourceId, BRANCH_ID, users.owner]);

    const replacement = await createOrder(60_000, 0, 5_000, sourceId);
    assert.equal(num(replacement.rows[0].r.customer_advance_transferred_amount), 10_000);
    assert.equal(num(replacement.rows[0].r.deposit_amount), 10_000);
  });

  it("dues = recognised labour − payments (only delivered orders count)", async () => {
    assert.equal(num((await dues()).remaining_sdg), 0, "nothing recognised yet");

    for (const id of orders) await deliver(id);
    // the rate moves after the labour was recognised → FX difference on payment
    await db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, 2000, now())`, [BRANCH_ID]);

    const row = await dues();
    assert.deepEqual([num(row.orders_count), num(row.cost_sdg), num(row.remaining_sdg)], [2, 65_000, 65_000]);
  });

  it("advance: only owner/admin, never above the remaining dues, not an expense", async () => {
    assert.match(await rpcError(pay("ADVANCE", 1_000, users.cashier)), /للمدير أو المالك/);
    assert.match(await rpcError(pay("ADVANCE", 65_000.01)), /تتجاوز مستحقات الخياط/);

    const before = await ledger();
    const { rows } = await pay("ADVANCE", 30_000);
    const allocations = rows[0].r.allocations as { sales_order_id: string; amount: number }[];
    assert.deepEqual(allocations.map((a) => [a.sales_order_id, num(a.amount)]), [[orders[0], 25_000], [orders[1], 5_000]], "oldest first");

    const after = await ledger();
    assert.equal(after.p.expenses, before.p.expenses, "advance is not an expense");
    assert.equal(after.b.cashSdg, before.b.cashSdg - 30_000);

    const row = await dues();
    assert.deepEqual([num(row.advances_sdg), num(row.paid_sdg), num(row.remaining_sdg)], [30_000, 0, 35_000]);

    // order 1 fully covered → settle_tailor_fx closed its payable in USD
    const fx = await db.query(`SELECT 1 FROM public.journal_entries WHERE sales_order_id = $1 AND entry_type = 'CURRENCY_EXCHANGE'`, [orders[0]]);
    assert.equal(fx.rows.length, 1);
  });

  it("settlement pays the full remaining; stale amount is rejected; payable ends at 0 USD", async () => {
    assert.match(await rpcError(pay("SETTLEMENT", 30_000)), /تغيّر مستحق الخياط/);

    const before = await ledger();
    const { rows } = await pay("SETTLEMENT", 35_000);
    assert.equal(num(rows[0].r.amount), 35_000);

    const after = await ledger();
    assert.equal(after.p.expenses, before.p.expenses, "settlement is not an expense");
    assert.equal(after.b.tailorsPayable, 0, "FX settled per order → nothing left in USD");

    const row = await dues();
    assert.deepEqual([num(row.advances_sdg), num(row.paid_sdg), num(row.remaining_sdg)], [30_000, 35_000, 0]);
    assert.match(await rpcError(pay("SETTLEMENT", null)), /لا توجد مستحقات/);

    const types = await db.query<{ entry_type: string; n: string }>(
      `SELECT entry_type, count(*) AS n FROM public.journal_entries
       WHERE entry_type IN ('TAILOR_DUES_PAYMENT', 'TAILOR_DUES_ADVANCE') GROUP BY entry_type ORDER BY entry_type`,
    );
    assert.deepEqual(types.rows.map((r) => [r.entry_type, num(r.n)]), [["TAILOR_DUES_ADVANCE", 2], ["TAILOR_DUES_PAYMENT", 1]]);
  });
});

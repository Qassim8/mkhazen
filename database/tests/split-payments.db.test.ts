/**
 * 20261028_01_split_payments_payables on the REAL live schema, after the full release
 * sequence, called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  runVerify,
  seedBase,
  type Users,
} from "./db-harness";

type Json = Record<string, unknown>;

after(releaseTemplate);

describe("split payments for assets and expenses (20261028_01)", () => {
  let db: PGliteInterface;
  let users: Users;
  let seq = 0;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const setRate = (rate: number) =>
    db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);

  const balance = async (account: string, currency: "USD" | "SDG") =>
    num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, $2, $3) AS b`, [BRANCH_ID, account, currency])).rows[0].b);

  const usdBalance = async (account: string) =>
    num(
      (
        await db.query<{ b: string }>(
          `SELECT COALESCE(sum(CASE WHEN debit_account = $1 THEN amount_usd WHEN credit_account = $1 THEN -amount_usd ELSE 0 END), 0) AS b
           FROM public.journal_entries WHERE branch_id = $2`,
          [account, BRANCH_ID],
        )
      ).rows[0].b,
    );

  const entriesFor = async (ids: string[]) =>
    (
      await db.query<{ id: string; entry_type: string; amount: string; amount_usd: string; currency: string; debit_account: string; credit_account: string; entry_number: string }>(
        `SELECT id, entry_type, amount, amount_usd, currency, debit_account, credit_account, entry_number
         FROM public.journal_entries WHERE id = ANY($1::uuid[]) ORDER BY debit_account, credit_account`,
        [ids],
      )
    ).rows;

  const createAsset = (opts: {
    value: number;
    currency?: "USD" | "SDG";
    method?: string;
    owner?: number | null;
    now?: number | null;
    remaining?: number | null;
    due?: string | null;
    name?: string;
    entryNumber?: string;
  }) =>
    svc<{ r: Json }>(
      `SELECT public.create_asset_with_journal_entry($1, $2, $3, 'MACHINE', $4, '2026-10-01', $5, NULL, NULL, $6, $7, $8, $9, $10, $11::date) AS r`,
      [
        BRANCH_ID,
        users.cashier,
        opts.name ?? "ماكينة",
        opts.value,
        opts.method ?? "CASH",
        opts.entryNumber ?? `AST-T-${++seq}`,
        opts.currency ?? "USD",
        opts.owner ?? null,
        opts.now ?? null,
        opts.remaining ?? null,
        opts.due ?? null,
      ],
    );

  const recordExpense = (opts: {
    account?: string;
    amount: number;
    currency?: "USD" | "SDG";
    method?: string | null;
    owner?: number;
    now?: number;
    remaining?: number;
    due?: string | null;
    userId?: string;
    description?: string;
  }) =>
    svc<{ r: Json }>(
      `SELECT public.record_expense_with_payable($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, NULL) AS r`,
      [
        BRANCH_ID,
        opts.userId ?? users.cashier,
        opts.account ?? "UTILITIES",
        opts.amount,
        opts.currency ?? "SDG",
        opts.method === undefined ? "CASH" : opts.method,
        opts.owner ?? 0,
        opts.now ?? 0,
        opts.remaining ?? 0,
        opts.due ?? null,
        opts.description ?? "فاتورة كهرباء",
      ],
    );

  const pay = (payableId: string, amount: number, method = "CASH", userId = users.cashier) =>
    svc<{ r: Json }>(`SELECT public.pay_payable($1, $2, $3, $4, $5, NULL) AS r`, [payableId, amount, method, userId, BRANCH_ID]);

  const payable = async (id: string) =>
    (
      await db.query<Record<string, string | null>>(
        `SELECT source_type, currency, total_amount, owner_paid, paid_amount, remaining_amount, status, due_date::text AS due_date, fx_entry_id, recognition_entry_id
         FROM public.payables WHERE id = $1`,
        [id],
      )
    ).rows[0];

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await setRate(2500);
    await fundAccount(db, "CASH", 1_000, "USD");
    await fundAccount(db, "CASH", 1_000_000, "SDG");
    await fundAccount(db, "BANK", 500, "USD");
  });
  after(() => db.close());

  it("asset in three parts: correct entries, capital up by the owner's part only, cash down by paid-now only", async () => {
    const cashBefore = await balance("CASH", "USD");
    const capitalBefore = await usdBalance("CAPITAL");
    const payablesBefore = await usdBalance("OTHER_PAYABLES");

    const r = (await createAsset({ value: 1_000, owner: 300, now: 500, remaining: 200, due: "2099-01-31", name: "مولد كهرباء" })).rows[0].r;
    assert.ok(r.payable_id, "a payable is created");

    const entries = await db.query<{ id: string }>(
      `SELECT id FROM public.journal_entries WHERE description LIKE 'شراء أصل: مولد كهرباء%' ORDER BY entry_number`,
    );
    const rows = await entriesFor(entries.rows.map((row) => row.id));
    assert.equal(rows.length, 3);

    const by = (credit: string) => rows.find((row) => row.credit_account === credit)!;
    assert.deepEqual([by("CAPITAL").debit_account, num(by("CAPITAL").amount), by("CAPITAL").entry_type], ["ASSETS", 300, "ASSET"]);
    assert.deepEqual([by("CASH").debit_account, num(by("CASH").amount)], ["ASSETS", 500]);
    assert.deepEqual([by("OTHER_PAYABLES").debit_account, num(by("OTHER_PAYABLES").amount)], ["ASSETS", 200]);
    assert.ok(rows.every((row) => row.currency === "USD"));

    assert.equal(num(rows.reduce((sum, row) => sum + num(row.amount), 0)), 1_000, "the parts add up to the full value");

    assert.equal((await usdBalance("CAPITAL")) - capitalBefore, -300, "capital (credit) grows by the owner's part only");
    assert.equal((await balance("CASH", "USD")) - cashBefore, -500, "cash drops by paid-now only");
    assert.equal((await usdBalance("OTHER_PAYABLES")) - payablesBefore, -200, "OTHER_PAYABLES (credit) holds the remaining");

    const asset = (await db.query<{ purchase_value: string; purchase_value_usd: string }>(
      `SELECT purchase_value, purchase_value_usd FROM public.assets WHERE id = $1`,
      [r.asset_id],
    )).rows[0];
    assert.equal(num(asset.purchase_value), 1_000, "the asset is recorded at its full value");
    assert.equal(num(asset.purchase_value_usd), 1_000);

    const p = await payable(String(r.payable_id));
    assert.deepEqual(
      [p.source_type, p.currency, num(p.total_amount), num(p.owner_paid), num(p.paid_amount), num(p.remaining_amount), p.status, p.due_date],
      ["ASSET", "USD", 1_000, 300, 500, 200, "OPEN", "2099-01-31"],
    );
  });

  it("asset without split parts behaves exactly as before: one ASSETS/CASH entry with the given number, no payable", async () => {
    const cashBefore = await balance("CASH", "USD");
    const payablesCount = num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.payables`)).rows[0].n);

    const r = (await createAsset({ value: 120, entryNumber: "AST-LEGACY-1", name: "طابعة قديمة" })).rows[0].r;

    const rows = (await db.query<{ debit_account: string; credit_account: string; entry_type: string; amount: string; description: string; currency: string }>(
      `SELECT debit_account, credit_account, entry_type, amount, description, currency FROM public.journal_entries WHERE entry_number = 'AST-LEGACY-1'`,
    )).rows;
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].debit_account, rows[0].credit_account, rows[0].entry_type, num(rows[0].amount), rows[0].description, rows[0].currency],
      ["ASSETS", "CASH", "ASSET", 120, "شراء أصل: طابعة قديمة", "USD"],
    );
    assert.equal(r.payable_id, null);
    assert.equal(await balance("CASH", "USD"), cashBefore - 120);
    assert.equal(num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.payables`)).rows[0].n), payablesCount);
    assert.equal(num(r.purchase_value_usd), 120);

    // the old balance check still applies to the whole value
    assert.match(await rpcError(createAsset({ value: 9_999_999 })), /الرصيد غير كافٍ/);
  });

  it("expense with a remaining part, two payments to completion, with an exchange difference", async () => {
    await setRate(2500);
    const cashBefore = await balance("CASH", "SDG");

    // 100,000 SDG @ 2500 = 40 USD : 40,000 paid now, 60,000 remaining (24 USD)
    const r = (await recordExpense({ amount: 100_000, now: 40_000, remaining: 60_000, due: "2099-02-01", description: "إيجار المحل" })).rows[0].r;
    const payableId = String(r.payable_id);
    assert.equal((r.entry_ids as string[]).length, 2);
    assert.equal(await balance("CASH", "SDG"), cashBefore - 40_000);

    const rows = await entriesFor(r.entry_ids as string[]);
    const rem = rows.find((row) => row.credit_account === "OTHER_PAYABLES")!;
    assert.deepEqual([rem.debit_account, rem.entry_type, rem.currency, num(rem.amount), num(rem.amount_usd)], ["UTILITIES", "EXPENSE", "SDG", 60_000, 24]);

    // the pound weakens
    await setRate(3000);
    const first = (await pay(payableId, 20_000)).rows[0].r;
    assert.equal(num(first.remaining_amount), 40_000);
    assert.equal(first.status, "OPEN");
    assert.equal(first.fx_entry_id, null, "no exchange entry before the payable is fully paid");
    assert.equal(num(first.amount_usd), 6.67);
    assert.equal(await balance("CASH", "SDG"), cashBefore - 60_000);

    await setRate(4000);
    const second = (await pay(payableId, 40_000, "CASH", users.admin)).rows[0].r;
    assert.equal(num(second.remaining_amount), 0);
    assert.equal(second.status, "PAID");
    assert.equal(num(second.amount_usd), 10);
    assert.ok(second.fx_entry_id, "an exchange entry closes the USD difference");

    // recognized 24 USD, paid 6.67 + 10 = 16.67 → 7.33 USD gain
    const fx = (await entriesFor([String(second.fx_entry_id)]))[0];
    assert.deepEqual(
      [fx.entry_type, fx.currency, fx.debit_account, fx.credit_account, num(fx.amount_usd)],
      ["CURRENCY_EXCHANGE", "USD", "OTHER_PAYABLES", "CURRENCY_EXCHANGE", 7.33],
    );

    const p = await payable(payableId);
    assert.deepEqual([num(p.paid_amount), num(p.remaining_amount), p.status, p.fx_entry_id], [100_000, 0, "PAID", String(second.fx_entry_id)]);
    assert.equal(num(p.owner_paid), 0);

    await setRate(2500);
  });

  it("a payable paid at a stronger pound books an exchange loss", async () => {
    await setRate(3000);
    const r = (await recordExpense({ amount: 30_000, remaining: 30_000, description: "صيانة التكييف", account: "MAINTENANCE", method: null })).rows[0].r;
    // 30,000 @ 3000 = 10 USD recognized
    await setRate(2000);
    const paid = (await pay(String(r.payable_id), 30_000)).rows[0].r; // 15 USD
    assert.equal(num(paid.amount_usd), 15);
    const fx = (await entriesFor([String(paid.fx_entry_id)]))[0];
    assert.deepEqual([fx.debit_account, fx.credit_account, num(fx.amount_usd)], ["CURRENCY_EXCHANGE", "OTHER_PAYABLES", 5]);
    await setRate(2500);
  });

  it("USD payable: paid in USD, closes without any exchange entry", async () => {
    const r = (await createAsset({ value: 400, remaining: 400, name: "حاسوب" })).rows[0].r;
    await pay(String(r.payable_id), 150, "BANK");
    const done = (await pay(String(r.payable_id), 250)).rows[0].r;
    assert.equal(done.status, "PAID");
    assert.equal(done.fx_entry_id, null);
    assert.equal(await usdBalance("OTHER_PAYABLES") <= 0, true);
  });

  it("owner-paid and remaining only: the till is not touched and no payment method is needed", async () => {
    const cashBefore = await balance("CASH", "SDG");
    const bankBefore = await balance("BANK", "SDG");
    const r = (await recordExpense({ amount: 10_000, owner: 4_000, remaining: 6_000, method: null, description: "مصروف قبل الافتتاح" })).rows[0].r;

    const rows = await entriesFor(r.entry_ids as string[]);
    assert.deepEqual(rows.map((row) => row.credit_account).sort(), ["CAPITAL", "OTHER_PAYABLES"]);
    assert.equal(await balance("CASH", "SDG"), cashBefore);
    assert.equal(await balance("BANK", "SDG"), bankBefore);
  });

  it("rejections: overpaying the remaining, paying more than the till holds, bad parts, bad roles", async () => {
    // overpay
    const a = (await createAsset({ value: 100, now: 40, remaining: 60, name: "رف" })).rows[0].r;
    assert.match(await rpcError(pay(String(a.payable_id), 60.01)), /أكبر من المتبقي/);
    assert.match(await rpcError(pay(String(a.payable_id), 0)), /أكبر من صفر/);
    assert.match(await rpcError(pay(String(a.payable_id), 10.123)), /منزلتين/);
    assert.match(await rpcError(pay(String(a.payable_id), 10, "CARD")), /طريقة الدفع/);

    // more than the till holds: a big payable in SDG while the bank has no SDG
    const big = (await recordExpense({ amount: 5_000_000, remaining: 5_000_000, method: null, description: "التزام كبير" })).rows[0].r;
    assert.match(await rpcError(pay(String(big.payable_id), 5_000_000)), /الرصيد غير كافٍ في الخزينة/);
    assert.match(await rpcError(pay(String(big.payable_id), 100, "BANK")), /الرصيد غير كافٍ في البنك/);

    // a failed payment leaves the payable untouched
    const untouched = await payable(String(big.payable_id));
    assert.equal(num(untouched.remaining_amount), 5_000_000);
    assert.equal(
      num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.payable_payments WHERE payable_id = $1`, [big.payable_id])).rows[0].n),
      0,
    );

    // a paid-off payable
    const c = (await createAsset({ value: 50, remaining: 50, name: "مروحة" })).rows[0].r;
    await pay(String(c.payable_id), 50);
    assert.match(await rpcError(pay(String(c.payable_id), 1)), /مسدَّد/);

    // parts must add up and be valid
    assert.match(await rpcError(createAsset({ value: 100, owner: 10, now: 10, remaining: 10 })), /يجب أن يساوي/);
    assert.match(await rpcError(createAsset({ value: 100, owner: -10, now: 60, remaining: 50 })), /موجبة/);
    assert.match(await rpcError(recordExpense({ amount: 100, now: 50, remaining: 40 })), /يجب أن يساوي/);
    assert.match(await rpcError(recordExpense({ amount: 100, now: 100, method: null })), /طريقة الدفع/);
    assert.match(await rpcError(recordExpense({ amount: 100, now: 100, account: "SALARIES" })), /حساب المصروف/);
    assert.match(await rpcError(recordExpense({ amount: 5_000_000, now: 5_000_000 })), /الرصيد غير كافٍ/);

    // roles: a cashier cannot record rent; a tailor can do nothing
    assert.match(await rpcError(recordExpense({ amount: 100, now: 100, account: "RENTS" })), /الإيجار/);
    assert.match(await rpcError(recordExpense({ amount: 100, now: 100, userId: users.tailor })), /للكاشير أو المدير أو المالك/);
    assert.match(await rpcError(pay(String(a.payable_id), 10, "CASH", users.tailor)), /للكاشير أو المدير أو المالك/);
    await recordExpense({ amount: 100, now: 100, account: "RENTS", userId: users.admin, description: "إيجار" });

    // nothing was written by the rejected asset/expense calls
    assert.equal(
      num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries WHERE description LIKE '%التزام كبير%' AND credit_account <> 'OTHER_PAYABLES'`)).rows[0].n),
      0,
    );
  });

  it("expense paid in full now (no split parts): a single EXPENSE entry, no payable", async () => {
    const before = num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.payables`)).rows[0].n);
    const r = (await recordExpense({ amount: 200, now: 200, method: "BANK", currency: "USD", description: "اشتراك" })).rows[0].r;
    assert.equal((r.entry_ids as string[]).length, 1);
    assert.equal(r.payable_id, null);
    const e = (await entriesFor(r.entry_ids as string[]))[0];
    assert.deepEqual([e.debit_account, e.credit_account, e.entry_type], ["UTILITIES", "BANK", "EXPENSE"]);
    assert.equal(num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.payables`)).rows[0].n), before);
  });

  it("get_payables_summary: open payables per type, the overdue ones, and the ledger book value", async () => {
    const s = (await svc<{ s: Json }>(`SELECT public.get_payables_summary() AS s`)).rows[0].s as {
      assets: Json;
      expenses: Json;
      total: Json;
    };

    const open = await db.query<{ source_type: string; currency: string; remaining_amount: string }>(
      `SELECT source_type, currency, remaining_amount FROM public.payables WHERE status = 'OPEN'`,
    );
    const sum = (type: string | null, currency: string) =>
      open.rows.filter((row) => (type ? row.source_type === type : true) && row.currency === currency).reduce((acc, row) => acc + num(row.remaining_amount), 0);

    assert.equal(num(s.assets.count), open.rows.filter((row) => row.source_type === "ASSET").length);
    assert.equal(num(s.expenses.count), open.rows.filter((row) => row.source_type === "EXPENSE").length);
    assert.equal(num(s.total.count), open.rows.length);
    assert.equal(num(s.assets.remaining_usd), sum("ASSET", "USD"));
    assert.equal(num(s.expenses.remaining_sdg), sum("EXPENSE", "SDG"));
    assert.equal(num(s.total.remaining_sdg), sum(null, "SDG"));

    // book value = what the OTHER_PAYABLES account holds for open payables (nothing partially paid here)
    const ledger = -(await usdBalance("OTHER_PAYABLES"));
    assert.ok(Math.abs(num(s.total.book_usd) - ledger) < 0.02, `book ${s.total.book_usd} vs ledger ${ledger}`);

    // an overdue payable is counted
    await recordExpense({ amount: 1_000, remaining: 1_000, method: null, due: "2000-01-01", description: "متأخر" });
    const after = (await svc<{ s: Json }>(`SELECT public.get_payables_summary() AS s`)).rows[0].s as { total: Json };
    assert.equal(num(after.total.overdue_count), 1);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

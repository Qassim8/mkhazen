/**
 * 20261024_01_credit_sales on the REAL live schema, after the full release sequence,
 * called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  createProduct,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  runVerify,
  seedBase,
  type Users,
} from "./db-harness";

after(releaseTemplate);

type Json = Record<string, unknown>;

describe("credit sales (20261024_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  // يسجّل سعر صرف فعّالًا من لحظة الاستدعاء (كل اختبار يبدأ بسعر معروف لأن القاعدة مشتركة بين الاختبارات)
  const setRate = (rate = 2500) =>
    db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);

  const product = async (opts: { stock?: number; cost?: number; price?: number } = {}) =>
    createProduct(db, { stock: opts.stock ?? 100, averageCost: opts.cost ?? 4, purchasePrice: opts.cost ?? 4, sellingPrice: opts.price ?? 10 });

  const sale = async (
    variantId: string,
    quantity: number,
    credit: { paid?: { method: string; amount: number }[]; name?: string | null; phone?: string | null; due?: string | null } | null,
    userId = users.cashier,
  ) => {
    const items = JSON.stringify([{ variantId, quantity }]);
    if (!credit) {
      const { rows } = await svc<{ r: Json }>(
        `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL) AS r`,
        [BRANCH_ID, userId, items],
      );
      return rows[0].r;
    }
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', $3::jsonb, NULL, $4::jsonb, NULL, true, $5, $6, $7::date) AS r`,
      [
        BRANCH_ID,
        userId,
        JSON.stringify(credit.paid ?? []),
        items,
        credit.name === undefined ? "محمد أحمد" : credit.name,
        credit.phone === undefined ? "0912345678" : credit.phone,
        credit.due ?? null,
      ],
    );
    return rows[0].r;
  };

  const pay = (orderId: string, amount: number, method = "CASH", userId = users.cashier) =>
    svc<{ r: Json }>(`SELECT public.record_credit_payment($1, $2, $3, $4, $5, NULL) AS r`, [orderId, amount, method, userId, BRANCH_ID]);

  const order = async (id: string) =>
    (
      await db.query<Json>(
        `SELECT is_credit, payment_status, status, total_amount, paid_amount, remaining_amount, deferred_cost_usd,
                expected_profit_usd, credit_closed_reason, credit_customer_name, credit_customer_phone, due_date, exchange_rate_used, payment_method
         FROM public.sales_orders WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const entries = async (orderId: string) =>
    (
      await db.query<{ debit_account: string; credit_account: string; entry_type: string; currency: string; amount: string; amount_usd: string; exchange_rate_used: string | null }>(
        `SELECT debit_account, credit_account, entry_type, currency, amount, amount_usd, exchange_rate_used
         FROM public.journal_entries WHERE sales_order_id = $1 ORDER BY created_at, entry_number`,
        [orderId],
      )
    ).rows;

  const usdSum = async (orderId: string, debit: string, credit: string) =>
    num(
      (
        await db.query<{ s: string }>(
          `SELECT COALESCE(sum(amount_usd), 0) AS s FROM public.journal_entries WHERE sales_order_id = $1 AND debit_account = $2 AND credit_account = $3`,
          [orderId, debit, credit],
        )
      ).rows[0].s,
    );

  const usdSumAny = async (orderId: string, debitIn: string[], credit: string) =>
    num(
      (
        await db.query<{ s: string }>(
          `SELECT COALESCE(sum(amount_usd), 0) AS s FROM public.journal_entries WHERE sales_order_id = $1 AND debit_account = ANY($2) AND credit_account = $3`,
          [orderId, debitIn, credit],
        )
      ).rows[0].s,
    );

  const journalCount = async () => num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries`)).rows[0].n);

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await fundAccount(db, "CASH", 1_000_000, "SDG");
  });
  after(() => db.close());

  it("normal sale is unchanged: PAID, full COGS, no deferred cost, no credit fields", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 2, null);
    const o = await order(r.id as string);

    assert.equal(o.is_credit, false);
    assert.equal(o.payment_status, "PAID");
    assert.equal(o.paid_amount, null);
    assert.equal(o.remaining_amount, null);
    assert.equal(num(o.deferred_cost_usd), 0);
    assert.equal(o.credit_closed_reason, null);
    assert.equal(r.payment_status, "PAID");

    const rows = await entries(r.id as string);
    assert.deepEqual(
      rows.map((row) => [row.debit_account, row.credit_account, row.currency, num(row.amount)]).sort(),
      [
        ["CASH", "SALES", "SDG", 50_000],
        ["COGS", "INVENTORY", "USD", 8],
      ],
    );
    assert.ok(rows.every((row) => row.debit_account !== "DEFERRED_COGS"));
  });

  it("credit sale: revenue = amount paid now, cost split between COGS and DEFERRED_COGS", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 2, { paid: [{ method: "CASH", amount: 20_000 }], due: null });
    const id = r.id as string;
    const o = await order(id);

    assert.equal(o.is_credit, true);
    assert.equal(o.status, "COMPLETED");
    assert.equal(o.payment_status, "PARTIAL");
    assert.equal(num(o.total_amount), 50_000);
    assert.equal(num(o.paid_amount), 20_000);
    assert.equal(num(o.remaining_amount), 30_000);
    assert.equal(num(o.exchange_rate_used), 2500);
    assert.equal(o.credit_customer_name, "محمد أحمد");
    assert.equal(o.credit_customer_phone, "0912345678");
    // 50,000 / 2500 = 20 USD − cost 8 USD
    assert.equal(num(o.expected_profit_usd), 12);
    // cost 8: paid share 20,000/50,000 → COGS 3.2, deferred 4.8
    assert.equal(num(o.deferred_cost_usd), 4.8);
    assert.equal(r.payment_status, "PARTIAL");
    assert.equal(num(r.remaining_amount), 30_000);

    assert.equal(await usdSum(id, "CASH", "SALES"), 8, "revenue = 20,000 SDG at 2500, nothing for the remainder");
    assert.equal(await usdSum(id, "COGS", "INVENTORY"), 3.2);
    assert.equal(await usdSum(id, "DEFERRED_COGS", "INVENTORY"), 4.8);

    const stock = await db.query<{ q: string }>(`SELECT "stockQuantity" AS q FROM public.product_variants WHERE id = $1`, [p.variantId]);
    assert.equal(num(stock.rows[0].q), 98);

    const payments = await db.query<{ amount: string }>(`SELECT amount FROM public.sales_order_payments WHERE sales_order_id = $1`, [id]);
    assert.deepEqual(payments.rows.map((row) => num(row.amount)), [20_000]);
  });

  it("credit sale with nothing paid is UNPAID: no revenue, all cost deferred; mixed advance works", async () => {
    await setRate();
    const p = await product();
    const unpaid = await sale(p.variantId, 1, { paid: [] });
    const o = await order(unpaid.id as string);
    assert.equal(o.payment_status, "UNPAID");
    assert.equal(num(o.remaining_amount), 25_000);
    assert.equal(num(o.deferred_cost_usd), 4);
    const rows = await entries(unpaid.id as string);
    assert.deepEqual(rows.map((row) => [row.debit_account, row.credit_account]), [["DEFERRED_COGS", "INVENTORY"]]);

    const mixed = await sale(p.variantId, 2, {
      paid: [
        { method: "CASH", amount: 10_000 },
        { method: "BANK_TRANSFER", amount: 5_000 },
      ],
    });
    const m = await order(mixed.id as string);
    assert.equal(m.payment_method, "MIXED");
    assert.equal(num(m.remaining_amount), 35_000);
    assert.equal(await usdSum(mixed.id as string, "CASH", "SALES"), 4);
    assert.equal(await usdSum(mixed.id as string, "BANK", "SALES"), 2);
  });

  it("credit sale validation: name, phone, paid < total, POS only, no duplicate methods", async () => {
    await setRate();
    const p = await product();
    const before = await journalCount();
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [], name: "" })), /اسم العميل/);
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [], phone: null })), /هاتف/);
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [{ method: "CASH", amount: 25_000 }] })), /أقل من إجمالي/);
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [{ method: "CASH", amount: 30_000 }] })), /أقل من إجمالي/);
    assert.match(
      await rpcError(
        sale(p.variantId, 1, {
          paid: [
            { method: "CASH", amount: 1000 },
            { method: "CASH", amount: 2000 },
          ],
        }),
      ),
      /تكرار/,
    );
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [{ method: "CHEQUE", amount: 1000 }] })), /طريقة الدفع/);
    assert.match(await rpcError(sale(p.variantId, 1, { paid: [], due: "2000-01-01" })), /تاريخ الاستحقاق/);
    assert.equal(await journalCount(), before, "failed sales leave no entries");

    await assert.rejects(
      svc(`SELECT public.complete_sales_checkout($1, $2, 'TAILORING', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL, true, 'x', '1', NULL)`, [
        BRANCH_ID,
        users.cashier,
        JSON.stringify([{ variantId: p.variantId, quantity: 1 }]),
      ]),
    );
  });

  it("two payments at two different exchange rates: revenue at each moment's rate, cost released proportionally", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 2, { paid: [{ method: "CASH", amount: 20_000 }] });
    const id = r.id as string;

    await setRate(3000);
    const first = (await pay(id, 15_000)).rows[0].r;
    assert.equal(num(first.exchange_rate_used), 3000);
    assert.equal(num(first.amount_usd), 5);
    assert.equal(num(first.remaining_amount), 15_000);
    // deferred 4.8 × (15,000 / 30,000) = 2.4
    assert.equal(num(first.released_cost_usd), 2.4);
    assert.equal(num(first.deferred_cost_usd), 2.4);

    await setRate(4000);
    const second = (await pay(id, 6_000, "BANK_TRANSFER")).rows[0].r;
    assert.equal(num(second.amount_usd), 1.5);
    // 2.4 × (6,000 / 15,000) = 0.96
    assert.equal(num(second.released_cost_usd), 0.96);
    assert.equal(num(second.remaining_amount), 9_000);
    assert.equal(second.closed, false);

    const o = await order(id);
    assert.equal(o.payment_status, "PARTIAL");
    assert.equal(num(o.paid_amount), 41_000);
    assert.equal(num(o.remaining_amount), 9_000);
    assert.equal(num(o.deferred_cost_usd), 1.44);
    assert.equal(num(o.exchange_rate_used), 2500, "the sale rate is never overwritten");

    // revenue: 8 (at 2500) + 5 (at 3000) + 1.5 (at 4000)
    assert.equal(await usdSumAny(id, ["CASH", "BANK"], "SALES"), 14.5);
    assert.equal(await usdSum(id, "COGS", "DEFERRED_COGS"), 3.36);

    const paymentRows = await db.query<{ amount: string; amount_usd: string; exchange_rate_sdg_per_usd: string }>(
      `SELECT amount, amount_usd, exchange_rate_sdg_per_usd FROM public.sales_order_payments WHERE sales_order_id = $1 ORDER BY amount`,
      [id],
    );
    assert.deepEqual(
      paymentRows.rows.map((row) => [num(row.amount), num(row.amount_usd), num(row.exchange_rate_sdg_per_usd)]),
      [
        [6_000, 1.5, 4000],
        [15_000, 5, 3000],
        [20_000, 8, 2500],
      ],
    );
  });

  it("overpayment closes the invoice, releases ALL deferred cost, extra is ordinary revenue", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 1, { paid: [] });
    const id = r.id as string;
    await setRate(2600);

    const result = (await pay(id, 30_000)).rows[0].r;
    assert.equal(result.closed, true);
    assert.equal(num(result.remaining_amount), 0);
    assert.equal(num(result.overpaid_amount), 5_000);
    assert.equal(num(result.released_cost_usd), 4);
    assert.equal(result.payment_status, "PAID");

    const o = await order(id);
    assert.equal(o.payment_status, "PAID");
    assert.equal(o.credit_closed_reason, "PAID");
    assert.equal(num(o.remaining_amount), 0);
    assert.equal(num(o.deferred_cost_usd), 0);
    assert.equal(await usdSum(id, "COGS", "DEFERRED_COGS"), 4);
    assert.equal(await usdSum(id, "DEFERRED_COGS", "INVENTORY"), 4);
    // the whole 30,000 SDG (including the 5,000 over) is revenue at the payment-time rate
    assert.equal(await usdSumAny(id, ["CASH", "BANK"], "SALES"), Math.round((30_000 / 2600) * 100) / 100);

    assert.match(await rpcError(pay(id, 100)), /مغلقة/);
  });

  it("payment guards: not a credit invoice, bad amount/method, wrong role/branch", async () => {
    await setRate();
    const p = await product();
    const normal = await sale(p.variantId, 1, null);
    assert.match(await rpcError(pay(normal.id as string, 100)), /ليست فاتورة بيع بالتقسيط/);

    const credit = await sale(p.variantId, 1, { paid: [] });
    const id = credit.id as string;
    assert.match(await rpcError(pay(id, 0)), /أكبر من صفر/);
    assert.match(await rpcError(pay(id, -5)), /أكبر من صفر/);
    assert.match(await rpcError(pay(id, 10.123)), /منزلتين/);
    assert.match(await rpcError(pay(id, 100, "CHEQUE")), /طريقة الدفع/);
    assert.match(await rpcError(pay(id, 100, "CASH", users.tailor)), /للكاشير أو المدير/);
    assert.match(await rpcError(pay(id, 100, "CASH", users.otherBranchAdmin)), /غير صالح لهذا الفرع/);
    assert.match(await rpcError(pay("00000000-0000-4000-8000-0000000000aa", 100)), /غير موجودة/);

    // cashier and admin can collect
    await pay(id, 100, "CASH", users.cashier);
    await pay(id, 100, "CARD", users.admin);
    assert.equal(num((await order(id)).remaining_amount), 24_800);
  });

  it("adjust remaining: owner/admin only, logged, no journal entry; later payments follow the new remaining", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 2, { paid: [{ method: "CASH", amount: 20_000 }] });
    const id = r.id as string; // remaining 30,000, deferred 4.8

    const adjust = (newRemaining: number, reason: string | null, userId = users.admin) =>
      svc<{ r: Json }>(`SELECT public.adjust_credit_remaining($1, $2, $3, $4) AS r`, [id, newRemaining, reason, userId]);

    assert.match(await rpcError(adjust(10_000, "تفاوض", users.cashier)), /للمالك أو المدير فقط/);
    assert.match(await rpcError(adjust(10_000, "")), /سبب التعديل/);
    assert.match(await rpcError(adjust(0, "x")), /أكبر من صفر/);
    assert.match(await rpcError(adjust(30_000, "x")), /يساوي الحالي/);

    const before = await journalCount();
    const lowered = (await adjust(10_000, "خصم بعد تفاوض")).rows[0].r;
    assert.equal(num(lowered.old_remaining), 30_000);
    assert.equal(num(lowered.new_remaining), 10_000);
    assert.equal(await journalCount(), before, "negotiation writes no journal entry");
    assert.equal(num((await order(id)).remaining_amount), 10_000);

    // increase
    await adjust(12_000, "فرق صرف متفق عليه", users.owner);
    const log = await db.query<{ adjustment_type: string; old_remaining: string; new_remaining: string; reason: string; created_by: string }>(
      `SELECT adjustment_type, old_remaining, new_remaining, reason, created_by FROM public.credit_adjustments WHERE order_id = $1 ORDER BY created_at, new_remaining`,
      [id],
    );
    assert.deepEqual(
      log.rows.map((row) => [row.adjustment_type, num(row.old_remaining), num(row.new_remaining), row.reason, row.created_by]),
      [
        ["ADJUST", 30_000, 10_000, "خصم بعد تفاوض", users.admin],
        ["ADJUST", 10_000, 12_000, "فرق صرف متفق عليه", users.owner],
      ],
    );

    // paying the adjusted remaining releases the whole deferred cost
    const result = (await pay(id, 12_000)).rows[0].r;
    assert.equal(result.closed, true);
    assert.equal(num(result.released_cost_usd), 4.8);
    assert.equal(num((await order(id)).deferred_cost_usd), 0);
  });

  it("bad debt: remaining 0, OTHER_EXPENSE / DEFERRED_COGS for the remaining deferred cost, owner/admin only", async () => {
    await setRate();
    const p = await product();
    const r = await sale(p.variantId, 2, { paid: [{ method: "CASH", amount: 20_000 }] });
    const id = r.id as string;
    await pay(id, 15_000); // releases 2.4, deferred left 2.4

    const close = (userId = users.owner, notes: string | null = "تعذر التحصيل") =>
      svc<{ r: Json }>(`SELECT public.close_credit_bad_debt($1, $2, $3, $4) AS r`, [id, userId, BRANCH_ID, notes]);

    assert.match(await rpcError(close(users.cashier)), /للمالك أو المدير فقط/);

    const result = (await close(users.admin)).rows[0].r;
    assert.equal(num(result.written_off_sdg), 15_000);
    assert.equal(num(result.expensed_cost_usd), 2.4);

    const o = await order(id);
    assert.equal(num(o.remaining_amount), 0);
    assert.equal(num(o.deferred_cost_usd), 0);
    assert.equal(o.credit_closed_reason, "BAD_DEBT");
    assert.notEqual(o.payment_status, "PAID", "a written-off invoice is not paid");
    assert.equal(await usdSum(id, "OTHER_EXPENSE", "DEFERRED_COGS"), 2.4);

    const log = await db.query<{ adjustment_type: string; old_remaining: string; new_remaining: string }>(
      `SELECT adjustment_type, old_remaining, new_remaining FROM public.credit_adjustments WHERE order_id = $1`,
      [id],
    );
    assert.deepEqual(log.rows.map((row) => [row.adjustment_type, num(row.old_remaining), num(row.new_remaining)]), [["BAD_DEBT", 15_000, 0]]);

    assert.match(await rpcError(pay(id, 100)), /مغلقة/);
    assert.match(await rpcError(close()), /مغلقة/);
  });

  it("DEFERRED_COGS balance equals the sum of open invoices' deferred cost, and never goes negative", async () => {
    const balance = num(
      (
        await db.query<{ b: string }>(
          `SELECT COALESCE(sum(CASE WHEN debit_account = 'DEFERRED_COGS' THEN amount_usd WHEN credit_account = 'DEFERRED_COGS' THEN -amount_usd ELSE 0 END), 0) AS b
           FROM public.journal_entries`,
        )
      ).rows[0].b,
    );
    const open = num(
      (await db.query<{ s: string }>(`SELECT COALESCE(sum(deferred_cost_usd), 0) AS s FROM public.sales_orders WHERE is_credit`)).rows[0].s,
    );
    assert.ok(balance >= 0);
    assert.equal(Math.round(balance * 100), Math.round(open * 100));
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

describe("credit valuation and receivables summary (20261024_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("values the remaining at the sale rate and at today's rate", async () => {
    const p = await createProduct(db, { stock: 50, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const items = JSON.stringify([{ variantId: p.variantId, quantity: 2 }]);
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', $3::jsonb, NULL, $4::jsonb, NULL, true, 'سارة', '0999', current_date + 30) AS r`,
      [BRANCH_ID, users.cashier, JSON.stringify([{ method: "CASH", amount: 20_000 }]), items],
    );
    const id = rows[0].r.id as string;

    // the pound weakens: 2500 → 3000
    await db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, 3000, clock_timestamp())`, [BRANCH_ID]);

    const v = (await svc<Record<string, unknown>>(`SELECT * FROM public.get_credit_valuation($1)`, [id])).rows[0];
    assert.equal(num(v.remaining_sdg), 30_000);
    assert.equal(num(v.sale_rate), 2500);
    assert.equal(num(v.current_rate), 3000);
    assert.equal(num(v.remaining_usd_at_sale), 12);
    assert.equal(num(v.remaining_usd_now), 10);
    assert.equal(num(v.loss_usd), 2);
    assert.equal(num(v.loss_pct), 16.67);
    assert.equal(num(v.equivalent_sdg_today), 36_000);
    // expected profit = 50,000/2500 − 8 = 12 → loss is 2/12 of it
    assert.equal(num(v.expected_profit_usd), 12);
    assert.equal(num(v.loss_pct_of_profit), 16.67);
    assert.equal(v.is_overdue, false);
    assert.equal(v.credit_customer_name, "سارة");

    // not-null call lists only open credit invoices; a normal invoice never shows up
    const normal = await svc<{ r: Json }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL) AS r`,
      [BRANCH_ID, users.cashier, items],
    );
    const all = await svc<{ order_id: string }>(`SELECT order_id FROM public.get_credit_valuation(NULL)`);
    assert.deepEqual(all.rows.map((row) => row.order_id), [id]);
    assert.ok(!all.rows.some((row) => row.order_id === (normal.rows[0].r.id as string)));
  });

  it("flags overdue invoices and summarizes receivables, loss and deferred cost", async () => {
    const p = await createProduct(db, { stock: 50, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const items = JSON.stringify([{ variantId: p.variantId, quantity: 1 }]);
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL, true, 'علي', '0888', NULL) AS r`,
      [BRANCH_ID, users.cashier, items],
    );
    const id = rows[0].r.id as string;
    await db.query(`UPDATE public.sales_orders SET due_date = current_date - 3 WHERE id = $1`, [id]);

    const summary = (await svc<{ s: Json }>(`SELECT public.get_receivables_summary() AS s`)).rows[0].s;
    assert.equal(num(summary.invoices_count), 2);
    assert.equal(num(summary.overdue_count), 1);
    // first invoice: 30,000 sold at 2500 (12 → 10 USD today); this one: 30,000 sold at 3000 (10 → 10 USD)
    assert.equal(num(summary.total_remaining_sdg), 60_000);
    assert.equal(num(summary.total_usd_at_sale), 22);
    assert.equal(num(summary.total_usd_now), 20);
    assert.equal(num(summary.total_loss_usd), 2);
    // deferred cost: 4.8 + 4
    assert.equal(num(summary.deferred_cost_usd_open), 8.8);
    assert.equal(num(summary.deferred_cogs_usd), 8.8);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

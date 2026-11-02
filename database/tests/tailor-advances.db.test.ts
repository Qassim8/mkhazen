/**
 * 20261031_01 — tailor advances separated from dues (open advance, cash repayment, optional
 * deduction when paying dues). Real live schema, full release sequence, service_role.
 * Run: npm run test:db
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

const MEASUREMENTS = JSON.stringify([{ label: "الطول", value: 150, unit: "CM" }]);

after(releaseTemplate);

describe("tailor advances separated from dues (20261031_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const setRate = (rate: number) =>
    db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);

  const pay = (
    kind: "SETTLEMENT" | "ADVANCE" | "ADVANCE_RETURN",
    amount: number | null,
    opts: { deduct?: number; method?: string; userId?: string; tailorId?: string } = {},
  ) =>
    svc<{ r: Json }>(`SELECT public.pay_tailor_dues($1, $2, $3, $4, $5, $6, 'ملاحظة', $7) AS r`, [
      BRANCH_ID,
      opts.userId ?? users.owner,
      opts.tailorId ?? users.tailor,
      kind,
      amount,
      opts.method ?? "CASH",
      opts.deduct ?? 0,
    ]);

  const advanceBalance = async () =>
    num((await svc<{ b: string }>(`SELECT public.get_tailor_advance_balance($1) AS b`, [users.tailor])).rows[0].b);

  const advanceUsd = async () =>
    num((await svc<{ b: string }>(`SELECT public.get_tailor_advance_usd_balance($1) AS b`, [users.tailor])).rows[0].b);

  const summary = async () =>
    (await svc<Record<string, string>>(`SELECT * FROM public.get_tailor_advances($1, current_date, $2)`, [BRANCH_ID, users.tailor])).rows[0];

  const dues = async () =>
    num((await svc<{ r: string }>(`SELECT remaining_sdg AS r FROM public.get_tailor_dues($1, $2)`, [BRANCH_ID, users.tailor])).rows[0].r);

  const cash = async () =>
    num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'CASH', 'SDG') AS b`, [BRANCH_ID])).rows[0].b);

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

  const entriesBy = async (reference: string) =>
    (
      await db.query<{ entry_type: string; debit_account: string; credit_account: string; amount: string; amount_usd: string; sales_order_id: string | null }>(
        `SELECT entry_type, debit_account, credit_account, amount, amount_usd, sales_order_id
         FROM public.journal_entries WHERE reference = $1 ORDER BY entry_number`,
        [reference],
      )
    ).rows;

  const createOrder = async (total: number, cost: number) => {
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', 'عميل', '0912345678', $4::jsonb, current_date, current_date + 7,
              NULL, NULL, $5, $6, $7, 'CASH', NULL, 'جلابية', NULL, NULL) AS r`,
      [BRANCH_ID, users.owner, users.tailor, MEASUREMENTS, total, total / 2, cost],
    );
    return String(rows[0].r.id);
  };

  async function deliver(orderId: string) {
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'UNDER_TAILORING')`, [orderId, BRANCH_ID, users.owner]);
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'READY_FOR_PICKUP')`, [orderId, BRANCH_ID, users.owner]);
    await svc(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH')`, [orderId, BRANCH_ID, users.owner]);
  }

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await setRate(2500);
    await fundAccount(db, "CASH", 5_000_000, "SDG");
  });
  after(() => db.close());

  it("an advance is an open amount: TAILOR_ADVANCES / cash, needs no dues, not an expense", async () => {
    assert.equal(await dues(), 0, "no recognised dues yet");
    const cashBefore = await cash();

    const r = (await pay("ADVANCE", 50_000)).rows[0].r; // 20 USD @ 2500
    assert.equal(num(r.advance_balance), 50_000);
    assert.equal(await advanceBalance(), 50_000);
    assert.equal(await cash(), cashBefore - 50_000);

    const [entry] = await entriesBy(String(r.reference));
    assert.deepEqual(
      [entry.entry_type, entry.debit_account, entry.credit_account, num(entry.amount), entry.sales_order_id],
      ["TAILOR_ADVANCE", "TAILOR_ADVANCES", "CASH", 50_000, null],
    );

    const s = await summary();
    assert.deepEqual([num(s.general_balance_sdg), num(s.total_balance_sdg), num(s.advances_month_sdg)], [50_000, 50_000, 50_000]);
  });

  it("paying dues without a deduction never touches the advance balance", async () => {
    const order = await createOrder(100_000, 25_000);
    await deliver(order); // labour 25,000 @ 2500 = 10 USD recognised
    assert.equal(await dues(), 25_000);

    const cashBefore = await cash();
    const r = (await pay("SETTLEMENT", null)).rows[0].r; // full remaining, no deduction
    assert.equal(num(r.amount), 25_000);
    assert.equal(num(r.deducted), 0);

    assert.equal(await advanceBalance(), 50_000, "advance balance unchanged");
    assert.equal(await cash(), cashBefore - 25_000, "no automatic deduction: the whole amount came from the till");
    assert.equal(await dues(), 0);

    const entries = await entriesBy(String(r.reference));
    assert.ok(entries.every((e) => e.debit_account === "TAILORS_PAYABLE" && e.credit_account === "CASH"));
  });

  it("payment with a partial deduction: TAILORS_PAYABLE / TAILOR_ADVANCES for the deducted part, TAILORS_PAYABLE / cash for the net", async () => {
    const order = await createOrder(120_000, 40_000);
    await deliver(order); // labour 40,000 @ 2500 = 16 USD recognised
    await setRate(2000); // the pound weakens

    const cashBefore = await cash();
    const r = (await pay("SETTLEMENT", 40_000, { deduct: 15_000, method: "CASH" })).rows[0].r;

    assert.equal(num(r.deducted), 15_000);
    assert.equal(num(r.net), 25_000);
    assert.equal(await cash(), cashBefore - 25_000, "only the net leaves the till");
    assert.equal(await advanceBalance(), 35_000, "50,000 − 15,000 deducted");
    assert.equal(await dues(), 0);

    const entries = await entriesBy(String(r.reference));
    const net = entries.find((e) => e.credit_account === "CASH")!;
    const ded = entries.find((e) => e.credit_account === "TAILOR_ADVANCES")!;
    assert.deepEqual([net.debit_account, net.entry_type, num(net.amount), net.sales_order_id], ["TAILORS_PAYABLE", "TAILOR_DUES_PAYMENT", 25_000, order]);
    assert.deepEqual([ded.debit_account, ded.entry_type, num(ded.amount), ded.sales_order_id], ["TAILORS_PAYABLE", "TAILOR_ADVANCE_DEDUCTION", 15_000, order]);

    // settle_tailor_fx still closes TAILORS_PAYABLE exactly: recognised 16 USD, paid 12.5 + 7.5 = 20 USD → 4 USD loss
    assert.equal(await usdBalance("TAILORS_PAYABLE"), 0, "the payable ends at zero in USD");
    const fx = await db.query<{ debit_account: string; credit_account: string; amount_usd: string }>(
      `SELECT debit_account, credit_account, amount_usd FROM public.journal_entries
       WHERE sales_order_id = $1 AND entry_type = 'CURRENCY_EXCHANGE'`,
      [order],
    );
    assert.equal(fx.rows.length, 1);
    assert.deepEqual([fx.rows[0].debit_account, fx.rows[0].credit_account, num(fx.rows[0].amount_usd)], ["CURRENCY_EXCHANGE", "TAILORS_PAYABLE", 4]);

    // the deduction is recorded as wages paid (dues reduced)
    const paid = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.tailor_commission_payments WHERE sales_order_id = $1 AND payment_type = 'SETTLEMENT'`,
      [order],
    );
    assert.equal(num(paid.rows[0].n), 2);
  });

  it("cash repayment of the rest brings the advance balance to 0 and closes the USD residual on CURRENCY_EXCHANGE", async () => {
    await setRate(3000);
    const cashBefore = await cash();

    // 50,000 @ 2500 = 20 USD advanced; 15,000 applied @ 2000 = 7.5; 35,000 returned @ 3000 = 11.67 → 0.83 USD left
    const r = (await pay("ADVANCE_RETURN", 35_000, { method: "BANK" })).rows[0].r;
    assert.equal(num(r.advance_balance), 0);
    assert.equal(await advanceBalance(), 0);
    assert.equal(await cash(), cashBefore, "returned into the bank, not the cash");

    const entries = await entriesBy(String(r.reference));
    const returned = entries.find((e) => e.entry_type === "TAILOR_ADVANCE_RETURN")!;
    assert.deepEqual([returned.debit_account, returned.credit_account, num(returned.amount)], ["BANK", "TAILOR_ADVANCES", 35_000]);

    const fx = entries.find((e) => e.entry_type === "CURRENCY_EXCHANGE")!;
    assert.ok(fx, "residual closed");
    assert.deepEqual([fx.debit_account, fx.credit_account, num(fx.amount_usd)], ["CURRENCY_EXCHANGE", "TAILOR_ADVANCES", 0.83]);
    assert.equal(await advanceUsd(), 0);
    assert.equal(await usdBalance("TAILOR_ADVANCES"), 0, "the account itself ends at zero");
  });

  it("rejections: return or deduction above the balance, deduction above the payment, deduction on an advance, cash shortage, roles", async () => {
    await setRate(2500);
    await pay("ADVANCE", 10_000);
    const order = await createOrder(60_000, 20_000);
    await deliver(order);

    assert.match(await rpcError(pay("ADVANCE_RETURN", 10_000.01)), /يتجاوز رصيد سلف/);
    assert.match(await rpcError(pay("SETTLEMENT", 20_000, { deduct: 10_000.01 })), /يتجاوز رصيد سلف/);
    assert.match(await rpcError(pay("SETTLEMENT", 5_000, { deduct: 6_000 })), /يتجاوز مبلغ السداد/);
    assert.match(await rpcError(pay("ADVANCE", 1_000, { deduct: 500 })), /عند دفع المستحقات فقط/);
    assert.match(await rpcError(pay("SETTLEMENT", 20_000.01)), /يتجاوز مستحقات/);
    assert.match(await rpcError(pay("ADVANCE", 999_999_999)), /الرصيد غير كافٍ في الخزينة/);
    assert.match(await rpcError(pay("ADVANCE_RETURN", 0)), /المبلغ غير صالح/);
    assert.match(await rpcError(pay("ADVANCE", 100, { method: "CARD" })), /طريقة الدفع/);
    assert.match(await rpcError(pay("ADVANCE", 100, { userId: users.cashier })), /للمدير أو المالك فقط/);
    assert.match(await rpcError(pay("ADVANCE", 100, { tailorId: users.cashier })), /ليس حساب خياط/);

    assert.equal(await advanceBalance(), 10_000, "rejected calls change nothing");
    assert.equal(await dues(), 20_000);

    // a full deduction needs no cash at all
    const cashBefore = await cash();
    const r = (await pay("SETTLEMENT", 10_000, { deduct: 10_000 })).rows[0].r;
    assert.equal(num(r.net), 0);
    assert.equal(await cash(), cashBefore);
    assert.equal(await advanceBalance(), 0);
  });

  it("existing order-linked advances stay as they are: shown separately, not available for return or deduction", async () => {
    const order = await createOrder(90_000, 30_000);
    // the old per-order prepayment (before the labour is recognised): TAILOR_ADVANCES / cash tied to the order
    await svc(`SELECT public.pay_tailor_payment($1, $2, $3, $4, 12000, 'CASH', NULL, 'SDG')`, [BRANCH_ID, users.owner, users.tailor, order]);

    const s = await summary();
    assert.deepEqual([num(s.general_balance_sdg), num(s.order_advances_sdg), num(s.total_balance_sdg)], [0, 12_000, 12_000]);
    assert.match(await rpcError(pay("ADVANCE_RETURN", 1)), /يتجاوز رصيد سلف/);

    // delivering applies it automatically against that order's labour (unchanged behaviour)
    await deliver(order);
    const after = await summary();
    assert.equal(num(after.order_advances_sdg), 0);
    assert.equal(num(after.general_balance_sdg), 0);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

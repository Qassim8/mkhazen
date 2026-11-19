/**
 * 20261119_01_purchase_auto_exchange — دفع المشتريات بالدولار مع تحويل تلقائي للناقص
 * من رصيد الجنيه في نفس الحساب (الفحص ← التحويل ← الاستلام ← الدفع، في معاملة واحدة).
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  createProduct,
  createPurchaseOrder,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  seedBase,
  type Users,
} from "./db-harness";

after(releaseTemplate);

type Json = Record<string, unknown>;

async function setup(rate = 9800) {
  const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
  const users = await seedBase(db);
  await db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);
  return { db, users };
}

function helpers(db: PGliteInterface, users: Users) {
  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const balance = async (account: "CASH" | "BANK", currency: "USD" | "SDG") =>
    num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, $2, $3) AS b`, [BRANCH_ID, account, currency])).rows[0].b);

  const exchanges = async () =>
    (
      await db.query<{ entry_number: string; amount: string; currency: string; debit_account: string; credit_account: string; description: string; reference: string }>(
        `SELECT entry_number, amount, currency, debit_account, credit_account, description, reference
         FROM public.journal_entries WHERE entry_type = 'CURRENCY_EXCHANGE' ORDER BY entry_number`,
      )
    ).rows;

  const receiveAndPay = (orderId: string, amount: number, method: "CASH" | "BANK") =>
    svc<{ r: Json }>(
      `SELECT public.receive_purchase_order_with_payment($1, $2, $3, $4, now(), $5, NULL, NULL) AS r`,
      [orderId, users.cashier, BRANCH_ID, amount, method],
    );

  const receiveSplit = (orderId: string, cash: number, bank: number) =>
    svc<{ r: Json }>(
      `SELECT public.receive_purchase_order_with_split_payment($1, $2, $3, $4, $5, now(), NULL, NULL) AS r`,
      [orderId, users.cashier, BRANCH_ID, cash, bank],
    );

  const pay = (orderId: string, amount: number, method: "CASH" | "BANK") =>
    svc<{ r: Json }>(
      `SELECT public.record_purchase_payment($1, $2, $3, $4, now(), $5, NULL, NULL) AS r`,
      [orderId, users.cashier, BRANCH_ID, amount, method],
    );

  const order = async (total: number) => {
    const product = await createProduct(db, { stock: 0 });
    const created = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: total }] });
    return { ...created, variantId: product.variantId };
  };

  const state = async (orderId: string, variantId: string) => ({
    status: (await db.query<{ s: string }>(`SELECT status AS s FROM public.purchase_orders WHERE id = $1`, [orderId])).rows[0].s,
    stock: num((await db.query<{ q: string }>(`SELECT "stockQuantity" AS q FROM public.product_variants WHERE id = $1`, [variantId])).rows[0].q),
    payments: (await db.query(`SELECT 1 FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId])).rows.length,
    journals: (await db.query(`SELECT 1 FROM public.journal_entries WHERE purchase_order_id = $1`, [orderId])).rows.length,
  });

  return { svc, balance, exchanges, receiveAndPay, receiveSplit, pay, order, state };
}

describe("purchase payments: automatic exchange of the USD shortfall (20261119_01)", () => {
  it("200$ + 5,000,000 SDG, pay 500$ at 9,800 → 2,940,000 SDG converted, 500$ paid, USD 0, SDG 2,060,000", async () => {
    const { db, users } = await setup(9800);
    const h = helpers(db, users);
    await fundAccount(db, "CASH", 200, "USD");
    await fundAccount(db, "CASH", 5_000_000, "SDG");
    const po = await h.order(500);

    const { rows } = await h.receiveAndPay(po.orderId, 500, "CASH");
    assert.equal(rows[0].r.status, "RECEIVED");

    assert.equal(await h.balance("CASH", "USD"), 0);
    assert.equal(await h.balance("CASH", "SDG"), 2_060_000);

    const fx = await h.exchanges();
    assert.equal(fx.length, 2);
    const out = fx.find((row) => row.entry_number.endsWith("-OUT"))!;
    const inn = fx.find((row) => row.entry_number.endsWith("-IN"))!;
    assert.deepEqual([out.currency, num(out.amount), out.debit_account, out.credit_account], ["SDG", 2_940_000, "CURRENCY_EXCHANGE", "CASH"]);
    assert.deepEqual([inn.currency, num(inn.amount), inn.debit_account, inn.credit_account], ["USD", 300, "CASH", "CURRENCY_EXCHANGE"]);
    assert.equal(out.reference, inn.reference);
    assert.match(out.description, new RegExp(`^تحويل تلقائي لدفع أمر الشراء ${po.orderNumber} `));

    const conversions = rows[0].r.conversions as Json[];
    assert.equal(conversions.length, 1);
    assert.equal(num(conversions[0].sdg_amount), 2_940_000);
    assert.equal(num(conversions[0].usd_amount), 300);

    const paid = await db.query<{ t: string }>(`SELECT sum(amount) AS t FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [po.orderId]);
    assert.equal(num(paid.rows[0].t), 500);
    await db.close();
  });

  it("enough USD → no exchange", async () => {
    const { db, users } = await setup();
    const h = helpers(db, users);
    await fundAccount(db, "CASH", 600, "USD");
    await fundAccount(db, "CASH", 5_000_000, "SDG");
    const po = await h.order(500);

    const { rows } = await h.receiveAndPay(po.orderId, 500, "CASH");
    assert.deepEqual(rows[0].r.conversions, []);
    assert.equal((await h.exchanges()).length, 0);
    assert.equal(await h.balance("CASH", "USD"), 100);
    assert.equal(await h.balance("CASH", "SDG"), 5_000_000);
    await db.close();
  });

  it("USD and SDG together are not enough → refused: no stock, no entry, no exchange", async () => {
    const { db, users } = await setup(9800);
    const h = helpers(db, users);
    await fundAccount(db, "CASH", 200, "USD");
    await fundAccount(db, "CASH", 980_000, "SDG"); // = 100$
    const po = await h.order(500);

    assert.equal(
      await rpcError(h.receiveAndPay(po.orderId, 500, "CASH")),
      "رصيد الخزينة غير كافٍ: المتاح 200.00$ و 980000.00 ج.س (= 100.00$)، والمطلوب 500.00$.",
    );
    assert.deepEqual(await h.state(po.orderId, po.variantId), { status: "APPROVED", stock: 0, payments: 0, journals: 0 });
    assert.equal((await h.exchanges()).length, 0);
    assert.equal(await h.balance("CASH", "USD"), 200);
    assert.equal(await h.balance("CASH", "SDG"), 980_000);
    await db.close();
  });

  it("split payment: each account is computed separately; one short account refuses everything", async () => {
    const { db, users } = await setup(9800);
    const h = helpers(db, users);
    await fundAccount(db, "CASH", 100, "USD");
    await fundAccount(db, "CASH", 1_960_000, "SDG"); // = 200$
    await fundAccount(db, "BANK", 300, "USD");
    await fundAccount(db, "BANK", 9_800_000, "SDG");

    // الخزينة: 250 (ناقص 150 → 1,470,000 ج.س)، البنك: 200 (يكفي بالدولار → لا تحويل)
    const po = await h.order(450);
    const { rows } = await h.receiveSplit(po.orderId, 250, 200);
    assert.equal(rows[0].r.status, "RECEIVED");
    const conversions = rows[0].r.conversions as Json[];
    assert.deepEqual(conversions.map((c) => [c.account, num(c.usd_amount), num(c.sdg_amount)]), [["CASH", 150, 1_470_000]]);
    assert.equal(await h.balance("CASH", "USD"), 0);
    assert.equal(await h.balance("CASH", "SDG"), 490_000);
    assert.equal(await h.balance("BANK", "USD"), 100);
    assert.equal(await h.balance("BANK", "SDG"), 9_800_000);

    // الخزينة الآن 0$ و 490,000 ج.س (= 50$): جزء الخزينة 60 لا يُغطى → رفض الكل، والبنك لا يُحوَّل
    const short = await h.order(160);
    const fxBefore = (await h.exchanges()).length;
    assert.equal(
      await rpcError(h.receiveSplit(short.orderId, 60, 100)),
      "رصيد الخزينة غير كافٍ: المتاح 0.00$ و 490000.00 ج.س (= 50.00$)، والمطلوب 60.00$.",
    );
    assert.deepEqual(await h.state(short.orderId, short.variantId), { status: "APPROVED", stock: 0, payments: 0, journals: 0 });
    assert.equal((await h.exchanges()).length, fxBefore);
    assert.equal(await h.balance("BANK", "USD"), 100);
    await db.close();
  });

  it("later supplier payments (single and split) convert the shortfall too", async () => {
    const { db, users } = await setup(9800);
    const h = helpers(db, users);
    await fundAccount(db, "BANK", 50, "USD");
    await fundAccount(db, "BANK", 9_800_000, "SDG");
    await fundAccount(db, "CASH", 1_000_000, "SDG");

    const po = await h.order(400);
    await h.svc(`SELECT public.receive_purchase_order($1, $2, $3)`, [po.orderId, users.admin, BRANCH_ID]);

    await h.pay(po.orderId, 150, "BANK"); // ناقص 100 → 980,000 ج.س
    assert.equal(await h.balance("BANK", "USD"), 0);
    assert.equal(await h.balance("BANK", "SDG"), 8_820_000);

    const { rows } = await h.svc<{ r: Json }>(
      `SELECT public.record_purchase_payment_split($1, $2, $3, 50, 100, now(), NULL, NULL) AS r`,
      [po.orderId, users.cashier, BRANCH_ID],
    );
    const conversions = rows[0].r.conversions as Json[];
    assert.deepEqual(
      conversions.map((c) => [c.account, num(c.usd_amount), num(c.sdg_amount)]),
      [
        ["CASH", 50, 490_000],
        ["BANK", 100, 980_000],
      ],
    );
    assert.equal(await h.balance("CASH", "SDG"), 510_000);
    assert.equal(await h.balance("BANK", "SDG"), 7_840_000);

    const paid = await db.query<{ t: string }>(`SELECT sum(amount) AS t FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [po.orderId]);
    assert.equal(num(paid.rows[0].t), 300);
    await db.close();
  });

  it("anon and authenticated cannot call the exchange helper", async () => {
    const { db, users } = await setup();
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(
        asRole(db, role, () => db.query(`SELECT public.ensure_purchase_payment_usd($1, $2, 'CASH', 1, 'PO-1')`, [BRANCH_ID, users.admin])),
        /permission denied/,
      );
    }
    await db.close();
  });
});

/**
 * 20261010_05_opening_balances on the REAL live schema, after the full release
 * sequence, called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import { computeBalances, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import {
  BRANCH_ID,
  M,
  RATE,
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
  sql,
  type Users,
} from "./db-harness";

after(releaseTemplate);

type Payload = {
  cash?: { account: string; currency: string; amount: number }[];
  assets?: { name: string; category: string; currency: string; value: number; purchaseDate?: string }[];
  supplierDebts?: { supplierId: string; amount: number; reference?: string }[];
};

const today = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

async function supplier(db: PGliteInterface, name: string) {
  const id = randomUUID();
  await db.query(`INSERT INTO public.suppliers (id, name) VALUES ($1, $2)`, [id, name]);
  return id;
}

describe("opening balances (20261010_05)", () => {
  let db: PGliteInterface;
  let users: Users;
  let supplierA: string;
  let supplierB: string;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    supplierA = await supplier(db, "Supplier A");
    supplierB = await supplier(db, "Supplier B");
  });
  after(() => db.close());

  const run = (payload: Payload, { dryRun = true, userId = users.owner, asOf = today() } = {}) =>
    asRole(db, "service_role", () =>
      db.query<{ r: Record<string, unknown> }>(
        `SELECT public.record_opening_balances($1, $2, $3::date, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8) AS r`,
        [
          BRANCH_ID,
          userId,
          asOf,
          JSON.stringify(payload.cash ?? []),
          JSON.stringify(payload.assets ?? []),
          JSON.stringify(payload.supplierDebts ?? []),
          "test opening",
          dryRun,
        ],
      ),
    );

  const status = async () =>
    (
      await asRole(db, "service_role", () =>
        db.query<{ s: Record<string, unknown> }>(`SELECT public.get_opening_balances_status($1) AS s`, [BRANCH_ID]),
      )
    ).rows[0].s;

  const journalCount = async () => num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries`)).rows[0].n);

  it("validates caller, date and every line", async () => {
    const ok: Payload = { cash: [{ account: "CASH", currency: "USD", amount: 10 }] };
    assert.match(await rpcError(run(ok, { userId: users.admin })), /للمالك فقط/);
    assert.match(await rpcError(run(ok, { userId: users.inactiveAdmin })), /غير صالح لهذا الفرع/);
    assert.match(await rpcError(run(ok, { asOf: "2999-01-01" })), /في المستقبل/);
    assert.match(await rpcError(run({})), /رصيدًا واحدًا على الأقل/);
    assert.match(await rpcError(run({ cash: [{ account: "INVENTORY", currency: "USD", amount: 5 }] })), /الخزينة أو البنك/);
    assert.match(await rpcError(run({ cash: [{ account: "CASH", currency: "EUR", amount: 5 }] })), /العملة غير صالحة/);
    assert.match(await rpcError(run({ cash: [{ account: "CASH", currency: "USD", amount: 0 }] })), /أكبر من صفر/);
    assert.match(
      await rpcError(run({ cash: [{ account: "BANK", currency: "SDG", amount: 5 }, { account: "BANK", currency: "SDG", amount: 6 }] })),
      /مكرر/,
    );
    assert.match(await rpcError(run({ assets: [{ name: "X", category: "CAR", currency: "USD", value: 5 }] })), /تصنيف الأصل/);
    assert.match(
      await rpcError(run({ assets: [{ name: "X", category: "OTHER", currency: "USD", value: 5, purchaseDate: "2999-01-01" }] })),
      /بعد تاريخ الافتتاح/,
    );
    assert.match(await rpcError(run({ supplierDebts: [{ supplierId: randomUUID(), amount: 5 }] })), /المورد غير موجود/);
    assert.match(
      await rpcError(run({ supplierDebts: [{ supplierId: supplierA, amount: 5 }, { supplierId: supplierA, amount: 6 }] })),
      /مكرر/,
    );
    // no rate before 2020 in the test data → SDG lines cannot be converted
    assert.match(await rpcError(run({ cash: [{ account: "CASH", currency: "SDG", amount: 5 }] }, { asOf: "2019-06-01" })), /سعر صرف/);
  });

  it("dry run writes nothing and shows the entries and the capital effect", async () => {
    const before = await journalCount();
    const { rows } = await run({
      cash: [
        { account: "CASH", currency: "SDG", amount: 250_000 },
        { account: "BANK", currency: "USD", amount: 300 },
      ],
      assets: [{ name: "ماكينة خياطة", category: "MACHINE", currency: "USD", value: 400 }],
      supplierDebts: [{ supplierId: supplierA, amount: 150, reference: "فاتورة 17" }],
    });
    assert.equal(await journalCount(), before);
    const preview = rows[0].r;
    assert.equal(preview.dry_run, true);
    assert.equal((preview.entries as unknown[]).length, 4);
    // 250,000 SDG / 2500 = 100 + 300 + 400 − 150
    assert.equal(num(preview.capital_change_usd), 650);
    const assetsAfter = await db.query(`SELECT 1 FROM public.assets WHERE payment_method = 'OPENING'`);
    assert.equal(assetsAfter.rows.length, 0);
  });

  it("posts journal entries, the asset row and a payable opening purchase order — never INVENTORY", async () => {
    const { rows } = await run(
      {
        cash: [
          { account: "CASH", currency: "SDG", amount: 250_000 },
          { account: "BANK", currency: "USD", amount: 300 },
        ],
        assets: [{ name: "ماكينة خياطة", category: "MACHINE", currency: "USD", value: 400 }],
        supplierDebts: [{ supplierId: supplierA, amount: 150, reference: "فاتورة 17" }],
      },
      { dryRun: false },
    );
    assert.equal(rows[0].r.dry_run, false);
    assert.equal(num(rows[0].r.capital_change_usd), 650);

    const journals = await db.query<{ debit_account: string; credit_account: string; currency: string; amount: string; amount_usd: string; entry_type: string }>(
      `SELECT debit_account, credit_account, currency, amount, amount_usd, entry_type
       FROM public.journal_entries WHERE entry_number LIKE 'JE-OPENBAL-%' ORDER BY debit_account, currency`,
    );
    assert.deepEqual(
      journals.rows.map((row) => [row.entry_type, row.debit_account, row.credit_account, row.currency, num(row.amount), num(row.amount_usd)]),
      [
        ["CAPITAL", "ASSETS", "CAPITAL", "USD", 400, 400],
        ["CAPITAL", "BANK", "CAPITAL", "USD", 300, 300],
        ["CAPITAL", "CAPITAL", "SUPPLIERS", "USD", 150, 150],
        ["CAPITAL", "CASH", "CAPITAL", "SDG", 250_000, 100],
      ],
    );
    assert.ok(journals.rows.every((row) => row.debit_account !== "INVENTORY" && row.credit_account !== "INVENTORY"));

    const asset = await db.query<{ name: string; payment_method: string; purchase_value_usd: string }>(
      `SELECT name, payment_method, purchase_value_usd FROM public.assets WHERE payment_method = 'OPENING'`,
    );
    assert.deepEqual(asset.rows.map((row) => [row.name, num(row.purchase_value_usd)]), [["ماكينة خياطة", 400]]);

    const order = await db.query<{ status: string; purchase_type: string; total_amount: string; journal_entry_id: string | null; supplier_id: string }>(
      `SELECT status, purchase_type, total_amount, journal_entry_id, supplier_id FROM public.purchase_orders WHERE purchase_type = 'OPENING'`,
    );
    assert.equal(order.rows.length, 1);
    assert.equal(order.rows[0].status, "RECEIVED");
    assert.equal(num(order.rows[0].total_amount), 150);
    assert.ok(order.rows[0].journal_entry_id);

    // the dashboard / accounting numbers see it as cash, bank, assets, supplier debt and capital
    const ledger = (
      await db.query<LedgerEntry>(
        `SELECT amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at::text AS created_at
         FROM public.journal_entries WHERE branch_id = $1`,
        [BRANCH_ID],
      )
    ).rows;
    const balances = computeBalances(ledger, RATE) as unknown as Record<string, number>;
    assert.equal(balances.assets, 400);
    assert.equal(balances.supplierDebts, 150);
    assert.equal(balances.capital, 650);

    const s = await status();
    assert.equal(s.as_of, today());
    assert.equal((s.cash as unknown[]).length, 2);
    assert.equal((s.assets as unknown[]).length, 1);
    assert.deepEqual(
      (s.supplier_debts as { supplier_name: string; amount: number; paid: number }[]).map((d) => [d.supplier_name, num(d.amount), num(d.paid)]),
      [["Supplier A", 150, 0]],
    );
  });

  it("the opening supplier debt is paid from the normal purchase payment flow, capped at the debt", async () => {
    await fundAccount(db, "CASH", 1000, "USD");
    const orderId = (await db.query<{ id: string }>(`SELECT id FROM public.purchase_orders WHERE purchase_type = 'OPENING'`)).rows[0].id;
    const pay = (amount: number) =>
      asRole(db, "service_role", () =>
        db.query(`SELECT public.record_purchase_payment($1, $2, $3, $4, now(), 'CASH', NULL, NULL)`, [orderId, users.admin, BRANCH_ID, amount]),
      );
    await pay(100);
    assert.match(await rpcError(pay(60)), /أكبر من المبلغ المتبقي \(50\.00 \$\)/);
    await pay(50);
    const debts = (await status()).supplier_debts as { paid: number }[];
    assert.equal(num(debts[0].paid), 150);
  });

  it("a later batch keeps the date, refuses what is already recorded and accepts what was forgotten", async () => {
    assert.match(await rpcError(run({ cash: [{ account: "CASH", currency: "SDG", amount: 5 }] })), /مسجّل من قبل/);
    assert.match(await rpcError(run({ supplierDebts: [{ supplierId: supplierA, amount: 5 }] })), /مسجّل من قبل/);
    assert.match(await rpcError(run({ cash: [{ account: "CASH", currency: "USD", amount: 5 }] }, { asOf: "2025-01-01" })), /محدد من قبل/);

    await run(
      {
        cash: [{ account: "CASH", currency: "USD", amount: 20 }],
        assets: [{ name: "مكيف", category: "AIR_CONDITIONER", currency: "SDG", value: 500_000 }],
        supplierDebts: [{ supplierId: supplierB, amount: 40 }],
      },
      { dryRun: false },
    );
    const s = await status();
    assert.equal((s.cash as unknown[]).length, 3);
    assert.equal((s.assets as unknown[]).length, 2);
    assert.equal((s.supplier_debts as unknown[]).length, 2);
  });

  it("opening stock stays separate and is reported in the status", async () => {
    const product = await createProduct(db, { stock: 0 });
    await asRole(db, "service_role", () =>
      db.query(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL)`, [
        BRANCH_ID,
        users.owner,
        JSON.stringify([{ variantId: product.variantId, quantity: 4, unitCost: 5 }]),
      ]),
    );
    const s = await status();
    assert.deepEqual(s.opening_stock, { entries: 1, total_usd: 20 });
    const inventoryFromOpeningBalances = await db.query(
      `SELECT 1 FROM public.journal_entries WHERE entry_number LIKE 'JE-OPENBAL-%' AND 'INVENTORY' IN (debit_account, credit_account)`,
    );
    assert.equal(inventoryFromOpeningBalances.rows.length, 0);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

describe("opening balances on a past date", () => {
  it("dates every entry at the end of that day (Sudan time) and converts SDG at that day's rate", async () => {
    const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    const users = await seedBase(db);
    await asRole(db, "service_role", () =>
      db.query(
        `SELECT public.record_opening_balances($1, $2, '2025-12-31', '[{"account":"CASH","currency":"SDG","amount":5000}]'::jsonb, '[]', '[]', NULL, false)`,
        [BRANCH_ID, users.owner],
      ),
    );
    const { rows } = await db.query<{ local: string; amount_usd: string }>(
      `SELECT to_char((created_at AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM-DD HH24:MI:SS') AS local, amount_usd
       FROM public.journal_entries WHERE entry_number LIKE 'JE-OPENBAL-%'`,
    );
    assert.equal(rows[0].local, "2025-12-31 23:59:59");
    assert.equal(num(rows[0].amount_usd), 2);
    await db.close();
  });
});

describe("20261010_05 rollback", () => {
  it("drops the functions; keeps the widened constraints only while OPENING rows exist; grants nothing", async () => {
    const clean = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    await clean.exec(sql(M.openingBalancesRollback));
    await clean.exec(sql(M.openingBalancesRollback));
    const fn = await clean.query<{ f: string | null }>(`SELECT to_regprocedure('public.get_opening_balances_status(uuid)')::text AS f`);
    assert.equal(fn.rows[0].f, null);
    const check = await clean.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'purchase_orders_type_check'`,
    );
    assert.doesNotMatch(check.rows[0].def, /OPENING/);
    await clean.close();

    const used = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    const users = await seedBase(used);
    const supplierId = await supplier(used, "S");
    await asRole(used, "service_role", () =>
      used.query(
        `SELECT public.record_opening_balances($1, $2, current_date, '[]', '[]', $3::jsonb, NULL, false)`,
        [BRANCH_ID, users.owner, JSON.stringify([{ supplierId, amount: 10 }])],
      ),
    );
    await used.exec(sql(M.openingBalancesRollback));
    const kept = await used.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'purchase_orders_type_check'`,
    );
    assert.match(kept.rows[0].def, /OPENING/);
    const orders = await used.query(`SELECT 1 FROM public.purchase_orders WHERE purchase_type = 'OPENING'`);
    assert.equal(orders.rows.length, 1, "posted data is untouched");
    await used.close();
  });
});

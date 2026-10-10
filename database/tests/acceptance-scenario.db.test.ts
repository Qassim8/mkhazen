/**
 * Financial acceptance scenario (docs/financial-acceptance-test.md) run through the
 * REAL database functions on the live schema, after the release sequence and the
 * test-data reset. The expected numbers in the doc are the ones asserted here,
 * computed by the same ledger code the accounting page uses.
 * Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import { computeBalances, computePerformance, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import { BRANCH_ID, RELEASE_SEQUENCE, asRole, createLiveDb, num, releaseTemplate, runVerify, seedBase, sql } from "./db-harness";

const RESET = join(__dirname, "..", "maintenance", "reset_test_data.sql");
const RATE = 2500;

after(releaseTemplate);

describe("financial acceptance scenario", () => {
  let db: PGliteInterface;
  let owner: string;
  let cashier: string;
  let tailor: string;
  let supplierId: string;
  let shirt: string;
  let fabric: string;
  let tailoringOrderId: string;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  async function snapshot() {
    const entries = (
      await db.query<LedgerEntry>(
        `SELECT amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at::text AS created_at
         FROM public.journal_entries WHERE branch_id = $1`,
        [BRANCH_ID],
      )
    ).rows;
    const b = computeBalances(entries, RATE);
    const p = computePerformance(entries);
    const stock = Object.fromEntries(
      (await db.query<{ id: string; s: string }>(`SELECT id, "stockQuantity" AS s FROM public.product_variants`)).rows.map((r) => [r.id, num(r.s)]),
    );
    return {
      cashSdg: b.cashSdg, cashUsd: b.cashUsd, bankSdg: b.bankSdg, bankUsd: b.bankUsd,
      liquidityUsd: b.totalLiquidityUsd, capital: b.capital, assets: b.assets, inventory: b.inventory,
      wip: b.workInProgress, supplierDebts: b.supplierDebts, customerAdvances: b.customerAdvances,
      tailorsPayable: b.tailorsPayable, revenue: p.revenue, cogs: p.cogs, grossProfit: p.grossProfit,
      expenses: p.expenses, netProfit: p.netProfit,
      shirtStock: stock[shirt] ?? 0, fabricStock: stock[fabric] ?? 0,
    };
  }

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    const seeded = await seedBase(db);
    // old test data that the reset must remove
    await db.query(`INSERT INTO public.suppliers (name) VALUES ('old test supplier')`);
    await db.query(
      `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
       VALUES ('JE-OLD', $1, 'CAPITAL', 99, 'CASH', 'CAPITAL', 'USD')`,
      [BRANCH_ID],
    );
    owner = seeded.owner;
  });
  after(() => db.close());

  it("0. reset keeps only the owner, removes everything else, keeps the hardened ACL", async () => {
    await db.exec(sql(RESET));
    const users = await db.query<{ id: string; role: string }>(`SELECT id, role::text AS role FROM public.users`);
    assert.deepEqual(users.rows.map((u) => u.id), [owner]);
    for (const table of ["journal_entries", "suppliers", "exchange_rates", "product_variants", "assets", "purchase_orders"]) {
      assert.equal(num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n), 0, table);
    }
    assert.equal(num((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.branches`)).rows[0].n), 2, "branches kept");
    assert.deepEqual((await runVerify(db)).failed, []);

    // setup the owner would do from the UI: rate, staff, supplier, 2 products (stock 0)
    await db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, now() - interval '1 minute')`, [BRANCH_ID, RATE]);
    const staff = async (role: string) => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO public.users (id, name, email, password, role, "branchId") VALUES ($1, $2, $3, 'x', $4::public."Role", $5)`,
        [id, role, `${role}-${id.slice(0, 6)}@shop.test`, role, BRANCH_ID],
      );
      return id;
    };
    cashier = await staff("cashier");
    tailor = await staff("tailor");
    supplierId = randomUUID();
    await db.query(`INSERT INTO public.suppliers (id, name) VALUES ($1, 'مورد الأقمشة')`, [supplierId]);
    const product = async (name: string, unit: string, price: number) => {
      const t = randomUUID();
      const v = randomUUID();
      await db.query(`INSERT INTO public.product_templates (id, name, "sellingUnit", "conversionFactor") VALUES ($1, $2, $3, 1)`, [t, name, unit]);
      await db.query(`INSERT INTO public.product_variants (id, "templateId", "sellingPrice", "minStockLevel") VALUES ($1, $2, $3, 0)`, [v, t, price]);
      return v;
    };
    shirt = await product("قميص", "قطعة", 20);
    fabric = await product("قماش", "متر", 10);
  });

  it("1. opening balances", async () => {
    await svc(
      `SELECT public.record_opening_balances($1, $2, current_date, $3::jsonb, $4::jsonb, $5::jsonb, NULL, false)`,
      [
        BRANCH_ID,
        owner,
        JSON.stringify([
          { account: "CASH", currency: "SDG", amount: 1_000_000 },
          { account: "CASH", currency: "USD", amount: 500 },
          { account: "BANK", currency: "SDG", amount: 500_000 },
          { account: "BANK", currency: "USD", amount: 1_000 },
        ]),
        JSON.stringify([{ name: "ماكينة خياطة", category: "MACHINE", currency: "USD", value: 600 }]),
        JSON.stringify([{ supplierId, amount: 300 }]),
      ],
    );
    assert.deepEqual(await snapshot(), {
      cashSdg: 1_000_000, cashUsd: 500, bankSdg: 500_000, bankUsd: 1_000,
      liquidityUsd: 2_100, capital: 2_400, assets: 600, inventory: 0, wip: 0,
      supplierDebts: 300, customerAdvances: 0, tailorsPayable: 0,
      revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0, shirtStock: 0, fabricStock: 0,
    });
  });

  it("2. opening stock: 10 shirts × $8, 50 m fabric × $4", async () => {
    await svc(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL)`, [
      BRANCH_ID,
      owner,
      JSON.stringify([
        { variantId: shirt, quantity: 10, unitCost: 8 },
        { variantId: fabric, quantity: 50, unitCost: 4 },
      ]),
    ]);
    const s = await snapshot();
    assert.equal(s.inventory, 280);
    assert.equal(s.capital, 2_680);
    assert.equal(s.revenue, 0);
    assert.deepEqual([s.shirtStock, s.fabricStock], [10, 50]);
  });

  it("3. two POS sales: 2 shirts + 1 gift shirt (cash), 5 m fabric (bank transfer)", async () => {
    const checkout = (method: string, items: unknown[]) =>
      svc(
        `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, $3, '[]'::jsonb, NULL, $4::jsonb, NULL)`,
        [BRANCH_ID, cashier, method, JSON.stringify(items)],
      );
    await checkout("CASH", [
      { variantId: shirt, quantity: 2, isGift: false },
      { variantId: shirt, quantity: 1, isGift: true },
    ]);
    await checkout("BANK_TRANSFER", [{ variantId: fabric, quantity: 5, isGift: false }]);
    const s = await snapshot();
    assert.deepEqual(
      [s.cashSdg, s.bankSdg, s.revenue, s.cogs, s.grossProfit, s.expenses, s.netProfit, s.inventory, s.shirtStock, s.fabricStock],
      [1_100_000, 625_000, 90, 36, 54, 8, 46, 236, 7, 45],
    );
  });

  it("4a. tailoring order: 150,000 SDG, deposit 75,000 cash, 3 m shop fabric, tailor cost 25,000 SDG", async () => {
    const { rows } = await svc<{ r: { id: string } }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', 'أحمد', '0912345678', $5::jsonb, current_date, current_date + 7,
              $4, 3, 150000, 75000, 25000, 'CASH', NULL, 'جلابية', NULL, NULL) AS r`,
      [BRANCH_ID, owner, tailor, fabric, JSON.stringify([
        { label: "الطول", value: 150, unit: "CM" },
        { label: "الكم", value: 60, unit: "CM" },
      ])],
    );
    tailoringOrderId = rows[0].r.id;
    const s = await snapshot();
    assert.deepEqual([s.cashSdg, s.customerAdvances, s.revenue, s.fabricStock], [1_175_000, 30, 90, 45]);
  });

  it("4b. start tailoring: fabric leaves stock once (inventory → work in progress)", async () => {
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'UNDER_TAILORING')`, [tailoringOrderId, BRANCH_ID, owner]);
    const s = await snapshot();
    assert.deepEqual([s.fabricStock, s.inventory, s.wip, s.revenue], [42, 224, 12, 90]);
  });

  it("4c. ready + pickup (remaining 75,000 cash): revenue, cost and profit recognised", async () => {
    await svc(`SELECT public.update_tailoring_status($1, $2, $3, 'READY_FOR_PICKUP')`, [tailoringOrderId, BRANCH_ID, owner]);
    await svc(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH')`, [tailoringOrderId, BRANCH_ID, owner]);
    const s = await snapshot();
    assert.deepEqual(
      [s.cashSdg, s.customerAdvances, s.wip, s.tailorsPayable, s.revenue, s.cogs, s.grossProfit, s.netProfit],
      [1_250_000, 0, 0, 10, 150, 58, 92, 84],
    );
  });

  it("4d. pay the tailor 25,000 SDG cash", async () => {
    await svc(`SELECT public.pay_tailor_payment($1, $2, $3, $4, 25000, 'CASH', NULL, 'SDG')`, [BRANCH_ID, owner, tailor, tailoringOrderId]);
    const s = await snapshot();
    assert.deepEqual([s.cashSdg, s.tailorsPayable, s.netProfit], [1_225_000, 0, 84]);
  });

  it("5. electricity bill 20,000 SDG cash; 6. pay supplier $100 cash", async () => {
    await db.query(
      `INSERT INTO public.journal_entries (entry_number, branch_id, created_by, entry_type, amount, debit_account, credit_account, currency, description)
       VALUES ('JE-EXP-1', $1, $2, 'EXPENSE', 20000, 'UTILITIES', 'CASH', 'SDG', 'فاتورة كهرباء')`,
      [BRANCH_ID, owner],
    );
    const debt = (await db.query<{ id: string }>(`SELECT id FROM public.purchase_orders WHERE purchase_type = 'OPENING'`)).rows[0].id;
    await svc(`SELECT public.record_purchase_payment($1, $2, $3, 100, now(), 'CASH', NULL, NULL)`, [debt, owner, BRANCH_ID]);

    const final = await snapshot();
    assert.deepEqual(final, {
      cashSdg: 1_205_000, cashUsd: 400, bankSdg: 625_000, bankUsd: 1_000,
      liquidityUsd: 2_132, capital: 2_680, assets: 600, inventory: 224, wip: 0,
      supplierDebts: 200, customerAdvances: 0, tailorsPayable: 0,
      revenue: 150, cogs: 58, grossProfit: 92, expenses: 16, netProfit: 76,
      shirtStock: 7, fabricStock: 42,
    });
    if (process.env.PRINT_JOURNAL) {
      const journal = await db.query(
        `SELECT entry_number, entry_type, debit_account, credit_account, amount, currency, amount_usd
         FROM public.journal_entries ORDER BY created_at, entry_number`,
      );
      console.log(JSON.stringify(journal.rows));
    }
    // balance check: assets side = liabilities + capital + profit
    assert.equal(final.liquidityUsd + final.assets + final.inventory, final.supplierDebts + final.capital + final.netProfit);
  });
});

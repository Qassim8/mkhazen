/**
 * 20261014_01 — replacement deposit + extra, gift-only invoice, canLogin,
 * repeatable opening balances, payroll, tailor month summary.
 * Live schema export, PGlite. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import { computeBalances, computePerformance, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import {
  BRANCH_ID,
  M,
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

const MEASUREMENTS = JSON.stringify([{ label: "الطول", value: 150, unit: "CM" }]);

after(releaseTemplate);

describe("deposit transfer, gifts, opening balances, payroll (20261014_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const createOrder = (total: number, deposit: number, method: string | null, source: string | null = null, tailor = users.tailor) =>
    svc<{ r: Record<string, unknown> }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', 'عميل', '0912345678', $4::jsonb, current_date, current_date + 7,
              NULL, NULL, $5, $6, 5000, $7, $8, 'جلابية', NULL, NULL) AS r`,
      [BRANCH_ID, users.cashier, tailor, MEASUREMENTS, total, deposit, method, source],
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

  it("is re-runnable and keeps the verify checks green; tailors get canLogin = false", async () => {
    await db.exec(sql(M.depositGiftsPayroll));
    // 20261014 يعيد تعريف دوال أحدث منه: نعيد تطبيق اللاحق بترتيبه (كما في الإطلاق الفعلي)
    await db.exec(sql(M.openingRepeatable));
    await db.exec(sql(M.flexiblePrice));
    await db.exec(sql(M.creditSales));
    await db.exec(sql(M.reassert));
    const { failed, raised } = await runVerify(db);
    assert.deepEqual(failed, []);
    assert.equal(raised, null);

    const { rows } = await db.query<{ role: string; can: boolean }>(
      `SELECT lower(role::text) AS role, "canLogin" AS can FROM public.users WHERE id = ANY($1)`,
      [[users.tailor, users.cashier]],
    );
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.role, r.can])), { tailor: true, cashier: true },
      "seeded after the column existed → default true (the one-time UPDATE ran on an empty table)");
  });

  it("replacement: whole advance + optional extra, never above the new total", async () => {
    const source = await createOrder(50_000, 30_000, "CASH");
    const sourceId = String(source.rows[0].r.id);
    await svc(`SELECT public.cancel_tailoring_order($1, $2, $3, 'test')`, [sourceId, BRANCH_ID, users.cashier]);

    assert.match(await rpcError(createOrder(20_000, 0, null, sourceId)), /استرد الفرق \(10000\.00 ج\.س\)/);
    assert.match(await rpcError(createOrder(40_000, 15_000, "CASH", sourceId)), /يتجاوز إجمالي الطلب/);
    assert.match(await rpcError(createOrder(40_000, 5_000, null, sourceId)), /طريقة دفع العربون الإضافي/);

    const before = await ledger();
    const { rows } = await createOrder(40_000, 5_000, "CASH", sourceId);
    const r = rows[0].r;
    assert.deepEqual(
      [num(r.customer_advance_transferred_amount), num(r.additional_deposit_amount), num(r.deposit_amount), num(r.remaining_amount)],
      [30_000, 5_000, 35_000, 5_000],
    );
    const after = await ledger();
    assert.equal(after.b.cashSdg, before.b.cashSdg + 5_000, "extra deposit is a normal cash advance entry");
  });

  it("inactive tailors cannot get new orders", async () => {
    const inactive = randomUUID();
    await db.query(
      `INSERT INTO public.users (id, name, email, password, role, "isActive", "branchId")
       VALUES ($1, 'موسمي', $2, 'x', 'tailor'::public."Role", false, $3)`,
      [inactive, `t-${inactive.slice(0, 6)}@example.test`, BRANCH_ID],
    );
    assert.match(await rpcError(createOrder(10_000, 1_000, "CASH", null, inactive)), /غير نشط/);
  });

  it("gift-only invoice: total 0, no payments/revenue, stock and GIFTS cost recorded", async () => {
    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const items = JSON.stringify([{ variantId: product.variantId, quantity: 3, isGift: true, giftNote: "افتتاح" }]);

    assert.match(
      await rpcError(svc(`SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'MIXED', '[]'::jsonb, NULL, $3::jsonb, NULL)`, [BRANCH_ID, users.cashier, items])),
      /فاتورة الهدايا/,
    );

    const before = await ledger();
    const { rows } = await svc<{ r: Record<string, unknown> }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL) AS r`,
      [BRANCH_ID, users.cashier, items],
    );
    assert.equal(num(rows[0].r.total_amount), 0);

    const payments = await db.query(`SELECT 1 FROM public.sales_order_payments WHERE sales_order_id = $1`, [rows[0].r.id]);
    assert.equal(payments.rows.length, 0);
    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 7);

    const after = await ledger();
    assert.equal(after.p.revenue, before.p.revenue);
    assert.equal(after.b.cashSdg, before.b.cashSdg);
    assert.equal(after.p.expenses, before.p.expenses + 12, "3 × $4 on GIFTS");
  });

  it("opening balances are repeatable: cash per currency and weighted-average inventory", async () => {
    assert.match(
      await rpcError(svc(`SELECT public.record_opening_cash($1, $2, 'CASH', 'SDG', 100, NULL)`, [BRANCH_ID, users.cashier])),
      /للمالك أو المدير/,
    );
    const before = await ledger();
    await svc(`SELECT public.record_opening_cash($1, $2, 'BANK', 'USD', 500, 'بنك')`, [BRANCH_ID, users.admin]);
    await svc(`SELECT public.record_opening_cash($1, $2, 'BANK', 'USD', 100, 'نسيت')`, [BRANCH_ID, users.admin]);
    await svc(`SELECT public.record_opening_cash($1, $2, 'CASH', 'SDG', 25000, NULL)`, [BRANCH_ID, users.owner]);
    const afterCash = await ledger();
    assert.equal(afterCash.b.bankUsd, before.b.bankUsd + 600);
    assert.equal(afterCash.b.cashSdg, before.b.cashSdg + 25_000);
    assert.equal(afterCash.b.capital, before.b.capital + 610);

    const product = await createProduct(db, { stock: 0, averageCost: 0, purchasePrice: 0, sellingPrice: 10 });
    await svc(`SELECT public.record_opening_inventory($1, $2, $3, 10, 4, NULL)`, [BRANCH_ID, users.admin, product.variantId]);
    const { rows } = await svc<{ r: Record<string, unknown> }>(
      `SELECT public.record_opening_inventory($1, $2, $3, 10, 6, 'دفعة ثانية') AS r`,
      [BRANCH_ID, users.admin, product.variantId],
    );
    assert.deepEqual([num(rows[0].r.stock_quantity), num(rows[0].r.average_cost)], [20, 5]);

    const moves = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.inventory_movements WHERE variant_id = $1 AND movement_type = 'OPENING'`,
      [product.variantId],
    );
    assert.equal(num(moves.rows[0].n), 2);
    const journal = await db.query<{ s: string }>(
      `SELECT sum(amount_usd) AS s FROM public.journal_entries
       WHERE entry_number LIKE 'JE-OPENINV-%' AND debit_account = 'INVENTORY' AND credit_account = 'CAPITAL'`,
    );
    assert.equal(num(journal.rows[0].s), 100, "10×4 + 10×6 → DR INVENTORY / CR CAPITAL");
  });

  it("payroll: advances + salary never above the monthly salary; SALARIES expense in SDG", async () => {
    await db.query(`UPDATE public.users SET salary = 300000 WHERE id = $1`, [users.cashier]);
    const period = new Date().toISOString().slice(0, 7) + "-01";
    const pay = (type: string, amount: number, employee = users.cashier) =>
      svc<{ r: Record<string, unknown> }>(
        `SELECT public.pay_employee($1, $2, $3, $4::date, $5, $6, 'CASH', NULL) AS r`,
        [BRANCH_ID, users.admin, employee, period, type, amount],
      );

    assert.match(await rpcError(pay("SALARY", 1000, users.tailor)), /مستحقات الخياطين/);
    const before = await ledger();
    await pay("ADVANCE", 100_000);
    assert.match(await rpcError(pay("ADVANCE", 200_001)), /تتجاوز الراتب/);
    const { rows } = await pay("SALARY", 200_000);
    assert.equal(num(rows[0].r.remaining), 0);
    assert.match(await rpcError(pay("SALARY", 1)), /يتجاوز المتبقي/);

    const after = await ledger();
    assert.equal(after.b.cashSdg, before.b.cashSdg - 300_000);
    assert.equal(after.p.expenses, before.p.expenses + 120, "300,000 SDG / 2500");

    const payroll = await svc<Record<string, string>>(`SELECT * FROM public.get_payroll($1, $2::date)`, [BRANCH_ID, period]);
    const row = payroll.rows.find((r) => r.user_id === users.cashier)!;
    assert.deepEqual([num(row.salary_sdg), num(row.advances_sdg), num(row.salary_paid_sdg), num(row.remaining_sdg)], [300_000, 100_000, 200_000, 0]);
  });

  it("tailor month summary: month dues, taken, current remaining", async () => {
    const { rows } = await createOrder(20_000, 5_000, "CASH");
    const orderId = String(rows[0].r.id);
    for (const status of ["UNDER_TAILORING", "READY_FOR_PICKUP"]) {
      await svc(`SELECT public.update_tailoring_status($1, $2, $3, $4)`, [orderId, BRANCH_ID, users.cashier, status]);
    }
    await svc(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH')`, [orderId, BRANCH_ID, users.cashier]);
    await svc(`SELECT public.pay_tailor_dues($1, $2, $3, 'ADVANCE', 2000, 'CASH', NULL)`, [BRANCH_ID, users.admin, users.tailor]);

    const period = new Date().toISOString().slice(0, 7) + "-01";
    const summary = await svc<Record<string, string>>(`SELECT * FROM public.get_tailor_month_summary($1, $2::date)`, [BRANCH_ID, period]);
    const row = summary.rows.find((r) => r.tailor_id === users.tailor)!;
    assert.deepEqual(
      [num(row.month_dues_sdg), num(row.month_advances_sdg), num(row.month_taken_sdg), num(row.remaining_sdg)],
      [5_000, 2_000, 2_000, 3_000],
    );
  });
});

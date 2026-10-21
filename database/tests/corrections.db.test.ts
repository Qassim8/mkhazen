/**
 * 20261020_01_manual_and_opening_stock_corrections on the REAL live schema,
 * after the full release sequence, called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  RATE,
  RELEASE_SEQUENCE,
  asRole,
  createProduct,
  createLiveDb,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  runVerify,
  seedBase,
  type Users,
} from "./db-harness";

after(releaseTemplate);

describe("correct_manual_journal_entry (20261020_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const capital = (amount: number, currency: "USD" | "SDG" = "USD", paymentMethod: "CASH" | "BANK" = "CASH") =>
    asRole(db, "service_role", () =>
      db.query<{ id: string }>(
        `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, description, reference, debit_account, credit_account, created_by, currency)
         VALUES ($1, $2, 'CAPITAL', $3, 'رأس مال', NULL, $4, 'CAPITAL', $5, $6) RETURNING id`,
        [`JE-${randomUUID().slice(0, 8)}`, BRANCH_ID, amount, paymentMethod, users.owner, currency],
      ),
    );

  const correct = (
    entryId: string,
    opts: {
      amount?: number;
      currency?: "USD" | "SDG";
      paymentMethod?: "CASH" | "BANK" | null;
      account?: string | null;
      description?: string;
      reference?: string | null;
      notes?: string | null;
      userId?: string;
    } = {},
  ) =>
    asRole(db, "service_role", () =>
      db.query<{ r: Record<string, unknown> }>(
        `SELECT public.correct_manual_journal_entry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS r`,
        [
          BRANCH_ID,
          opts.userId ?? users.owner,
          entryId,
          opts.amount ?? 50,
          opts.currency ?? "USD",
          opts.paymentMethod === undefined ? "CASH" : opts.paymentMethod,
          opts.account ?? null,
          opts.description ?? "تصحيح",
          opts.reference ?? null,
          opts.notes ?? null,
        ],
      ),
    );

  it("rejects non-owner/admin, non-manual entry types, and correcting a reversal", async () => {
    const { rows } = await capital(100);
    const entryId = rows[0].id;

    assert.match(await rpcError(correct(entryId, { userId: users.cashier })), /للمالك أو المدير/);

    const sale = await asRole(db, "service_role", () =>
      db.query<{ id: string }>(
        `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
         VALUES ($1, $2, 'SALE', 10, 'CASH', 'SALES', 'USD') RETURNING id`,
        [`JE-${randomUUID().slice(0, 8)}`, BRANCH_ID],
      ),
    );
    assert.match(await rpcError(correct(sale.rows[0].id)), /للقيود اليدوية/);

    const result = (await correct(entryId)).rows[0].r;
    const reversalId = result.reversal_entry_id as string;
    assert.match(await rpcError(correct(reversalId)), /قيد عكسي/);
  });

  it("USD CAPITAL: reversal cancels the original exactly, the new entry carries the right value", async () => {
    const balanceOf = async (account: "CASH" | "BANK") =>
      num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, $2, 'USD') AS b`, [BRANCH_ID, account])).rows[0].b);

    const cashBefore = await balanceOf("CASH");
    const bankBefore = await balanceOf("BANK");

    const { rows } = await capital(1000, "USD", "CASH");
    const entryId = rows[0].id;

    const { rows: resultRows } = await correct(entryId, { amount: 300, paymentMethod: "BANK" });
    const result = resultRows[0].r;

    const entries = await db.query<{
      id: string;
      amount: string;
      amount_usd: string;
      debit_account: string;
      credit_account: string;
      correction_of_id: string | null;
      is_correction_reversal: boolean;
    }>(
      `SELECT id, amount, amount_usd, debit_account, credit_account, correction_of_id, is_correction_reversal
       FROM public.journal_entries WHERE id IN ($1, $2, $3)`,
      [entryId, result.reversal_entry_id, result.new_entry_id],
    );
    const byId = new Map(entries.rows.map((row) => [row.id, row]));

    const reversal = byId.get(result.reversal_entry_id as string)!;
    assert.equal(num(reversal.amount), 1000);
    assert.equal(num(reversal.amount_usd), 1000);
    assert.equal(reversal.debit_account, "CAPITAL");
    assert.equal(reversal.credit_account, "CASH");
    assert.equal(reversal.correction_of_id, entryId);
    assert.equal(reversal.is_correction_reversal, true);

    const fresh = byId.get(result.new_entry_id as string)!;
    assert.equal(num(fresh.amount), 300);
    assert.equal(fresh.debit_account, "BANK");
    assert.equal(fresh.credit_account, "CAPITAL");
    assert.equal(fresh.correction_of_id, entryId);
    assert.equal(fresh.is_correction_reversal, false);

    // original row untouched
    const original = byId.get(entryId)!;
    assert.equal(num(original.amount), 1000);

    // original CASH+1000 is fully cancelled by the reversal; only the new
    // BANK+300 entry remains (deltas, since the shared db carries state from
    // earlier tests in this describe block)
    assert.equal(await balanceOf("BANK"), bankBefore + 300);
    assert.equal(await balanceOf("CASH"), cashBefore);
  });

  it("SDG entry: the reversal pins currency/rate/amount_usd from the original even if the rate changed since", async () => {
    const { rows } = await capital(100_000, "SDG", "CASH");
    const entryId = rows[0].id;
    const original = await db.query<{ amount_usd: string; exchange_rate_used: string }>(
      `SELECT amount_usd, exchange_rate_used FROM public.journal_entries WHERE id = $1`,
      [entryId],
    );
    assert.equal(num(original.rows[0].amount_usd), 100_000 / RATE);

    // rate changes after the original entry was posted
    await db.query(
      `INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, now())`,
      [BRANCH_ID, RATE * 2],
    );

    const { rows: resultRows } = await correct(entryId, { amount: 50_000, currency: "SDG" });
    const result = resultRows[0].r;

    const reversal = await db.query<{ amount_usd: string; exchange_rate_used: string }>(
      `SELECT amount_usd, exchange_rate_used FROM public.journal_entries WHERE id = $1`,
      [result.reversal_entry_id],
    );
    // exact cancellation of the original, not today's rate
    assert.equal(num(reversal.rows[0].amount_usd), num(original.rows[0].amount_usd));
    assert.equal(num(reversal.rows[0].exchange_rate_used), RATE);

    const fresh = await db.query<{ amount_usd: string; exchange_rate_used: string }>(
      `SELECT amount_usd, exchange_rate_used FROM public.journal_entries WHERE id = $1`,
      [result.new_entry_id],
    );
    // the new entry is priced at today's (new) rate, like a fresh manual entry
    assert.equal(num(fresh.rows[0].exchange_rate_used), RATE * 2);
    assert.equal(num(fresh.rows[0].amount_usd), 50_000 / (RATE * 2));
  });

  it("EXPENSE: rejects SALARIES, checks balance after the reversal restores funds", async () => {
    const cashBalance = async () =>
      num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'CASH', 'USD') AS b`, [BRANCH_ID])).rows[0].b);

    await fundAccount(db, "CASH", 1000, "USD");
    const expense = await asRole(db, "service_role", () =>
      db.query<{ id: string }>(
        `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
         VALUES ($1, $2, 'EXPENSE', 200, 'UTILITIES', 'CASH', 'USD') RETURNING id`,
        [`JE-${randomUUID().slice(0, 8)}`, BRANCH_ID],
      ),
    );
    const entryId = expense.rows[0].id;
    const balanceBeforeCorrection = await cashBalance();

    assert.match(
      await rpcError(correct(entryId, { account: "SALARIES", paymentMethod: "CASH" })),
      /الرواتب/,
    );

    // after reversing the 200 expense, cash balance is 1000 again; asking for 1200 must fail
    assert.match(
      await rpcError(correct(entryId, { amount: 1200, account: "UTILITIES", paymentMethod: "CASH" })),
      /الرصيد غير كافٍ/,
    );

    await correct(entryId, { amount: 500, account: "RENTS", paymentMethod: "CASH" });
    // reversal restores the 200 expense, the new entry takes 500
    assert.equal(await cashBalance(), balanceBeforeCorrection + 200 - 500);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

describe("correct_opening_stock_entry + list_opening_stock_corrections (20261020_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const recordOpening = (variantId: string, quantity: number, unitCost: number) =>
    asRole(db, "service_role", () =>
      db.query(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL)`, [
        BRANCH_ID,
        users.owner,
        JSON.stringify([{ variantId, quantity, unitCost }]),
      ]),
    );

  const correctStock = (
    variantId: string,
    quantity: number,
    unitCost: number,
    opts: { userId?: string; notes?: string | null } = {},
  ) =>
    asRole(db, "service_role", () =>
      db.query<{ r: Record<string, unknown> }>(
        `SELECT public.correct_opening_stock_entry($1,$2,$3,$4,$5,$6) AS r`,
        [BRANCH_ID, opts.userId ?? users.owner, variantId, quantity, unitCost, opts.notes ?? null],
      ),
    );

  it("lists only variants with exactly one OPENING_STOCK movement", async () => {
    const eligible = await createProduct(db, { stock: 0 });
    await recordOpening(eligible.variantId, 100, 10);

    const touched = await createProduct(db, { stock: 0 });
    await recordOpening(touched.variantId, 50, 4);
    await asRole(db, "service_role", () =>
      db.query(
        `INSERT INTO public.inventory_movements (movement_type, quantity, unit_cost, template_id, variant_id)
         VALUES ('SALE', 5, 4, $1, $2)`,
        [touched.templateId, touched.variantId],
      ),
    );

    const list = await asRole(db, "service_role", () =>
      db.query<{ variant_id: string }>(`SELECT variant_id FROM public.list_opening_stock_corrections()`),
    );
    const ids = list.rows.map((row) => row.variant_id);
    assert.ok(ids.includes(eligible.variantId));
    assert.ok(!ids.includes(touched.variantId));
  });

  it("rejects correction once another movement exists, and rejects a no-op", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordOpening(product.variantId, 500, 4);

    assert.match(await rpcError(correctStock(product.variantId, 500, 4)), /لا يوجد تغيير/);

    await asRole(db, "service_role", () =>
      db.query(
        `INSERT INTO public.inventory_movements (movement_type, quantity, unit_cost, template_id, variant_id)
         VALUES ('SALE', 5, 4, $1, $2)`,
        [product.templateId, product.variantId],
      ),
    );
    assert.match(await rpcError(correctStock(product.variantId, 50, 4)), /توجد حركات أخرى/);
  });

  it("quantity-only fix: reduces stock via ADJUSTMENT_OUT and posts a CAPITAL-side adjusting entry", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordOpening(product.variantId, 500, 4); // manager meant 50, typed 500

    const { rows } = await correctStock(product.variantId, 50, 4, { notes: "الكمية الصحيحة 50" });
    const result = rows[0].r;
    assert.equal(num(result.delta_value_usd), (50 - 500) * 4);

    const variant = await db.query<{ q: string; cost: string }>(
      `SELECT "stockQuantity" AS q, "averageCost" AS cost FROM public.product_variants WHERE id = $1`,
      [product.variantId],
    );
    assert.equal(num(variant.rows[0].q), 50);
    assert.equal(num(variant.rows[0].cost), 4);

    const movement = await db.query<{ movement_type: string; quantity: string }>(
      `SELECT movement_type, quantity FROM public.inventory_movements WHERE id = $1`,
      [result.movement_id],
    );
    assert.equal(movement.rows[0].movement_type, "ADJUSTMENT_OUT");
    assert.equal(num(movement.rows[0].quantity), 450);

    const journal = await db.query<{ debit_account: string; credit_account: string; amount: string; correction_of_id: string | null }>(
      `SELECT debit_account, credit_account, amount, correction_of_id FROM public.journal_entries WHERE id = $1`,
      [result.journal_entry_id],
    );
    assert.equal(journal.rows[0].debit_account, "CAPITAL");
    assert.equal(journal.rows[0].credit_account, "INVENTORY");
    assert.equal(num(journal.rows[0].amount), 1800);
    assert.ok(journal.rows[0].correction_of_id);

    // the original opening-stock journal entry this correction points at is untouched
    const original = await db.query<{ amount: string; is_correction_reversal: boolean }>(
      `SELECT amount, is_correction_reversal FROM public.journal_entries WHERE id = $1`,
      [journal.rows[0].correction_of_id],
    );
    assert.equal(num(original.rows[0].amount), 500 * 4);
    assert.equal(original.rows[0].is_correction_reversal, false);
  });

  it("quantity up + proportionally cheaper unit cost that cancels in value: movement posted, no journal entry", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordOpening(product.variantId, 10, 10); // value 100

    const { rows } = await correctStock(product.variantId, 20, 5); // still value 100
    const result = rows[0].r;
    assert.equal(num(result.delta_value_usd), 0);
    assert.ok(result.movement_id);
    assert.equal(result.journal_entry_id, null);

    const variant = await db.query<{ q: string; cost: string }>(
      `SELECT "stockQuantity" AS q, "averageCost" AS cost FROM public.product_variants WHERE id = $1`,
      [product.variantId],
    );
    assert.equal(num(variant.rows[0].q), 20);
    assert.equal(num(variant.rows[0].cost), 5);
  });

  it("unit-cost-only fix: no quantity movement row, journal entry for the value delta only", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordOpening(product.variantId, 10, 10); // value 100

    const { rows } = await correctStock(product.variantId, 10, 12); // value 120
    const result = rows[0].r;
    assert.equal(num(result.delta_value_usd), 20);
    assert.equal(result.movement_id, null);
    assert.ok(result.journal_entry_id);

    const journal = await db.query<{ debit_account: string; credit_account: string; amount: string }>(
      `SELECT debit_account, credit_account, amount FROM public.journal_entries WHERE id = $1`,
      [result.journal_entry_id],
    );
    assert.equal(journal.rows[0].debit_account, "INVENTORY");
    assert.equal(journal.rows[0].credit_account, "CAPITAL");
    assert.equal(num(journal.rows[0].amount), 20);
  });

  it("rejects non-owner/admin", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordOpening(product.variantId, 10, 10);
    assert.match(
      await rpcError(correctStock(product.variantId, 20, 10, { userId: users.cashier })),
      /للمالك أو المدير/,
    );
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

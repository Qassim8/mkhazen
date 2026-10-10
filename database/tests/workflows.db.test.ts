/**
 * Existing business RPCs keep working for service_role after the hardening
 * sequence (their bodies are NOT modified by any 20261010 migration).
 * Live schema export, PGlite. Run: npm run test:db
 *
 * Covers the owner-approved flows that must be preserved:
 *   • POS checkout incl. a gift line (complete_sales_checkout)
 *   • customer return = process_inventory_adjustment IN + negative amount
 *   • opening stock = record_opening_stock (DR INVENTORY / CR CAPITAL)
 * Tailoring RPCs are covered for privileges by verify.sql; their end-to-end
 * flow is a staging smoke test (docs/release-plan.md §5).
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
  createLiveDb,
  createProduct,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  seedBase,
  sqlState,
  type Users,
} from "./db-harness";

after(releaseTemplate);

type Journal = { entry_number: string; entry_type: string; debit_account: string; credit_account: string; amount: string; currency: string; amount_usd: string };

describe("existing RPCs after hardening (service_role)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const svc = <T,>(text: string, params: unknown[]) => asRole(db, "service_role", () => db.query<T>(text, params));

  const checkout = (cashierId: string, items: unknown[]) =>
    svc<{ r: Record<string, unknown> }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL) AS r`,
      [BRANCH_ID, cashierId, JSON.stringify(items)],
    );

  const adjust = (variantId: string, type: "IN" | "OUT", quantity: number, amount: number, method: string | null, entryNumber: string) =>
    svc<{ r: Record<string, unknown> }>(
      `SELECT public.process_inventory_adjustment($1, $2, $3, $4, NULL, $5, $6, $7, $8) AS r`,
      [variantId, users.admin, type, quantity, entryNumber, amount, method, BRANCH_ID],
    );

  it("POS checkout with a gift line: stock, movements, SDG revenue, USD COGS and GIFT entries", async () => {
    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const { rows } = await checkout(users.cashier, [
      { variantId: product.variantId, quantity: 2, isGift: false },
      { variantId: product.variantId, quantity: 1, isGift: true },
    ]);
    const order = rows[0].r;
    assert.equal(order.status, "COMPLETED");
    assert.equal(num(order.total_amount), 2 * 10 * RATE, "sellingPrice is USD × current rate");
    assert.equal(num(order.total_amount_usd), 20);

    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 7, "2 sold + 1 gift, deducted once");

    const movements = await db.query<{ movement_type: string; quantity: string }>(
      `SELECT movement_type, quantity FROM public.inventory_movements WHERE sales_order_id = $1 ORDER BY movement_type`,
      [order.id],
    );
    assert.deepEqual(movements.rows.map((row) => [row.movement_type, num(row.quantity)]), [["GIFT", 1], ["SALE", 2]]);

    const journals = await db.query<Journal>(
      `SELECT entry_number, entry_type, debit_account, credit_account, amount, currency, amount_usd
       FROM public.journal_entries WHERE entry_number LIKE $1 ORDER BY entry_number`,
      [`%${order.order_number}`],
    );
    assert.deepEqual(
      journals.rows.map((row) => [row.entry_type, row.debit_account, row.credit_account, num(row.amount), row.currency, num(row.amount_usd)]),
      [
        ["COGS", "COGS", "INVENTORY", 8, "USD", 8],
        ["GIFT", "GIFTS", "INVENTORY", 4, "USD", 4],
        ["SALE", "CASH", "SALES", 50000, "SDG", 20],
      ],
    );
  });

  it("checkout rolls back completely when stock is insufficient", async () => {
    const product = await createProduct(db, { stock: 1, averageCost: 4, sellingPrice: 10 });
    assert.match(await rpcError(checkout(users.cashier, [{ variantId: product.variantId, quantity: 2 }])), /المخزون غير كافٍ/);
    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 1);
  });

  it("FINDING (characterization): complete_sales_checkout does not validate p_cashier_id's role or branch", async () => {
    // A tailor and a user of another branch can be passed as cashier. Today this
    // is only reachable through the server (requirePermission("sales.pos")),
    // which is why revoking anon/authenticated EXECUTE is the critical fix.
    // When the DB check is added (decision D13 in docs/live-database-audit.md)
    // this test must be flipped.
    const product = await createProduct(db, { stock: 5, averageCost: 1, sellingPrice: 2 });
    const tailor = await checkout(users.tailor, [{ variantId: product.variantId, quantity: 1 }]);
    assert.equal(tailor.rows[0].r.status, "COMPLETED");
    const other = await checkout(users.otherBranchAdmin, [{ variantId: product.variantId, quantity: 1 }]);
    assert.equal(other.rows[0].r.status, "COMPLETED");
  });

  it("customer return (IN + negative amount): stock back, DR SALES / CR CASH in SDG, DR INVENTORY / CR COGS at average cost", async () => {
    await fundAccount(db, "CASH", 100_000, "SDG");
    const product = await createProduct(db, { stock: 3, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const entry = `ADJ-${randomUUID().slice(0, 8)}`;

    const { rows } = await adjust(product.variantId, "IN", 1, -25_000, "CASH", entry);
    assert.equal(num(rows[0].r.new_stock), 4);
    assert.equal(rows[0].r.movement_type, "ADJUSTMENT_IN");

    const journals = await db.query<Journal>(
      `SELECT entry_number, entry_type, debit_account, credit_account, amount, currency, amount_usd
       FROM public.journal_entries WHERE reference = $1 ORDER BY entry_number`,
      [entry],
    );
    assert.deepEqual(
      journals.rows.map((row) => [row.entry_number, row.entry_type, row.debit_account, row.credit_account, num(row.amount), row.currency]),
      [
        [`${entry}-COGS`, "COGS", "INVENTORY", "COGS", 4, "USD"],
        [`${entry}-RETURN`, "SALE", "SALES", "CASH", 25_000, "SDG"],
      ],
    );
    assert.equal(num(journals.rows[1].amount_usd), 10, "SDG converted at the current rate");
  });

  it("customer return is refused (and fully rolled back) when the SDG cash balance is insufficient", async () => {
    const product = await createProduct(db, { stock: 3, averageCost: 4, sellingPrice: 10 });
    const entry = `ADJ-${randomUUID().slice(0, 8)}`;
    assert.match(await rpcError(adjust(product.variantId, "IN", 1, -10_000_000, "BANK", entry)), /الرصيد غير كافٍ في البنك/);
    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 3);
    const movements = await db.query(`SELECT 1 FROM public.inventory_movements WHERE reference = $1`, [entry]);
    assert.equal(movements.rows.length, 0);
  });

  it("supplier return (OUT + positive amount) still posts DR CASH / CR INVENTORY", async () => {
    const product = await createProduct(db, { stock: 5, averageCost: 4, sellingPrice: 10 });
    const entry = `ADJ-${randomUUID().slice(0, 8)}`;
    await adjust(product.variantId, "OUT", 2, 8, "CASH", entry);
    const journals = await db.query<Journal>(
      `SELECT entry_number, entry_type, debit_account, credit_account, amount, currency, amount_usd FROM public.journal_entries WHERE reference = $1`,
      [entry],
    );
    assert.deepEqual(
      journals.rows.map((row) => [row.entry_type, row.debit_account, row.credit_account, num(row.amount), row.currency]),
      [["PURCHASE", "CASH", "INVENTORY", 8, "USD"]],
    );
  });

  it("record_opening_stock: one JE-OPEN entry DR INVENTORY / CR CAPITAL + OPENING_STOCK movements; refuses a second opening", async () => {
    const a = await createProduct(db, { stock: 0 });
    const b = await createProduct(db, { stock: 0 });
    const items = [
      { variantId: a.variantId, quantity: 5, unitCost: 3 },
      { variantId: b.variantId, quantity: 2, unitCost: 10 },
    ];
    const run = (userId: string, payload = items) =>
      svc<{ r: Record<string, unknown> }>(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL) AS r`, [BRANCH_ID, userId, JSON.stringify(payload)]);

    assert.match(await rpcError(run(users.cashier)), /للمالك أو المدير فقط/);
    await run(users.owner);

    const journals = await db.query<Journal>(
      `SELECT entry_number, entry_type, debit_account, credit_account, amount, currency, amount_usd
       FROM public.journal_entries WHERE entry_number LIKE 'JE-OPEN-%'`,
    );
    assert.equal(journals.rows.length, 1, "exactly one opening entry");
    const [entry] = journals.rows;
    assert.deepEqual([entry.entry_type, entry.debit_account, entry.credit_account, num(entry.amount_usd)], ["CAPITAL", "INVENTORY", "CAPITAL", 35]);

    const movements = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.inventory_movements WHERE movement_type = 'OPENING_STOCK' AND variant_id = ANY($1)`,
      [[a.variantId, b.variantId]],
    );
    assert.equal(num(movements.rows[0].n), 2);

    // a second opening for the same items is refused (stock no longer zero) → no duplicate INVENTORY/CAPITAL
    assert.match(await rpcError(run(users.owner, [items[0]])), /رصيده ليس صفرًا/);
  });

  it("anon still cannot call any of these, even with valid arguments", async () => {
    const product = await createProduct(db, { stock: 5, averageCost: 4, sellingPrice: 10 });
    assert.equal(
      await sqlState(
        asRole(db, "anon", () =>
          db.query(`SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL)`, [
            BRANCH_ID,
            users.cashier,
            JSON.stringify([{ variantId: product.variantId, quantity: 1 }]),
          ]),
        ),
      ),
      "42501",
    );
    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 5);
  });
});

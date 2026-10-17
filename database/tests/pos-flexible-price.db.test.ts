/**
 * 20261017_01 — flexible POS unit price (unitPriceSdg), list_unit_price / price_overridden,
 * no 50% invoice-discount cap. Live schema export, PGlite (local, in-memory). Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import { BRANCH_ID, RATE, RELEASE_SEQUENCE, asRole, createLiveDb, createProduct, num, releaseTemplate, rpcError, seedBase, type Users } from "./db-harness";

after(releaseTemplate);

describe("flexible POS price (20261017_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const checkout = (items: unknown[], discount = 0) =>
    asRole(db, "service_role", () =>
      db.query<{ r: Record<string, unknown> }>(
        `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, $4, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL) AS r`,
        [BRANCH_ID, users.cashier, JSON.stringify(items), discount],
      ),
    );

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("uses unitPriceSdg, stores list price and the override flag; cost unchanged", async () => {
    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const { rows } = await checkout([
      { variantId: product.variantId, quantity: 2, isGift: false, unitPriceSdg: 20000 },
    ]);
    const order = rows[0].r;
    assert.equal(num(order.total_amount), 40_000);
    assert.equal(num(order.total_amount_usd), 16);

    const item = (
      await db.query<{ unit_price: string; list_unit_price: string; price_overridden: boolean; unit_cost: string }>(
        `SELECT unit_price, list_unit_price, price_overridden, unit_cost FROM public.sales_order_items WHERE sales_order_id = $1`,
        [order.id],
      )
    ).rows[0];
    assert.deepEqual(
      [num(item.unit_price), num(item.list_unit_price), item.price_overridden, num(item.unit_cost)],
      [20_000, 10 * RATE, true, 4],
    );
  });

  it("without unitPriceSdg the list price is used and recorded (not overridden)", async () => {
    const product = await createProduct(db, { stock: 5, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const { rows } = await checkout([{ variantId: product.variantId, quantity: 1, isGift: false }]);
    const item = (
      await db.query<{ unit_price: string; list_unit_price: string; price_overridden: boolean }>(
        `SELECT unit_price, list_unit_price, price_overridden FROM public.sales_order_items WHERE sales_order_id = $1`,
        [rows[0].r.id],
      )
    ).rows[0];
    assert.deepEqual([num(item.unit_price), num(item.list_unit_price), item.price_overridden], [10 * RATE, 10 * RATE, false]);
  });

  it("rejects a non-positive price; the 50% discount cap is gone but discount ≤ subtotal stays", async () => {
    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    assert.match(
      await rpcError(checkout([{ variantId: product.variantId, quantity: 1, isGift: false, unitPriceSdg: 0 }])),
      /أكبر من صفر/,
    );
    const { rows } = await checkout([{ variantId: product.variantId, quantity: 1, isGift: false }], 20_000);
    assert.equal(num(rows[0].r.total_amount), 5_000, "80% discount accepted");
    assert.match(
      await rpcError(checkout([{ variantId: product.variantId, quantity: 1, isGift: false }], 25_001)),
      /لا يمكن أن يتجاوز المجموع الفرعي/,
    );
  });
});

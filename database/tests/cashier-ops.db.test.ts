/**
 * 20261023_01_cashier_operator_permissions on the REAL live schema, after the full
 * release sequence, called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import { M, RELEASE_SEQUENCE, createLiveDb, createProduct, releaseTemplate, runVerify, sql } from "./db-harness";

after(releaseTemplate);

describe("stock notifications reach the cashier (20261023_01)", () => {
  let db: PGliteInterface;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
  });
  after(() => db.close());

  const stockNotifications = async (variantId: string) =>
    (
      await db.query<{ type: string; target_roles: string[] | null; isRead: boolean }>(
        `SELECT type, target_roles, "isRead" FROM public.notifications WHERE metadata ->> 'variant_id' = $1 ORDER BY created_at`,
        [variantId],
      )
    ).rows;

  it("new LOW_STOCK / OUT_OF_STOCK notifications target owner, admin and cashier", async () => {
    const product = await createProduct(db, { stock: 10 });
    await db.query(`UPDATE public.product_variants SET "minStockLevel" = 5 WHERE id = $1`, [product.variantId]);

    await db.query(`UPDATE public.product_variants SET "stockQuantity" = 3 WHERE id = $1`, [product.variantId]);
    await db.query(`UPDATE public.product_variants SET "stockQuantity" = 0 WHERE id = $1`, [product.variantId]);

    const rows = await stockNotifications(product.variantId);
    const low = rows.find((row) => row.type === "LOW_STOCK");
    const out = rows.find((row) => row.type === "OUT_OF_STOCK");
    assert.deepEqual(low?.target_roles, ["owner", "admin", "cashier"]);
    assert.deepEqual(out?.target_roles, ["owner", "admin", "cashier"]);
  });

  it("existing stock notifications get cashier added once; other notifications are untouched", async () => {
    await db.query(`DELETE FROM public.notifications`);
    await db.query(
      `INSERT INTO public.notifications (title, message, type, target_roles) VALUES
         ('legacy low', 'x', 'LOW_STOCK', NULL),
         ('legacy out', 'x', 'OUT_OF_STOCK', ARRAY['owner']),
         ('already', 'x', 'LOW_STOCK', ARRAY['owner','admin','cashier']),
         ('reset', 'x', 'RESET_PASSWORD', NULL),
         ('po', 'x', 'PURCHASE_ORDER', ARRAY['owner'])`,
    );

    const file = M.cashierOps;
    await db.exec(sql(file));
    await db.exec(sql(file));

    const rows = (
      await db.query<{ title: string; target_roles: string[] | null }>(
        `SELECT title, target_roles FROM public.notifications ORDER BY title`,
      )
    ).rows;
    const byTitle = Object.fromEntries(rows.map((row) => [row.title, row.target_roles]));

    assert.deepEqual(byTitle["legacy low"], ["owner", "admin", "cashier"]);
    assert.deepEqual(byTitle["legacy out"], ["owner", "cashier"]);
    assert.deepEqual(byTitle["already"], ["owner", "admin", "cashier"]);
    assert.equal(byTitle["reset"], null);
    assert.deepEqual(byTitle["po"], ["owner"]);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

/**
 * 20261017_02 / 03 — opening-stock shipping allocation (preview + apply).
 * Runs only against the in-memory PGlite copy of the live schema (never a real DB).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import type { PGliteInterface } from "@electric-sql/pglite";

import { BRANCH_ID, RELEASE_SEQUENCE, asRole, createLiveDb, createProduct, num, releaseTemplate, rpcError, seedBase, sql, type Users } from "./db-harness";

const DIR = join(__dirname, "..", "migrations");
// الملفان قابلان لتعديل القيم من المالك نفسه قبل التطبيق الحقيقي (تبقى كما هي)،
// فالاستبدال هنا بالموضع (v_total_shipping / v_mode) لا بالقيمة الحالية.
const withSettings = (file: string, total: number, mode: string) =>
  sql(join(DIR, file))
    .replace(/[\d.]+(::numeric\s+AS v_total_shipping)/, `${total}$1`)
    .replace(/'[A-Z_]+'(::text\s+AS v_mode)/, `'${mode}'$1`);

after(releaseTemplate);

describe("opening stock shipping (20261017_02/03)", () => {
  let db: PGliteInterface;
  let users: Users;
  let a: { variantId: string };
  let b: { variantId: string };

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    a = await createProduct(db, { stock: 0, sellingPrice: 10 });
    b = await createProduct(db, { stock: 0, sellingPrice: 10 });
    await asRole(db, "service_role", () =>
      db.query(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL)`, [
        BRANCH_ID,
        users.owner,
        JSON.stringify([
          { variantId: a.variantId, quantity: 10, unitCost: 4 },
          { variantId: b.variantId, quantity: 30, unitCost: 2 },
        ]),
      ]),
    );
    // بيع 4 من A
    await asRole(db, "service_role", () =>
      db.query(
        `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL)`,
        [BRANCH_ID, users.cashier, JSON.stringify([{ variantId: a.variantId, quantity: 4, isGift: false }])],
      ),
    );
  });
  after(() => db.close());

  it("preview is read-only and its total row equals v_total_shipping", async () => {
    const before = await db.query(`SELECT count(*) AS n FROM public.journal_entries`);
    const { rows } = await db.query<Record<string, string | null>>(withSettings("20261017_02_opening_shipping_preview.sql", 100, "PER_UNIT"));
    const total = rows.find((row) => row["#"] === null)!;
    assert.equal(num(total["نصيب المتغير"]), 100);
    const rowA = rows.find((row) => num(row["الكمية الافتتاحية"]) === 10 && row["#"] !== null)!;
    // 100 / 40 = 2.5 per unit → A: 25 total, 6 left → 15 on stock, 10 on sold
    assert.deepEqual([num(rowA["المبلغ على المخزون"]), num(rowA["المبلغ على المباع"]), num(rowA["averageCost الجديد"])], [15, 10, 6.5]);
    const after = await db.query(`SELECT count(*) AS n FROM public.journal_entries`);
    assert.deepEqual(after.rows, before.rows);
  });

  it("apply updates averageCost, sale-line cost and posts two USD entries; refuses a second run", async () => {
    await db.exec(withSettings("20261017_03_opening_shipping_apply.sql", 100, "PER_UNIT"));

    const avg = await db.query<{ id: string; c: string }>(
      `SELECT id, "averageCost" AS c FROM public.product_variants WHERE id = ANY($1)`,
      [[a.variantId, b.variantId]],
    );
    const byId = Object.fromEntries(avg.rows.map((row) => [row.id, num(row.c)]));
    assert.deepEqual([byId[a.variantId], byId[b.variantId]], [6.5, 4.5]);

    const line = await db.query<{ unit_cost: string }>(`SELECT unit_cost FROM public.sales_order_items WHERE variant_id = $1`, [a.variantId]);
    assert.equal(num(line.rows[0].unit_cost), 6.5);

    const entries = await db.query<{ entry_type: string; debit_account: string; credit_account: string; amount: string; currency: string }>(
      `SELECT entry_type, debit_account, credit_account, amount, currency FROM public.journal_entries WHERE reference LIKE 'OPENSHIP-%' ORDER BY entry_type`,
    );
    assert.deepEqual(
      entries.rows.map((row) => [row.entry_type, row.debit_account, row.credit_account, num(row.amount), row.currency]),
      [["CAPITAL", "INVENTORY", "CAPITAL", 100, "USD"], ["COGS", "COGS", "INVENTORY", 10, "USD"]],
    );

    assert.match(await rpcError(db.exec(withSettings("20261017_03_opening_shipping_apply.sql", 100, "PER_UNIT"))), /لا يمكن التشغيل مرتين/);
  });
});

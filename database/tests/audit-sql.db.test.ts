/**
 * Read-only audit queries in database/audit run without errors against the
 * REAL live schema (live_public_schema.sql itself is the schema, not a query
 * file). storage.* queries are Supabase-only and skipped in PGlite.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  createProduct,
  createPurchaseOrder,
  releaseTemplate,
  seedBase,
} from "./db-harness";

after(releaseTemplate);

const AUDIT_DIR = join(__dirname, "..", "audit");

function statements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, "").trim())
    .filter(Boolean);
}

describe("database/audit/*.sql", () => {
  const files = readdirSync(AUDIT_DIR).filter((name) => name.endsWith(".sql") && name !== "live_public_schema.sql");
  for (const file of files) {
    it(`${file} — كل الاستعلامات بتتنفذ (قراءة فقط)`, async () => {
      const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
      let executed = 0;
      for (const statement of statements(readFileSync(join(AUDIT_DIR, file), "utf8"))) {
        assert.doesNotMatch(statement, /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i, "audit files must be read-only");
        if (/\bstorage\./.test(statement)) continue;
        await db.query(statement);
        executed++;
      }
      assert.ok(executed > 0);
      await db.close();
    });
  }
});

describe("فحص تطابق المخزون مع الحركات (03_data_integrity_checks #1)", () => {
  it("بعد الاستلام الذرّي مفيش فرق، ولو حد عدّل الرصيد يدويًا الفحص بيكشفه", async () => {
    const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    const users = await seedBase(db);
    const product = await createProduct(db, { conversionFactor: 6 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 2, unitCost: 120 }] });
    await asRole(db, "service_role", () =>
      db.query(`SELECT public.receive_purchase_order($1, $2, $3)`, [orderId, users.owner, BRANCH_ID]),
    );

    const check = statements(readFileSync(join(AUDIT_DIR, "03_data_integrity_checks.sql"), "utf8"))[0];
    assert.equal((await db.query(check)).rows.length, 0);

    await db.query(`UPDATE public.product_variants SET "stockQuantity" = "stockQuantity" + 1 WHERE id = $1`, [product.variantId]);
    const drift = await db.query<{ variant_id: string; difference: string }>(check);
    assert.equal(drift.rows.length, 1);
    assert.equal(drift.rows[0].variant_id, product.variantId);
    assert.equal(Number(drift.rows[0].difference), 1);
    await db.close();
  });
});

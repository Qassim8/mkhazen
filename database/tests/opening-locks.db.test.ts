/**
 * قفل المخزون الافتتاحي والأرصدة الافتتاحية (20261101_01_opening_locks.sql)
 *
 * • opening_stock_locked = true ، opening_balances_locked = false عند التثبيت
 * • record_opening_stock / record_opening_inventory ترفض عند القفل، والأرصدة (و record_opening_cash) بقفلها
 * • set_opening_lock: المالك فقط، يسجّل من غيّر ومتى، ولا يسجّل شيئًا إن لم تتغير القيمة
 * • تصحيح المخزون الافتتاحي يعمل والقفل مفعّل
 * • إعادة تشغيل الملف لا تُعيد ضبط القفل
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  M,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  createProduct,
  releaseTemplate,
  rpcError,
  seedBase,
  sql,
  type Users,
} from "./db-harness";

after(releaseTemplate);

const STOCK_MESSAGE = /المخزون الافتتاحي مقفل\. استخدم أوامر الشراء لإضافة بضاعة/;
const BALANCES_MESSAGE = /الأرصدة الافتتاحية مقفلة/;

describe("opening locks (20261101_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const svc = <T,>(text: string, params: unknown[] = []) =>
    asRole(db, "service_role", () => db.query<T>(text, params));

  const lockValue = async (key: string) =>
    (await db.query<{ bool_value: boolean }>(`SELECT bool_value FROM public.system_settings WHERE key = $1`, [key])).rows[0]
      ?.bool_value;

  const setLock = (key: string, locked: boolean, userId: string) =>
    svc<{ r: { key: string; locked: boolean; changed: boolean } }>(
      `SELECT public.set_opening_lock($1, $2, $3) AS r`,
      [key, locked, userId],
    );

  const recordStock = (variantId: string, userId = users.owner) =>
    svc(`SELECT public.record_opening_stock($1, $2, $3::jsonb, NULL)`, [
      BRANCH_ID,
      userId,
      JSON.stringify([{ variantId, quantity: 4, unitCost: 5 }]),
    ]);

  const recordBalances = (dryRun: boolean) =>
    svc(
      `SELECT public.record_opening_balances($1, $2, current_date, '[{"account":"CASH","currency":"USD","amount":100}]'::jsonb, '[]', '[]', NULL, $3)`,
      [BRANCH_ID, users.owner, dryRun],
    );

  it("seeds stock locked and balances unlocked", async () => {
    assert.equal(await lockValue("opening_stock_locked"), true);
    assert.equal(await lockValue("opening_balances_locked"), false);
  });

  it("locked stock: record_opening_stock and record_opening_inventory refuse and write nothing", async () => {
    const product = await createProduct(db, { stock: 0 });

    assert.match(await rpcError(recordStock(product.variantId)), STOCK_MESSAGE);
    assert.match(
      await rpcError(
        svc(`SELECT public.record_opening_inventory($1, $2, $3, 10, 4, NULL)`, [BRANCH_ID, users.owner, product.variantId]),
      ),
      STOCK_MESSAGE,
    );

    const movements = await db.query<{ n: number | string }>(
      `SELECT count(*) AS n FROM public.inventory_movements WHERE movement_type = 'OPENING_STOCK'`,
    );
    assert.equal(Number(movements.rows[0].n), 0);
  });

  it("the permission message still comes first for a non-admin", async () => {
    const product = await createProduct(db, { stock: 0 });
    assert.match(await rpcError(recordStock(product.variantId, users.cashier)), /للمالك أو المدير فقط/);
  });

  it("balances are open by default (preview works), and close with their own lock", async () => {
    await recordBalances(true);

    assert.equal((await setLock("opening_balances_locked", true, users.owner)).rows[0].r.changed, true);

    assert.match(await rpcError(recordBalances(true)), BALANCES_MESSAGE);
    assert.match(await rpcError(recordBalances(false)), BALANCES_MESSAGE);
    assert.match(
      await rpcError(svc(`SELECT public.record_opening_cash($1, $2, 'CASH', 'USD', 10, NULL)`, [BRANCH_ID, users.owner])),
      BALANCES_MESSAGE,
    );

    // قفل الأرصدة لا يمس المخزون: المخزون ما زال مقفلًا بقفله الخاص
    assert.equal(await lockValue("opening_stock_locked"), true);

    await setLock("opening_balances_locked", false, users.owner);
    await recordBalances(true);
  });

  it("set_opening_lock: owner only, known keys only", async () => {
    assert.match(await rpcError(setLock("opening_stock_locked", false, users.admin)), /للمالك فقط/);
    assert.match(await rpcError(setLock("opening_stock_locked", false, users.cashier)), /للمالك فقط/);
    assert.match(await rpcError(setLock("something_else", false, users.owner)), /إعداد القفل غير معروف/);
    assert.equal(await lockValue("opening_stock_locked"), true);
  });

  it("set_opening_lock logs who changed it and when, and logs nothing when unchanged", async () => {
    const before = await db.query<{ n: number | string }>(`SELECT count(*) AS n FROM public.system_setting_changes`);

    const unlocked = (await setLock("opening_stock_locked", false, users.owner)).rows[0].r;
    assert.deepEqual(unlocked, { key: "opening_stock_locked", locked: false, changed: true });

    const same = (await setLock("opening_stock_locked", false, users.owner)).rows[0].r;
    assert.equal(same.changed, false);

    const log = await db.query<{ key: string; old_value: boolean; new_value: boolean; changed_by: string; changed_at: string }>(
      `SELECT key, old_value, new_value, changed_by, changed_at FROM public.system_setting_changes ORDER BY changed_at DESC, id LIMIT 1`,
    );
    assert.equal(log.rows[0].key, "opening_stock_locked");
    assert.equal(log.rows[0].old_value, true);
    assert.equal(log.rows[0].new_value, false);
    assert.equal(log.rows[0].changed_by, users.owner);
    assert.ok(log.rows[0].changed_at);

    const after2 = await db.query<{ n: number | string }>(`SELECT count(*) AS n FROM public.system_setting_changes`);
    assert.equal(Number(after2.rows[0].n) - Number(before.rows[0].n), 1);

    const setting = await db.query<{ updated_by: string }>(
      `SELECT updated_by FROM public.system_settings WHERE key = 'opening_stock_locked'`,
    );
    assert.equal(setting.rows[0].updated_by, users.owner);
  });

  it("unlocked stock records again; correction works while locked", async () => {
    const product = await createProduct(db, { stock: 0 });
    await recordStock(product.variantId);

    await setLock("opening_stock_locked", true, users.owner);
    assert.match(await rpcError(recordStock(product.variantId)), STOCK_MESSAGE);

    // سجل التصحيح يبقى ظاهرًا والقفل مفعّل
    const list = await svc<{ variant_id: string }>(`SELECT * FROM public.list_opening_stock_corrections()`);
    assert.ok(list.rows.some((row) => row.variant_id === product.variantId));

    // تصحيح المخزون الافتتاحي لا يتأثر بالقفل
    await svc(`SELECT public.correct_opening_stock_entry($1,$2,$3,$4,$5,$6)`, [BRANCH_ID, users.owner, product.variantId, 3, 5, null]);
    const stock = await db.query<{ q: string }>(`SELECT "stockQuantity" AS q FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(Number(stock.rows[0].q), 3);
  });

  it("re-running the migration keeps the current lock state", async () => {
    await setLock("opening_stock_locked", false, users.owner);
    await db.exec(sql(M.openingLocks));
    assert.equal(await lockValue("opening_stock_locked"), false);
    await setLock("opening_stock_locked", true, users.owner);
    await db.exec(sql(M.openingLocks));
    assert.equal(await lockValue("opening_stock_locked"), true);
  });

  it("anon and authenticated cannot call the lock functions or read the tables", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(
        asRole(db, role, () => db.query(`SELECT public.set_opening_lock('opening_stock_locked', false, $1)`, [users.owner])),
        /permission denied/,
      );
      await assert.rejects(asRole(db, role, () => db.query(`SELECT * FROM public.system_settings`)), /permission denied/);
      await assert.rejects(asRole(db, role, () => db.query(`SELECT * FROM public.system_setting_changes`)), /permission denied/);
    }
  });
});

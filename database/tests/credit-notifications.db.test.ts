/**
 * 20261025_01_credit_overdue_notifications on the REAL live schema. Run: npm run test:db
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
  num,
  releaseTemplate,
  runVerify,
  seedBase,
  sql,
  type Users,
} from "./db-harness";

after(releaseTemplate);

describe("overdue credit notifications (20261025_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));
  const maintain = async () =>
    (await svc<{ r: Record<string, unknown> }>(`SELECT public.maintain_notifications($1, 30) AS r`, [BRANCH_ID])).rows[0].r;

  const creditSale = async (variantId: string, name: string) => {
    const { rows } = await svc<{ r: { id: string } }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL, true, $4, '0911', NULL) AS r`,
      [BRANCH_ID, users.cashier, JSON.stringify([{ variantId, quantity: 1 }]), name],
    );
    return rows[0].r.id;
  };

  const notificationsFor = async (orderId: string) =>
    (
      await db.query<{ type: string; target_roles: string[] | null; isRead: boolean; message: string }>(
        `SELECT type, target_roles, "isRead", message FROM public.notifications WHERE metadata ->> 'sales_order_id' = $1`,
        [orderId],
      )
    ).rows;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("notifies once per overdue open invoice, for the managers, and resolves it when closed", async () => {
    const p = await createProduct(db, { stock: 20, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const overdue = await creditSale(p.variantId, "عميل متأخر");
    const notDue = await creditSale(p.variantId, "عميل غير متأخر");
    const noDate = await creditSale(p.variantId, "بدون استحقاق");

    await db.query(`UPDATE public.sales_orders SET due_date = current_date - 4 WHERE id = $1`, [overdue]);
    await db.query(`UPDATE public.sales_orders SET due_date = current_date + 10 WHERE id = $1`, [notDue]);

    const first = await maintain();
    assert.equal(num(first.credit_overdue_created), 1);
    assert.ok("overdue_created" in first && "deleted" in first, "the tailoring part of maintain_notifications is kept");

    const rows = await notificationsFor(overdue);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, "CREDIT_OVERDUE");
    assert.equal(rows[0].target_roles, null, "managers audience, like the tailoring delay notifications");
    assert.match(rows[0].message, /عميل متأخر/);
    assert.equal((await notificationsFor(notDue)).length, 0);
    assert.equal((await notificationsFor(noDate)).length, 0);

    const second = await maintain();
    assert.equal(num(second.credit_overdue_created), 0, "no duplicate notification");

    // settling the invoice resolves the notification
    await svc(`SELECT public.record_credit_payment($1, 100000, 'CASH', $2, $3, NULL)`, [overdue, users.cashier, BRANCH_ID]);
    await maintain();
    assert.equal((await notificationsFor(overdue))[0].isRead, true);
  });

  it("is re-runnable and verify.sql still passes", async () => {
    await db.exec(sql(M.creditNotifications));
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

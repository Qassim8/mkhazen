/**
 * 20261030_01 — resolve_customer_by_phone as used by the shared customer fields
 * (tailoring order, credit sale, optional customer on a normal sale).
 * Real live schema after the full release sequence, as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import { BRANCH_ID, RELEASE_SEQUENCE, asRole, createLiveDb, releaseTemplate, rpcError, runVerify, seedBase, type Users } from "./db-harness";

type Json = Record<string, unknown>;

after(releaseTemplate);

describe("shared customer fields: link by phone, create otherwise (20261030_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const resolve = (name: string | null, phone: string) =>
    svc<{ r: Json }>(`SELECT public.resolve_customer_by_phone($1, $2, $3) AS r`, [BRANCH_ID, name, phone]).then((result) => result.rows[0].r);

  const customerCount = async () =>
    Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers`)).rows[0].n);

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("an existing phone (any format) links to its customer and keeps the existing name", async () => {
    const first = await resolve("منى", "0944444444");
    assert.equal(first.created, true);

    for (const form of ["+249944444444", "249 944 444 444", "944444444"]) {
      const again = await resolve("اسم مختلف", form);
      assert.equal(again.customer_id, first.customer_id, form);
      assert.equal(again.created, false, form);
      assert.equal(again.name, "منى", "the typed name never replaces an existing name");
    }

    const stored = (await db.query<{ name: string }>(`SELECT name FROM public.customers WHERE id = $1`, [first.customer_id])).rows[0];
    assert.equal(stored.name, "منى");
  });

  it("the name is filled only when the existing one is empty", async () => {
    const created = await resolve("مؤقت", "0955555555");
    await db.query(`UPDATE public.customers SET name = '' WHERE id = $1`, [created.customer_id]);

    const filled = await resolve("  علي  ", "+249955555555");
    assert.equal(filled.customer_id, created.customer_id);
    assert.equal(filled.name, "علي");
    assert.equal(
      (await db.query<{ name: string }>(`SELECT name FROM public.customers WHERE id = $1`, [created.customer_id])).rows[0].name,
      "علي",
    );

    // typing nothing leaves it as it is
    await db.query(`UPDATE public.customers SET name = '' WHERE id = $1`, [created.customer_id]);
    const untouched = await resolve(null, "0955555555");
    assert.equal(untouched.name, "");
  });

  it("a new phone creates a customer (name required), an invalid phone creates nothing", async () => {
    const before = await customerCount();

    assert.match(await rpcError(svc(`SELECT public.resolve_customer_by_phone($1, NULL, '0966666666')`, [BRANCH_ID])), /اسم العميل مطلوب/);
    assert.match(await rpcError(svc(`SELECT public.resolve_customer_by_phone($1, 'س', '12')`, [BRANCH_ID])), /رقم هاتف العميل غير صالح/);
    assert.equal(await customerCount(), before);

    const created = await resolve("هالة", "0966666666");
    assert.equal(created.created, true);
    assert.equal(await customerCount(), before + 1);
  });

  it("what the tailoring route does: resolve, then create_tailoring_order with the resolved name and phone → same customer, name untouched", async () => {
    const existing = await resolve("سارة الأصلية", "0977777777");

    // the cashier typed another name and a different spelling of the same number
    const resolved = await resolve("اسم مكتوب بالخطأ", "+249977777777");
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', $4, $5, $6::jsonb, current_date, current_date + 7,
              NULL, NULL, 20000, 5000, 5000, 'CASH', NULL, 'جلابية', NULL, NULL) AS r`,
      [
        BRANCH_ID,
        users.cashier,
        users.tailor,
        resolved.name,
        resolved.whatsapp_number,
        JSON.stringify([{ label: "الطول", value: 150, unit: "CM" }]),
      ],
    );

    const order = (await db.query<{ customer_id: string }>(`SELECT customer_id FROM public.sales_orders WHERE id = $1`, [rows[0].r.id])).rows[0];
    assert.equal(order.customer_id, existing.customer_id);
    assert.equal(
      (await db.query<{ name: string }>(`SELECT name FROM public.customers WHERE id = $1`, [existing.customer_id])).rows[0].name,
      "سارة الأصلية",
    );
    assert.equal(
      Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers WHERE phone_normalized = '249977777777'`)).rows[0].n),
      1,
      "no duplicate customer for the same number",
    );
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

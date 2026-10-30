/**
 * 20261026_01_customers_hub on the REAL live schema, after the full release sequence,
 * called as service_role. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
  rpcError,
  runVerify,
  seedBase,
  sql,
  type Users,
} from "./db-harness";

after(releaseTemplate);

describe("customers hub (20261026_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const customer = async (name: string, phone: string, extra: { notes?: string | null; measurements?: unknown } = {}) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO public.customers (id, branch_id, name, whatsapp_number, notes, measurements) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [id, BRANCH_ID, name, phone, extra.notes ?? null, extra.measurements == null ? null : JSON.stringify(extra.measurements)],
    );
    return id;
  };

  const normalized = async (id: string) =>
    (await db.query<{ p: string }>(`SELECT phone_normalized AS p FROM public.customers WHERE id = $1`, [id])).rows[0].p;

  const sale = async (customerId: string, variantId: string) => {
    const { rows } = await svc<{ r: { id: string } }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', $3, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $4::jsonb, NULL) AS r`,
      [BRANCH_ID, users.cashier, customerId, JSON.stringify([{ variantId, quantity: 1 }])],
    );
    return rows[0].r.id;
  };

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("normalizes Sudan numbers to one format", async () => {
    const forms = ["0912345678", "+249912345678", "249912345678", "00249912345678", "912345678", "+249 91 234 5678", "091-234-5678"];
    for (const form of forms) {
      const { rows } = await db.query<{ p: string }>(`SELECT public.normalize_customer_phone($1) AS p`, [form]);
      assert.equal(rows[0].p, "249912345678", form);
    }
    const other = await db.query<{ a: string; b: string }>(
      `SELECT public.normalize_customer_phone('') AS a, public.normalize_customer_phone('+966501234567') AS b`,
    );
    assert.equal(other.rows[0].a, "");
    assert.equal(other.rows[0].b, "966501234567", "foreign numbers keep their digits");
  });

  it("the trigger fills phone_normalized on insert and when the number changes (incl. tailoring inserts)", async () => {
    const id = await customer("أحمد", "0912345678");
    assert.equal(await normalized(id), "249912345678");

    await db.query(`UPDATE public.customers SET whatsapp_number = '0123456789' WHERE id = $1`, [id]);
    assert.equal(await normalized(id), "249123456789");
  });

  it("the backfill is idempotent and not UNIQUE (old duplicates stay allowed)", async () => {
    const a = await customer("مكرر 1", "0955555551");
    const b = await customer("مكرر 2", "249955555551");
    assert.equal(await normalized(a), await normalized(b));

    await db.query(`UPDATE public.customers SET phone_normalized = NULL WHERE id = ANY($1)`, [[a, b]]);
    await db.exec(sql(M.customersHub));
    await db.exec(sql(M.customersHub));
    assert.equal(await normalized(a), "249955555551");
    assert.equal(await normalized(b), "249955555551");
  });

  it("find_duplicate_customers groups by phone_normalized with invoice counts", async () => {
    const dup1 = await customer("عميل أ", "0977777771");
    const dup2 = await customer("عميل أ (نسخة)", "+249977777771");
    await customer("مختلف", "0977777772");

    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    await sale(dup2, product.variantId);

    const { rows } = await svc<{ group_key: string; customer_id: string; invoice_count: string }>(
      `SELECT group_key, customer_id, invoice_count FROM public.find_duplicate_customers() WHERE group_key = '249977777771' ORDER BY created_at`,
    );
    assert.deepEqual(
      rows.map((row) => [row.customer_id, num(row.invoice_count)]),
      [
        [dup1, 0],
        [dup2, 1],
      ],
    );

    const all = await svc<{ group_key: string }>(`SELECT DISTINCT group_key FROM public.find_duplicate_customers()`);
    assert.ok(!all.rows.some((row) => row.group_key === "249977777772"), "a unique number is not a duplicate");
  });

  it("merge_customers moves every reference (dynamic FKs), fills measurements/notes, deletes the removed one", async () => {
    const keep = await customer("الأصل", "0966666661", { notes: "ملاحظة أ" });
    const remove = await customer("النسخة", "+249966666661", {
      notes: "ملاحظة ب",
      measurements: [{ label: "الطول", value: 150, unit: "CM" }],
    });

    const product = await createProduct(db, { stock: 10, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const order1 = await sale(remove, product.variantId);
    const order2 = await sale(remove, product.variantId);

    // a table added later that also references customers is found dynamically
    await db.exec(`CREATE TABLE public.zz_customer_ref (id serial PRIMARY KEY, customer_id uuid REFERENCES public.customers(id))`);
    await db.query(`INSERT INTO public.zz_customer_ref (customer_id) VALUES ($1)`, [remove]);

    const { rows } = await svc<{ r: { moved: Record<string, number>; removed_name: string } }>(
      `SELECT public.merge_customers($1, $2, $3) AS r`,
      [keep, remove, users.admin],
    );
    assert.equal(rows[0].r.removed_name, "النسخة");
    assert.equal(rows[0].r.moved["sales_orders.customer_id"], 2);
    assert.equal(rows[0].r.moved["zz_customer_ref.customer_id"], 1);

    const orders = await db.query<{ customer_id: string }>(`SELECT customer_id FROM public.sales_orders WHERE id = ANY($1)`, [[order1, order2]]);
    assert.deepEqual(orders.rows.map((row) => row.customer_id), [keep, keep]);
    assert.equal((await db.query(`SELECT 1 FROM public.customers WHERE id = $1`, [remove])).rows.length, 0);

    const kept = await db.query<{ notes: string; measurements: unknown; whatsapp_number: string }>(
      `SELECT notes, measurements, whatsapp_number FROM public.customers WHERE id = $1`,
      [keep],
    );
    assert.equal(kept.rows[0].notes, "ملاحظة أ\nملاحظة ب");
    assert.deepEqual(kept.rows[0].measurements, [{ label: "الطول", value: 150, unit: "CM" }]);
    assert.equal(kept.rows[0].whatsapp_number, "0966666661", "the kept customer keeps its own number");

    await db.exec(`DROP TABLE public.zz_customer_ref`);
  });

  it("merge_customers is owner/admin only and validates its inputs; failure changes nothing", async () => {
    const keep = await customer("أ", "0944444441");
    const remove = await customer("ب", "0944444442");
    const merge = (userId: string, a = keep, b = remove) =>
      svc(`SELECT public.merge_customers($1, $2, $3)`, [a, b, userId]);

    assert.match(await rpcError(merge(users.cashier)), /للمالك أو المدير/);
    assert.match(await rpcError(merge(users.tailor)), /للمالك أو المدير/);
    assert.match(await rpcError(merge(users.inactiveAdmin)), /غير صالح/);
    assert.match(await rpcError(merge(users.admin, keep, keep)), /مع نفسه/);
    assert.match(await rpcError(merge(users.admin, keep, randomUUID())), /غير موجود/);
    assert.equal((await db.query(`SELECT 1 FROM public.customers WHERE id = ANY($1)`, [[keep, remove]])).rows.length, 2);

    await merge(users.owner);
    assert.equal((await db.query(`SELECT 1 FROM public.customers WHERE id = $1`, [remove])).rows.length, 0);
  });

  it("is re-runnable and verify.sql passes", async () => {
    await db.exec(sql(M.customersHub));
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

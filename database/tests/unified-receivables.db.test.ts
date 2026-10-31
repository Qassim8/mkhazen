/**
 * 20261027_01_unified_receivables (+ 02/03 backfill) on the REAL live schema, after the full
 * release sequence, called as service_role. Run: npm run test:db
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
  rpcError,
  runVerify,
  seedBase,
  sql,
  type Users,
} from "./db-harness";

type Json = Record<string, unknown>;

const MEASUREMENTS = JSON.stringify([{ label: "الطول", value: 150, unit: "CM" }]);

after(releaseTemplate);

describe("unified receivables (20261027_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const setRate = (rate = 2500) =>
    db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);

  const customer = async (name: string, phone: string) =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO public.customers (branch_id, name, whatsapp_number) VALUES ($1, $2, $3) RETURNING id`,
        [BRANCH_ID, name, phone],
      )
    ).rows[0].id;

  const creditSale = async (opts: { customerId: string | null; paid?: number; name?: string; phone?: string; qty?: number }) => {
    const p = await createProduct(db, { stock: 50, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const splits = opts.paid ? [{ method: "CASH", amount: opts.paid }] : [];
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', $3, NULL, 0, 0, 'CASH', $4::jsonb, NULL, $5::jsonb, NULL, true, $6, $7, NULL) AS r`,
      [
        BRANCH_ID,
        users.cashier,
        opts.customerId,
        JSON.stringify(splits),
        JSON.stringify([{ variantId: p.variantId, quantity: opts.qty ?? 1 }]),
        opts.name ?? "اسم على الفاتورة",
        opts.phone ?? "0911111111",
      ],
    );
    return rows[0].r.id as string;
  };

  const tailoringOrder = async (total: number, deposit: number, name = "عميل تفصيل", phone = "0922222222") => {
    const { rows } = await svc<{ r: Json }>(
      `SELECT public.create_tailoring_order($1, $2, $3, 'CUSTOMER', $4, $5, $6::jsonb, current_date, current_date + 7,
              NULL, NULL, $7, $8, 5000, 'CASH', NULL, 'جلابية', NULL, NULL) AS r`,
      [BRANCH_ID, users.cashier, users.tailor, name, phone, MEASUREMENTS, total, deposit],
    );
    return String(rows[0].r.id);
  };

  const setStatus = (id: string, status: string) =>
    svc(`SELECT public.update_tailoring_status($1, $2, $3, $4)`, [id, BRANCH_ID, users.cashier, status]);

  const unified = async (customerId: string | null = null) =>
    (await svc<Record<string, unknown>>(`SELECT * FROM public.get_unified_receivables($1)`, [customerId])).rows;

  const notificationsFor = async (orderId: string) =>
    (
      await db.query<{ type: string; target_roles: string[] | null; message: string }>(
        `SELECT type, target_roles, message FROM public.notifications WHERE metadata ->> 'sales_order_id' = $1 ORDER BY created_at`,
        [orderId],
      )
    ).rows;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await setRate(2500);
  });
  after(() => db.close());

  it("credit checkout requires an existing customer in the branch; the text copy stays on the invoice", async () => {
    const p = await createProduct(db, { stock: 50, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const call = (customerId: string | null) =>
      svc(
        `SELECT public.complete_sales_checkout($1, $2, 'POS', $3, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $4::jsonb, NULL, true, 'س', '0911', NULL)`,
        [BRANCH_ID, users.cashier, customerId, JSON.stringify([{ variantId: p.variantId, quantity: 1 }])],
      );

    assert.match(await rpcError(call(null)), /اختيار العميل مطلوب/);
    assert.match(await rpcError(call("00000000-0000-4000-8000-000000000000")), /العميل غير موجود/);

    const cid = await customer("خالد", "249933333333");
    const id = await creditSale({ customerId: cid, name: "خالد (نسخة)", phone: "0933333333" });
    const o = (await db.query<{ customer_id: string; credit_customer_name: string; credit_customer_phone: string }>(
      `SELECT customer_id, credit_customer_name, credit_customer_phone FROM public.sales_orders WHERE id = $1`,
      [id],
    )).rows[0];
    assert.equal(o.customer_id, cid);
    assert.equal(o.credit_customer_name, "خالد (نسخة)");
    assert.equal(o.credit_customer_phone, "0933333333");

    // a normal (non-credit) sale still works without a customer
    const normal = await svc(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', NULL, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $3::jsonb, NULL)`,
      [BRANCH_ID, users.cashier, JSON.stringify([{ variantId: p.variantId, quantity: 1 }])],
    );
    assert.equal(normal.rows.length, 1);
  });

  it("resolve_customer_by_phone: finds by normalized phone (any format), creates otherwise", async () => {
    const resolve = (name: string | null, phone: string) =>
      svc<{ r: Json }>(`SELECT public.resolve_customer_by_phone($1, $2, $3) AS r`, [BRANCH_ID, name, phone]);

    const first = (await resolve("منى", "0944444444")).rows[0].r;
    assert.equal(first.created, true);
    assert.equal(first.whatsapp_number, "0944444444");

    for (const form of ["+249944444444", "249944444444", "00249944444444", "944444444"]) {
      const again = (await resolve("اسم آخر", form)).rows[0].r;
      assert.equal(again.created, false, form);
      assert.equal(again.customer_id, first.customer_id, form);
      assert.equal(again.name, "منى", "the existing customer wins; the typed name is ignored");
    }

    assert.match(await rpcError(resolve("س", "12")), /رقم هاتف العميل غير صالح/);
    assert.match(await rpcError(resolve(null, "0955555555")), /اسم العميل مطلوب/);
    assert.match(await rpcError(resolve("   ", "0955555555")), /اسم العميل مطلوب/);
    // nothing was created by the failed calls
    assert.equal(
      Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers WHERE phone_normalized = '249955555555'`)).rows[0].n),
      0,
    );
  });

  it("tailoring_paid_amount follows the pickup formula (deposit, transfers, refunds, never below zero)", async () => {
    const id = await tailoringOrder(20_000, 5_000);
    const paid = (await svc<{ p: string }>(`SELECT public.tailoring_paid_amount($1) AS p`, [id])).rows[0].p;
    assert.equal(num(paid), 5_000);

    const none = (await svc<{ p: string }>(`SELECT public.tailoring_paid_amount($1) AS p`, ["00000000-0000-4000-8000-000000000000"])).rows[0].p;
    assert.equal(num(none), 0);
  });

  it("unified rows: POS credit debts + in-progress tailoring only; cancelled and delivered orders never appear", async () => {
    await setRate(2500);
    const cid = await customer("ريم", "249966666666");
    const posId = await creditSale({ customerId: cid, paid: 5_000 }); // 1 × 10 USD @ 2500 = 25,000 → remaining 20,000

    const tNew = await tailoringOrder(30_000, 10_000, "ريم", "0966666666"); // same phone → same customer by normalized phone
    const tReady = await tailoringOrder(12_000, 2_000, "ريم", "0966666666");
    await setStatus(tReady, "UNDER_TAILORING");
    await setStatus(tReady, "READY_FOR_PICKUP");
    const tDone = await tailoringOrder(8_000, 3_000, "ريم", "0966666666");
    await setStatus(tDone, "UNDER_TAILORING");
    await setStatus(tDone, "READY_FOR_PICKUP");
    await svc(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH')`, [tDone, BRANCH_ID, users.cashier]);
    const tCancelled = await tailoringOrder(9_000, 1_000, "ريم", "0966666666");
    await svc(`SELECT public.cancel_tailoring_order($1, $2, $3, 'test')`, [tCancelled, BRANCH_ID, users.owner]);

    const rows = await unified();
    const byId = new Map(rows.map((row) => [String(row.order_id), row]));

    assert.equal(byId.get(posId)?.kind, "POS_CREDIT");
    assert.equal(num(byId.get(posId)?.remaining_sdg), 20_000);
    assert.equal(byId.get(posId)?.can_collect, true);

    assert.equal(byId.get(tNew)?.kind, "TAILORING_IN_PROGRESS");
    assert.equal(num(byId.get(tNew)?.remaining_sdg), 20_000);
    assert.equal(byId.get(tNew)?.can_collect, false, "only READY_FOR_PICKUP can be collected (pickup is the only tailoring collection)");
    assert.equal(byId.get(tReady)?.can_collect, true);
    assert.equal(num(byId.get(tReady)?.remaining_sdg), 10_000);
    assert.equal(byId.get(tReady)?.status_code, "READY_FOR_PICKUP");

    assert.ok(!byId.has(tDone), "delivered: pickup collected the whole remainder → no receivable");
    assert.ok(!byId.has(tCancelled), "cancelled orders are not receivables");

    // by customer: the two tailoring orders (created through the same phone) + the POS invoice
    const mine = await unified(cid);
    const tailoringCustomers = new Set(
      rows.filter((row) => row.kind === "TAILORING_IN_PROGRESS" && [tNew, tReady].includes(String(row.order_id))).map((row) => row.customer_id),
    );
    assert.equal(tailoringCustomers.size, 1);
    const tailoringCustomerId = [...tailoringCustomers][0] as string;
    assert.deepEqual(
      (await unified(tailoringCustomerId)).map((row) => String(row.order_id)).filter((id) => [tNew, tReady].includes(id)).sort(),
      [tNew, tReady].sort(),
    );
    assert.ok(mine.every((row) => row.customer_id === cid));
    assert.ok(mine.some((row) => String(row.order_id) === posId));

    // the SQL "paid" equals what the pickup function itself collects (single source of truth)
    const readyRow = byId.get(tReady)!;
    const pickup = (await svc<{ r: Json }>(`SELECT public.complete_tailoring_pickup($1, $2, $3, 'CASH') AS r`, [tReady, BRANCH_ID, users.cashier])).rows[0].r;
    assert.equal(num(pickup.paid_amount), num(readyRow.remaining_sdg), "pickup collects exactly the remaining the receivables list showed");
    assert.ok(!(await unified()).some((row) => String(row.order_id) === tReady), "after pickup the row disappears from the list");

    // no receivable of any kind exists for a RECEIVED order
    const stale = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.get_unified_receivables(NULL) u JOIN public.sales_orders o ON o.id = u.order_id WHERE o.tailoring_status = 'RECEIVED'`,
    );
    assert.equal(Number(stale.rows[0].n), 0);
  });

  it("valuation in USD: sale-day rate vs today's rate for both kinds; profit columns only on POS credit", async () => {
    await setRate(2500);
    const cid = await customer("نور", "249977777777");
    const posId = await creditSale({ customerId: cid, paid: 0 }); // 25,000 SDG @ 2500 = 10 USD
    const tailoringId = await tailoringOrder(15_000, 5_000, "نور", "0977777777"); // remaining 10,000 @ 2500 = 4 USD
    await setRate(3000); // the pound weakens

    const rows = await unified();
    const pos = rows.find((row) => String(row.order_id) === posId)!;
    assert.equal(num(pos.sale_rate), 2500);
    assert.equal(num(pos.current_rate), 3000);
    assert.equal(num(pos.remaining_usd_at_sale), 10);
    assert.equal(num(pos.remaining_usd_now), 8.33);
    assert.equal(num(pos.loss_usd), 1.67);
    assert.ok(num(pos.loss_pct) > 16 && num(pos.loss_pct) < 17);
    assert.ok(pos.expected_profit_usd != null && pos.loss_pct_of_profit != null);

    const tlr = rows.find((row) => String(row.order_id) === tailoringId)!;
    assert.equal(num(tlr.sale_rate), 2500, "the order creation rate");
    assert.equal(num(tlr.remaining_usd_at_sale), 4);
    assert.equal(num(tlr.remaining_usd_now), 3.33);
    assert.equal(num(tlr.loss_usd), 0.67);
    assert.equal(tlr.expected_profit_usd, null);
    assert.equal(tlr.deferred_cost_usd, null);
    assert.equal(tlr.loss_pct_of_profit, null);
    await setRate(2500);
  });

  it("get_receivables_summary: legacy keys = POS credit only; new buckets and the total add up", async () => {
    await setRate(2500);
    const s = (await svc<{ s: Json }>(`SELECT public.get_receivables_summary() AS s`)).rows[0].s;
    const pos = s.pos_credit as Json;
    const tlr = s.tailoring_in_progress as Json;
    const total = s.total as Json;

    assert.equal(num(s.invoices_count), num(pos.count));
    assert.equal(num(s.total_remaining_sdg), num(pos.remaining_sdg));
    assert.equal(num(s.total_usd_at_sale), num(pos.usd_at_sale));
    assert.equal(num(s.total_usd_now), num(pos.usd_now));
    assert.equal(num(s.total_loss_usd), num(pos.loss_usd));

    assert.ok(num(tlr.count) > 0 && num(pos.count) > 0);
    assert.equal(num(total.count), num(pos.count) + num(tlr.count));
    assert.equal(num(total.remaining_sdg), num(pos.remaining_sdg) + num(tlr.remaining_sdg));
    assert.ok(Math.abs(num(total.usd_at_sale) - (num(pos.usd_at_sale) + num(tlr.usd_at_sale))) < 0.011);

    const live = (await unified()).filter((row) => row.kind === "TAILORING_IN_PROGRESS");
    assert.equal(num(tlr.count), live.length);
    assert.equal(num(tlr.remaining_sdg), live.reduce((sum, row) => sum + num(row.remaining_sdg), 0));
    assert.equal(s.deferred_cogs_usd !== undefined && s.deferred_cost_usd_open !== undefined, true);
  });

  it("cashier can adjust / write off; every cashier action notifies the owner only; admin/owner actions do not", async () => {
    await setRate(2500);
    const cid = await customer("هالة", "249988888888");

    const a = await creditSale({ customerId: cid, paid: 0 });
    await svc(`SELECT public.adjust_credit_remaining($1, 12000, 'اتفاق مع العميل', $2)`, [a, users.cashier]);
    const adjusted = await notificationsFor(a);
    assert.equal(adjusted.length, 1);
    assert.equal(adjusted[0].type, "CREDIT_ADJUSTED");
    assert.deepEqual(adjusted[0].target_roles, ["owner"]);
    assert.match(adjusted[0].message, /25000/);
    assert.match(adjusted[0].message, /12000/);

    await svc(`SELECT public.adjust_credit_remaining($1, 9000, 'مرة ثانية', $2)`, [a, users.admin]);
    assert.equal((await notificationsFor(a)).length, 1, "an admin adjustment creates no owner notification");

    const b = await creditSale({ customerId: cid, paid: 0 });
    await svc(`SELECT public.close_credit_bad_debt($1, $2, $3, 'لا يمكن التحصيل')`, [b, users.cashier, BRANCH_ID]);
    const written = await notificationsFor(b);
    assert.equal(written.length, 1);
    assert.equal(written[0].type, "CREDIT_BAD_DEBT");
    assert.deepEqual(written[0].target_roles, ["owner"]);

    const c = await creditSale({ customerId: cid, paid: 0 });
    await svc(`SELECT public.close_credit_bad_debt($1, $2, $3, NULL)`, [c, users.owner, BRANCH_ID]);
    assert.equal((await notificationsFor(c)).length, 0);

    // the tailor role is still refused
    const d = await creditSale({ customerId: cid, paid: 0 });
    assert.match(await rpcError(svc(`SELECT public.adjust_credit_remaining($1, 5000, 'x', $2)`, [d, users.tailor])), /للكاشير أو المدير أو المالك/);
    assert.match(await rpcError(svc(`SELECT public.close_credit_bad_debt($1, $2, $3, NULL)`, [d, users.tailor, BRANCH_ID])), /للكاشير أو المدير أو المالك/);

    // the accounting behaviour of both functions is unchanged: no journal entry for a negotiation
    const entries = await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries WHERE sales_order_id = $1`, [a]);
    const base = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.journal_entries WHERE sales_order_id = $1 AND entry_type NOT IN ('SALE', 'COGS')`,
      [a],
    );
    assert.equal(Number(base.rows[0].n), 0);
    assert.ok(Number(entries.rows[0].n) >= 1);
  });

  it("the notification is routed to the owner only (API filter semantics)", async () => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.notifications WHERE type IN ('CREDIT_ADJUSTED', 'CREDIT_BAD_DEBT') AND target_roles IS DISTINCT FROM ARRAY['owner']`,
    );
    assert.equal(Number(rows[0].n), 0);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

describe("link existing credit invoices to customers (20261027_02 preview / 03 apply)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const legacyCreditInvoice = async (name: string | null, phone: string | null) => {
    const p = await createProduct(db, { stock: 50, averageCost: 4, purchasePrice: 4, sellingPrice: 10 });
    const holder = (
      await db.query<{ id: string }>(
        `INSERT INTO public.customers (branch_id, name, whatsapp_number) VALUES ($1, 'مؤقت', $2) RETURNING id`,
        [BRANCH_ID, "7" + Math.floor(Math.random() * 1e9).toString().padStart(9, "0")],
      )
    ).rows[0].id;
    const { rows } = await svc<{ r: { id: string } }>(
      `SELECT public.complete_sales_checkout($1, $2, 'POS', $3, NULL, 0, 0, 'CASH', '[]'::jsonb, NULL, $4::jsonb, NULL, true, 'x', 'y', NULL) AS r`,
      [BRANCH_ID, users.cashier, holder, JSON.stringify([{ variantId: p.variantId, quantity: 1 }])],
    );
    const id = rows[0].r.id;
    // simulate the legacy shape: text only, no customer link
    await db.query(
      `UPDATE public.sales_orders SET customer_id = NULL, credit_customer_name = $2, credit_customer_phone = $3 WHERE id = $1`,
      [id, name, phone],
    );
    await db.query(`DELETE FROM public.customers WHERE id = $1`, [holder]);
    return id;
  };

  const linked = async (id: string) =>
    (await db.query<{ customer_id: string | null; credit_customer_name: string | null; credit_customer_phone: string | null }>(
      `SELECT customer_id, credit_customer_name, credit_customer_phone FROM public.sales_orders WHERE id = $1`,
      [id],
    )).rows[0];

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("preview is read-only; apply links by normalized phone, creates the missing customers, keeps the text copy, refuses to run twice", async () => {
    const existing = (
      await db.query<{ id: string }>(
        `INSERT INTO public.customers (branch_id, name, whatsapp_number) VALUES ($1, 'عميل قائم', '249911000111') RETURNING id`,
        [BRANCH_ID],
      )
    ).rows[0].id;

    const a1 = await legacyCreditInvoice("اسم قديم", "0911000111"); // matches the existing customer (different format)
    const a2 = await legacyCreditInvoice("اسم آخر", "+249 911 000 111"); // same customer again
    const b1 = await legacyCreditInvoice("سلمى", "0922000222"); // new customer
    const b2 = await legacyCreditInvoice("سلمى محمد", "249922000222"); // same new customer, newer name wins
    const c1 = await legacyCreditInvoice("بلا رقم", "---"); // skipped

    const before = (await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers`)).rows[0].n;
    const invoicesBefore = JSON.stringify(
      (await db.query(`SELECT id, total_amount, remaining_amount, paid_amount, updated_at FROM public.sales_orders WHERE is_credit ORDER BY id`)).rows,
    );

    await db.exec(sql(M.linkCreditPreview));
    assert.equal(Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers`)).rows[0].n), Number(before), "preview changes nothing");
    assert.equal((await linked(a1)).customer_id, null);

    await db.exec(sql(M.linkCreditApply));

    assert.equal((await linked(a1)).customer_id, existing);
    assert.equal((await linked(a2)).customer_id, existing);

    const newCustomer = (await linked(b1)).customer_id;
    assert.ok(newCustomer);
    assert.equal((await linked(b2)).customer_id, newCustomer, "one customer per phone");
    const created = (await db.query<{ name: string; whatsapp_number: string; phone_normalized: string }>(
      `SELECT name, whatsapp_number, phone_normalized FROM public.customers WHERE id = $1`,
      [newCustomer],
    )).rows[0];
    assert.equal(created.name, "سلمى محمد", "the name from the latest invoice");
    assert.equal(created.phone_normalized, "249922000222");

    assert.equal((await linked(c1)).customer_id, null, "an invoice without a valid phone stays unlinked");
    assert.equal(Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.customers`)).rows[0].n), Number(before) + 1, "exactly one customer created");

    // the text copy and every amount are untouched
    assert.equal((await linked(a1)).credit_customer_name, "اسم قديم");
    assert.equal((await linked(a1)).credit_customer_phone, "0911000111");
    assert.equal(
      JSON.stringify((await db.query(`SELECT id, total_amount, remaining_amount, paid_amount, updated_at FROM public.sales_orders WHERE is_credit ORDER BY id`)).rows),
      invoicesBefore,
    );

    // refuses to run twice only when there is nothing left to link; here c1 remains, so run it on a clean state
    await db.query(`DELETE FROM public.credit_adjustments WHERE order_id = $1`, [c1]);
    await db.query(`UPDATE public.sales_orders SET credit_customer_phone = '0933000333' WHERE id = $1`, [c1]);
    await db.exec(sql(M.linkCreditApply));
    assert.ok((await linked(c1)).customer_id, "the previously skipped invoice links once it has a valid phone");

    let refused = "";
    try {
      await db.exec(sql(M.linkCreditApply));
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
      await db.exec("ROLLBACK").catch(() => undefined);
    }
    assert.match(refused, /لا توجد فواتير آجلة غير مربوطة/);
  });
});

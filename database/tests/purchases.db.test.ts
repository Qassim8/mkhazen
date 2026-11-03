/**
 * receive_purchase_order / record_purchase_payment (20261010_02) on the REAL
 * live schema, after the full hardening sequence, called as service_role
 * (exactly how the server calls them). Run: npm run test:db
 *
 * ⚠️ PGlite has a single connection, so true concurrency (two requests at the
 * same instant) cannot be exercised here; it relies on FOR UPDATE / advisory
 * locks and is listed for staging in docs/release-plan.md §5.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import { allocateDeliveryCost } from "@/app/api/purchases/_lib/purchase-costs";
import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  createProduct,
  createPurchaseOrder,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  seedBase,
  type Users,
} from "./db-harness";

after(releaseTemplate);

describe("receive_purchase_order (live schema, service_role)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const receive = (orderId: string, userId: string, branchId = BRANCH_ID) =>
    asRole(db, "service_role", () =>
      db.query<{ result: Record<string, unknown> }>(`SELECT public.receive_purchase_order($1, $2, $3) AS result`, [
        orderId,
        userId,
        branchId,
      ]),
    );

  it("receives once: stock, average cost, movements, items and one USD journal entry — matches the app's allocation", async () => {
    const carton = await createProduct(db, { conversionFactor: 10 });
    const piece = await createProduct(db, { conversionFactor: 1 });
    const items = [
      { ...carton, quantity: 2, unitCost: 600 },
      { ...piece, quantity: 5, unitCost: 33.33 },
    ];
    const { orderId, orderNumber, total } = await createPurchaseOrder(db, { deliveryCost: 50, discountAmount: 20, items });

    const { rows } = await receive(orderId, users.admin);
    assert.equal(rows[0].result.status, "RECEIVED");

    const expected = allocateDeliveryCost(
      50,
      items.map((item, index) => ({ quantity: item.quantity, unitCost: item.unitCost, conversionFactor: index === 0 ? 10 : 1 })),
      20,
    );

    const variants = await db.query<{ id: string; stock: string; avg: string; price: string }>(
      `SELECT id, "stockQuantity" AS stock, "averageCost" AS avg, "purchasePrice" AS price
       FROM public.product_variants WHERE id = ANY($1)`,
      [[carton.variantId, piece.variantId]],
    );
    const byId = new Map(variants.rows.map((row) => [row.id, row]));
    assert.equal(num(byId.get(carton.variantId)!.stock), 20);
    assert.equal(num(byId.get(piece.variantId)!.stock), 5);
    assert.equal(num(byId.get(carton.variantId)!.avg), expected[0].effectiveUnitCost);
    assert.equal(num(byId.get(piece.variantId)!.avg), expected[1].effectiveUnitCost);
    assert.equal(num(byId.get(carton.variantId)!.price), 600, "purchasePrice stays per purchase unit");

    const movements = await db.query<{ quantity: string; movement_type: string; reference: string; total_cost_usd: string }>(
      `SELECT quantity, movement_type, reference, total_cost_usd FROM public.inventory_movements
       WHERE purchase_order_id = $1 ORDER BY quantity DESC`,
      [orderId],
    );
    assert.deepEqual(
      movements.rows.map((row) => [num(row.quantity), row.movement_type, row.reference]),
      [
        [20, "PURCHASE", `PO-${orderNumber}`],
        [5, "PURCHASE", `PO-${orderNumber}`],
      ],
    );
    assert.ok(movements.rows.every((row) => row.total_cost_usd !== null), "live USD cost snapshot trigger fired");

    const cartonItem = (
      await db.query<{ received: string; delivery: string; effective: string }>(
        `SELECT received_quantity AS received, allocated_delivery_cost AS delivery, effective_unit_cost AS effective
         FROM public.purchase_order_items WHERE purchase_order_id = $1 AND variant_id = $2`,
        [orderId, carton.variantId],
      )
    ).rows[0];
    assert.equal(num(cartonItem.received), 2);
    assert.equal(num(cartonItem.delivery), expected[0].allocatedDeliveryCost);
    assert.equal(num(cartonItem.effective), expected[0].effectiveUnitCost);

    const journal = await db.query<{ amount: string; amount_usd: string; debit: string; credit: string; type: string; currency: string; entry_number: string }>(
      `SELECT amount, amount_usd, debit_account AS debit, credit_account AS credit, entry_type AS type, currency, entry_number
       FROM public.journal_entries WHERE purchase_order_id = $1`,
      [orderId],
    );
    assert.equal(journal.rows.length, 1);
    const entry = journal.rows[0];
    assert.deepEqual(
      [num(entry.amount), num(entry.amount_usd), entry.debit, entry.credit, entry.type, entry.currency],
      [total, total, "INVENTORY", "SUPPLIERS", "PURCHASE", "USD"],
    );
    assert.match(entry.entry_number, /^JE-\d{4}-[0-9A-F]{10}$/);
    assert.ok(entry.entry_number.length <= 50, "fits journal_entries.entry_number varchar(50)");

    const order = await db.query<{ status: string; received_by: string; journal_entry_id: string }>(
      `SELECT status, received_by, journal_entry_id FROM public.purchase_orders WHERE id = $1`,
      [orderId],
    );
    assert.equal(order.rows[0].status, "RECEIVED");
    assert.equal(order.rows[0].received_by, users.admin);
    assert.ok(order.rows[0].journal_entry_id);
  });

  it("rejects a duplicate receipt (double click / retry) without adding stock again", async () => {
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 3, unitCost: 10 }] });

    await receive(orderId, users.owner);
    assert.match(await rpcError(receive(orderId, users.owner)), /لا يمكن استلام هذا الطلب في حالته الحالية/);

    const stock = await db.query<{ s: string }>(`SELECT "stockQuantity" AS s FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].s), 3);
    const journals = await db.query(`SELECT 1 FROM public.journal_entries WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(journals.rows.length, 1);
  });

  it("a failure on a later line rolls back everything (no partial stock, movement, journal or status change)", async () => {
    // lines are processed in variant_id order: make the failing line the LAST one
    const a = await createProduct(db, { stock: 4, averageCost: 7, purchasePrice: 7 });
    const b = await createProduct(db, { stock: 4, averageCost: 7, purchasePrice: 7 });
    const [first, second] = a.variantId < b.variantId ? [a, b] : [b, a];
    // test-only fault injection on the second line's movement
    await db.exec(`
      CREATE FUNCTION public.zz_fail_movement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.variant_id = '${second.variantId}' THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER zz_fail BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.zz_fail_movement();
    `);
    try {
      const { orderId } = await createPurchaseOrder(db, {
        items: [
          { ...first, quantity: 5, unitCost: 10 },
          { ...second, quantity: 1, unitCost: 10 },
        ],
      });
      assert.match(await rpcError(receive(orderId, users.admin)), /injected failure/);

      const variant = await db.query<{ s: string; a: string }>(
        `SELECT "stockQuantity" AS s, "averageCost" AS a FROM public.product_variants WHERE id = $1`,
        [first.variantId],
      );
      assert.equal(num(variant.rows[0].s), 4, "first line (already applied) rolled back");
      assert.equal(num(variant.rows[0].a), 7);
      for (const table of ["inventory_movements", "journal_entries"]) {
        const rows = await db.query(`SELECT 1 FROM public.${table} WHERE purchase_order_id = $1`, [orderId]);
        assert.equal(rows.rows.length, 0, `${table} must stay empty`);
      }
      const items = await db.query<{ r: string }>(`SELECT received_quantity AS r FROM public.purchase_order_items WHERE purchase_order_id = $1`, [orderId]);
      assert.ok(items.rows.every((row) => num(row.r) === 0));
      const order = await db.query<{ status: string }>(`SELECT status FROM public.purchase_orders WHERE id = $1`, [orderId]);
      assert.equal(order.rows[0].status, "APPROVED");
    } finally {
      await db.exec(`DROP TRIGGER zz_fail ON public.inventory_movements; DROP FUNCTION public.zz_fail_movement();`);
    }
  });

  it("weighted average with existing stock", async () => {
    const product = await createProduct(db, { stock: 10, averageCost: 50, purchasePrice: 50 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 10, unitCost: 70 }] });
    await receive(orderId, users.admin);
    const row = await db.query<{ s: string; a: string }>(`SELECT "stockQuantity" AS s, "averageCost" AS a FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(row.rows[0].s), 20);
    assert.equal(num(row.rows[0].a), 60);
  });

  it("averageCost 0 with stock falls back to purchasePrice per selling unit (same basis as checkout)", async () => {
    // 12 pieces in stock, carton of 6 bought at 60 → 10 per piece; averageCost unknown (0)
    const product = await createProduct(db, { conversionFactor: 6, stock: 12, averageCost: 0, purchasePrice: 60 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 2, unitCost: 120 }] });
    await receive(orderId, users.admin);
    const row = await db.query<{ s: string; a: string }>(`SELECT "stockQuantity" AS s, "averageCost" AS a FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(row.rows[0].s), 24);
    assert.equal(num(row.rows[0].a), 15, "(12×10 + 12×20) / 24");
  });

  it("rejects draft/cancelled/missing orders and unauthorized callers (role, inactive, other branch)", async () => {
    const product = await createProduct(db);
    const draft = await createPurchaseOrder(db, { status: "DRAFT", items: [{ ...product, quantity: 1, unitCost: 5 }] });
    const cancelled = await createPurchaseOrder(db, { status: "CANCELLED", items: [{ ...product, quantity: 1, unitCost: 5 }] });
    const approved = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 5 }] });

    assert.match(await rpcError(receive(draft.orderId, users.owner)), /حالته الحالية/);
    assert.match(await rpcError(receive(cancelled.orderId, users.owner)), /حالته الحالية/);
    assert.match(await rpcError(receive("00000000-0000-4000-8000-0000000000aa", users.owner)), /طلب الشراء غير موجود/);
    assert.match(await rpcError(receive(approved.orderId, users.tailor)), /للمالك أو المدير أو الكاشير فقط/);
    assert.match(await rpcError(receive(approved.orderId, users.inactiveAdmin)), /غير صالح لهذا الفرع/);
    assert.match(await rpcError(receive(approved.orderId, users.otherBranchAdmin)), /غير صالح لهذا الفرع/);
    assert.match(await rpcError(receive(approved.orderId, "00000000-0000-4000-8000-0000000000bb")), /غير صالح لهذا الفرع/);

    // legacy upper-case enum value ADMIN is accepted (live "Role" enum has both spellings)
    const ok = await receive(approved.orderId, users.legacyUpperAdmin);
    assert.equal(ok.rows[0].result.status, "RECEIVED");
  });

  it("20261023_01: the cashier can receive an approved order", async () => {
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 5 }] });
    const ok = await receive(orderId, users.cashier);
    assert.equal(ok.rows[0].result.status, "RECEIVED");
  });
});

describe("record_purchase_payment (live schema, service_role)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const pay = (orderId: string, amount: number, method = "CASH", userId?: string) =>
    asRole(db, "service_role", () =>
      db.query<{ result: Record<string, unknown> }>(
        `SELECT public.record_purchase_payment($1, $2, $3, $4, $5, $6, $7, $8) AS result`,
        [orderId, userId ?? users.admin, BRANCH_ID, amount, new Date().toISOString(), method, "REF-1", null],
      ),
    );

  it("records payment + journal together and never exceeds the remaining amount", async () => {
    await fundAccount(db, "CASH", 1000);
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 10, unitCost: 30 }] });

    const first = await pay(orderId, 100);
    assert.equal(num(first.rows[0].result.amount), 100);
    assert.ok(first.rows[0].result.journal_entry_id);
    assert.equal(first.rows[0].result.payment_method, "CASH");

    await pay(orderId, 200);
    assert.match(await rpcError(pay(orderId, 0.01)), /أكبر من المبلغ المتبقي \(0\.00 \$\)/);

    const payments = await db.query<{ total: string }>(`SELECT sum(amount) AS total FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(num(payments.rows[0].total), 300);

    const journals = await db.query<{ debit: string; credit: string; type: string; amount: string; currency: string }>(
      `SELECT debit_account AS debit, credit_account AS credit, entry_type AS type, amount, currency
       FROM public.journal_entries WHERE purchase_order_id = $1 ORDER BY amount`,
      [orderId],
    );
    assert.deepEqual(
      journals.rows.map((row) => [row.type, row.debit, row.credit, num(row.amount), row.currency]),
      [
        ["PURCHASE_PAYMENT", "SUPPLIERS", "CASH", 100, "USD"],
        ["PURCHASE_PAYMENT", "SUPPLIERS", "CASH", 200, "USD"],
      ],
    );
  });

  it("refuses when the USD balance is insufficient (SDG balance does not count) — same number as get_account_balance", async () => {
    await fundAccount(db, "BANK", 50, "USD");
    await fundAccount(db, "BANK", 10_000_000, "SDG");
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 80 }] });

    assert.match(await rpcError(pay(orderId, 80, "BANK")), /الرصيد غير كافٍ في البنك \(دولار\)\. الرصيد الحالي 50\.00 \$/);
    const payments = await db.query(`SELECT 1 FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(payments.rows.length, 0);

    await pay(orderId, 50, "BANK");
    assert.match(await rpcError(pay(orderId, 1, "BANK")), /الرصيد الحالي 0\.00 \$/);
    const balance = await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'BANK', 'USD') AS b`, [BRANCH_ID]);
    assert.equal(num(balance.rows[0].b), 0);
  });

  it("rejects draft, cancelled, invalid amounts, invalid method and unauthorized users", async () => {
    await fundAccount(db, "CASH", 1000);
    const product = await createProduct(db);
    const draft = await createPurchaseOrder(db, { status: "DRAFT", items: [{ ...product, quantity: 1, unitCost: 10 }] });
    const cancelled = await createPurchaseOrder(db, { status: "CANCELLED", items: [{ ...product, quantity: 1, unitCost: 10 }] });
    const approved = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 10 }] });

    assert.match(await rpcError(pay(draft.orderId, 5)), /قبل اعتماد طلب الشراء/);
    assert.match(await rpcError(pay(cancelled.orderId, 5)), /طلب شراء ملغي/);
    assert.match(await rpcError(pay(approved.orderId, 0)), /أكبر من صفر/);
    assert.match(await rpcError(pay(approved.orderId, -5)), /أكبر من صفر/);
    assert.match(await rpcError(pay(approved.orderId, 5, "CARD")), /خزينة أو بنك/);
    assert.match(await rpcError(pay(approved.orderId, 5, "CASH", users.tailor)), /للمالك أو المدير أو الكاشير فقط/);
    assert.match(await rpcError(pay(approved.orderId, 5, "CASH", users.inactiveAdmin)), /غير صالح لهذا الفرع/);
    assert.match(await rpcError(pay(approved.orderId, 5, "CASH", users.otherBranchAdmin)), /غير صالح لهذا الفرع/);
  });

  it("20261023_01: the cashier can record a supplier payment", async () => {
    await fundAccount(db, "CASH", 100);
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 10 }] });
    await pay(orderId, 4, "CASH", users.cashier);
    const paid = await db.query<{ s: string }>(`SELECT COALESCE(sum(amount), 0) AS s FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(num(paid.rows[0].s), 4);
  });

  it("accepts payment after receipt (RECEIVED)", async () => {
    await fundAccount(db, "CASH", 500);
    const product = await createProduct(db);
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 2, unitCost: 25 }] });
    await asRole(db, "service_role", () => db.query(`SELECT public.receive_purchase_order($1, $2, $3)`, [orderId, users.owner, BRANCH_ID]));
    const result = await pay(orderId, 50);
    assert.equal(num(result.rows[0].result.amount), 50);
  });
});

describe("receive_purchase_order_with_payment (20261103_01) — no partial receipt", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  const receiveAndPay = (orderId: string, amount: number, method = "CASH", userId?: string) =>
    asRole(db, "service_role", () =>
      db.query<{ result: Record<string, unknown> }>(
        `SELECT public.receive_purchase_order_with_payment($1, $2, $3, $4, $5, $6, 'REF', NULL) AS result`,
        [orderId, userId ?? users.admin, BRANCH_ID, amount, new Date().toISOString(), method],
      ),
    );

  const untouched = async (orderId: string, variantId: string) => {
    const order = await db.query<{ status: string }>(`SELECT status FROM public.purchase_orders WHERE id = $1`, [orderId]);
    assert.equal(order.rows[0].status, "APPROVED");
    const stock = await db.query<{ q: string }>(`SELECT "stockQuantity" AS q FROM public.product_variants WHERE id = $1`, [variantId]);
    assert.equal(num(stock.rows[0].q), 0);
    const movements = await db.query(`SELECT 1 FROM public.inventory_movements WHERE variant_id = $1`, [variantId]);
    assert.equal(movements.rows.length, 0);
    const journals = await db.query(`SELECT 1 FROM public.journal_entries WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(journals.rows.length, 0);
    const payments = await db.query(`SELECT 1 FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(payments.rows.length, 0);
  };

  it("insufficient balance: refused before any change (no stock, movement, entry, payment or status change)", async () => {
    await fundAccount(db, "CASH", 50);
    const product = await createProduct(db, { stock: 0 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 80 }] });

    const message = await rpcError(receiveAndPay(orderId, 80, "CASH"));
    assert.match(
      message,
      /^رصيد الخزينة غير كافٍ: المتاح 50\.00 دولار، والمطلوب 80\.00 دولار\. موّل الحساب أولًا أو أدخل مبلغ دفع أقل\.$/,
    );
    await untouched(orderId, product.variantId);
  });

  it("adds the currency-exchange hint only when the SDG balance of the same account would cover it", async () => {
    await fundAccount(db, "BANK", 10, "USD");
    await fundAccount(db, "BANK", 10_000_000, "SDG");
    const product = await createProduct(db, { stock: 0 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 80 }] });

    assert.match(await rpcError(receiveAndPay(orderId, 80, "BANK")), /^رصيد البنك غير كافٍ: المتاح 10\.00 دولار، والمطلوب 80\.00 دولار\. موّل الحساب أولًا أو أدخل مبلغ دفع أقل أو حوّل العملة من صفحة تحويل العملة\.$/);

    // الجنيه في الخزينة لا يكفي → بدون الجملة
    await fundAccount(db, "CASH", 1_000, "SDG");
    assert.doesNotMatch(await rpcError(receiveAndPay(orderId, 80, "CASH")), /تحويل العملة/);
    await untouched(orderId, product.variantId);
  });

  it("enough balance: receives and records a partial payment, the rest stays a supplier debt", async () => {
    await fundAccount(db, "CASH", 100);
    const balanceBefore = await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'CASH', 'USD') AS b`, [BRANCH_ID]);
    const product = await createProduct(db, { stock: 0 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 10, unitCost: 30 }] });

    const { rows } = await receiveAndPay(orderId, 100, "CASH", users.cashier);
    assert.equal(rows[0].result.status, "RECEIVED");
    assert.equal(num((rows[0].result.payment as Record<string, unknown>).amount), 100);

    const stock = await db.query<{ q: string }>(`SELECT "stockQuantity" AS q FROM public.product_variants WHERE id = $1`, [product.variantId]);
    assert.equal(num(stock.rows[0].q), 10);
    const paid = await db.query<{ total: string }>(`SELECT sum(amount) AS total FROM public.purchase_order_payments WHERE purchase_order_id = $1`, [orderId]);
    assert.equal(num(paid.rows[0].total), 100);
    const balance = await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'CASH', 'USD') AS b`, [BRANCH_ID]);
    assert.equal(num(balance.rows[0].b), num(balanceBefore.rows[0].b) - 100);
  });

  it("a payment failure after the pre-check (amount above the order total) rolls the receipt back too", async () => {
    await fundAccount(db, "CASH", 1_000);
    const product = await createProduct(db, { stock: 0 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 80 }] });

    assert.match(await rpcError(receiveAndPay(orderId, 500, "CASH")), /أكبر من المبلغ المتبقي/);
    await untouched(orderId, product.variantId);
  });

  it("an order that is not approved keeps its own error; invalid method and zero amount are refused", async () => {
    await fundAccount(db, "CASH", 1_000);
    const product = await createProduct(db, { stock: 0 });
    const draft = await createPurchaseOrder(db, { status: "DRAFT", items: [{ ...product, quantity: 1, unitCost: 10 }] });
    const approved = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 10 }] });

    assert.doesNotMatch(await rpcError(receiveAndPay(draft.orderId, 10, "CASH")), /رصيد/);
    assert.match(await rpcError(receiveAndPay(approved.orderId, 10, "CHEQUE")), /خزينة أو بنك/);
    assert.match(await rpcError(receiveAndPay(approved.orderId, 0, "CASH")), /أكبر من صفر/);
  });

  it("anon and authenticated cannot call the new functions", async () => {
    const product = await createProduct(db, { stock: 0 });
    const { orderId } = await createPurchaseOrder(db, { items: [{ ...product, quantity: 1, unitCost: 10 }] });
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(
        asRole(db, role, () =>
          db.query(`SELECT public.receive_purchase_order_with_payment($1, $2, $3, 1, now(), 'CASH', NULL, NULL)`, [orderId, users.admin, BRANCH_ID]),
        ),
        /permission denied/,
      );
      await assert.rejects(
        asRole(db, role, () => db.query(`SELECT public.check_purchase_payment_funds($1, 'CASH', 1)`, [BRANCH_ID])),
        /permission denied/,
      );
    }
  });
});

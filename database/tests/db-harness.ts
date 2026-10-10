/**
 * Isolated in-process Postgres (PGlite, PG 18) loaded with the REAL live schema
 * export (database/audit/live_public_schema.sql) plus the three Supabase API
 * roles. Test-only: never connects to the client's database.
 *
 * What this can prove: SQL validity against the live tables/constraints/
 * triggers, ACL effects (SET ROLE anon/authenticated/service_role), function
 * results and rollback-on-error.
 * What it cannot prove (staging on real Supabase only — docs/release-plan.md §5):
 * PostgREST behaviour, true concurrency (single connection), supabase_admin
 * defaults, platform event-trigger rules.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PGlite, type PGliteInterface } from "@electric-sql/pglite";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "database", "migrations");

export const LIVE_SCHEMA_FILE = join(ROOT, "database", "audit", "live_public_schema.sql");

export const M = {
  hardening: join(MIGRATIONS_DIR, "20261010_01_security_hardening.sql"),
  purchases: join(MIGRATIONS_DIR, "20261010_02_atomic_purchases_and_idempotency.sql"),
  purchasesRollback: join(MIGRATIONS_DIR, "20261010_02_atomic_purchases_and_idempotency.rollback.sql"),
  ledger: join(MIGRATIONS_DIR, "20261010_03_ledger_period_totals.sql"),
  legacyCleanup: join(MIGRATIONS_DIR, "20261010_04_legacy_function_cleanup.sql"),
  legacyRollback: join(MIGRATIONS_DIR, "20261010_04_legacy_function_cleanup.rollback.sql"),
  openingBalances: join(MIGRATIONS_DIR, "20261010_05_opening_balances.sql"),
  openingBalancesRollback: join(MIGRATIONS_DIR, "20261010_05_opening_balances.rollback.sql"),
  reassert: join(MIGRATIONS_DIR, "20261010_06_reassert_api_acl.sql"),
  guard: join(MIGRATIONS_DIR, "20261010_07_acl_guard_event_trigger.sql"),
  dupTrigger: join(MIGRATIONS_DIR, "20261010_08_drop_duplicate_users_trigger.sql"),
  verify: join(MIGRATIONS_DIR, "20261010_verify.sql"),
} as const;

/** The mandatory release sequence, in filename order (07/08 are optional). */
export const RELEASE_SEQUENCE = [M.hardening, M.purchases, M.ledger, M.legacyCleanup, M.openingBalances, M.reassert];

const ROLES_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;`;

export function sql(file: string) {
  return readFileSync(file, "utf8");
}

let template: Promise<PGlite> | null = null;

async function loadTemplate() {
  const db = new PGlite();
  await db.exec(ROLES_SQL);
  await db.exec(sql(LIVE_SCHEMA_FILE));
  // the dump sets search_path='' / row_security=off / check_function_bodies=off for the session
  await db.exec("RESET ALL;");
  return db;
}

/**
 * A fresh database with the live schema; `migrations` are applied in order
 * (default: none → the schema exactly as exported from production).
 */
export async function createLiveDb({ migrations = [] as string[] } = {}): Promise<PGliteInterface> {
  template ??= loadTemplate();
  const db = await (await template).clone();
  for (const file of migrations) await db.exec(sql(file));
  return db;
}

/** Close the cached template (call from a top-level `after`, or the test process never exits). */
export async function releaseTemplate() {
  if (!template) return;
  const db = await template;
  template = null;
  await db.close();
}

/** Run `fn` as an API role, always switching back. */
export async function asRole<T>(db: PGliteInterface, role: "anon" | "authenticated" | "service_role", fn: () => Promise<T>) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

export type VerifyRow = { check_name: string; status: "PASS" | "FAIL" | "INFO"; detail: string };

/** Runs 20261010_verify.sql; returns the rows and whether its final assertion raised. */
export async function runVerify(db: PGliteInterface) {
  // PGlite runs a multi-statement string as ONE implicit transaction, so the
  // checks and the final RAISE are executed separately (psql runs them one by one).
  const [checks, assertion] = sql(M.verify).split(/^-- @final-assertion.*$/m);
  await db.exec(checks);
  let raised: string | null = null;
  try {
    await db.exec(assertion);
  } catch (error) {
    raised = error instanceof Error ? error.message : String(error);
  }
  const { rows } = await db.query<VerifyRow>(`SELECT check_name, status, detail FROM _verify ORDER BY seq`);
  return { rows, raised, failed: rows.filter((row) => row.status === "FAIL") };
}

export const BRANCH_ID = "dcc40a00-1275-463f-9cd8-caf5487100b0";
export const OTHER_BRANCH_ID = "0b7e2f55-5f3a-4c4e-9d55-0f0e1a2b3c4d";
export const RATE = 2500;

/** Branches, one user per role, and an SDG/USD rate effective since 2020. */
export async function seedBase(db: PGliteInterface) {
  await db.query(
    `INSERT INTO public.branches (id, name, "updatedAt") VALUES ($1, 'Main', now()), ($2, 'Other', now())
     ON CONFLICT (id) DO NOTHING`,
    [BRANCH_ID, OTHER_BRANCH_ID],
  );
  await db.query(
    `INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $3, '2020-01-01'), ($2, $3, '2020-01-01')`,
    [BRANCH_ID, OTHER_BRANCH_ID, RATE],
  );

  const user = async (role: string, opts: { branchId?: string | null; isActive?: boolean } = {}) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO public.users (id, name, email, password, role, "isActive", "branchId")
       VALUES ($1, $2, $3, 'test-hash-not-a-password', $4::public."Role", $5, $6)`,
      [id, `${role} user`, `${role}-${id.slice(0, 8)}@example.test`, role, opts.isActive ?? true,
       opts.branchId === undefined ? BRANCH_ID : opts.branchId],
    );
    return id;
  };

  return {
    owner: await user("owner"),
    admin: await user("admin"),
    cashier: await user("cashier"),
    tailor: await user("tailor"),
    inactiveAdmin: await user("admin", { isActive: false }),
    otherBranchAdmin: await user("admin", { branchId: OTHER_BRANCH_ID }),
    legacyUpperAdmin: await user("ADMIN"),
  };
}

export type Users = Awaited<ReturnType<typeof seedBase>>;

export async function createProduct(
  db: PGliteInterface,
  opts: { conversionFactor?: number | null; stock?: number; averageCost?: number; purchasePrice?: number; sellingPrice?: number } = {},
) {
  const templateId = randomUUID();
  const variantId = randomUUID();
  await db.query(
    `INSERT INTO public.product_templates (id, name, "conversionFactor") VALUES ($1, $2, $3)`,
    [templateId, `Product ${templateId.slice(0, 4)}`, opts.conversionFactor === undefined ? 1 : opts.conversionFactor],
  );
  await db.query(
    `INSERT INTO public.product_variants (id, "templateId", "stockQuantity", "averageCost", "purchasePrice", "sellingPrice", "minStockLevel")
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [variantId, templateId, opts.stock ?? 0, opts.averageCost ?? 0, opts.purchasePrice ?? 0, opts.sellingPrice ?? 0],
  );
  return { templateId, variantId };
}

export async function createPurchaseOrder(
  db: PGliteInterface,
  opts: {
    status?: string;
    deliveryCost?: number;
    discountAmount?: number;
    items: { templateId: string; variantId: string; quantity: number; unitCost: number }[];
  },
) {
  const subtotal = opts.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const total = Math.max(0, subtotal + (opts.deliveryCost ?? 0) - (opts.discountAmount ?? 0));
  const orderNumber = `PO-${randomUUID().slice(0, 8)}`;

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.purchase_orders (order_number, status, subtotal, delivery_cost, discount_amount, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [orderNumber, opts.status ?? "APPROVED", subtotal.toFixed(2), opts.deliveryCost ?? 0, opts.discountAmount ?? 0, total.toFixed(2)],
  );
  const orderId = rows[0].id;

  for (const item of opts.items) {
    await db.query(
      `INSERT INTO public.purchase_order_items (purchase_order_id, template_id, variant_id, quantity, unit_cost, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, item.templateId, item.variantId, item.quantity, item.unitCost, (item.quantity * item.unitCost).toFixed(2)],
    );
  }

  return { orderId, orderNumber, total: Number(total.toFixed(2)) };
}

/** Test funding of CASH/BANK through an ordinary CAPITAL entry (the live trigger sets amount_usd). */
export async function fundAccount(db: PGliteInterface, account: "CASH" | "BANK", amount: number, currency: "USD" | "SDG" = "USD") {
  await db.query(
    `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
     VALUES ($1, $2, 'CAPITAL', $3, $4, 'CAPITAL', $5)`,
    [`JE-T-${randomUUID().slice(0, 8)}`, BRANCH_ID, amount, account, currency],
  );
}

export async function rpcError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the database call to fail, but it succeeded");
}

export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  throw new Error("expected the database call to fail, but it succeeded");
}

export function num(value: unknown) {
  return Number(value);
}

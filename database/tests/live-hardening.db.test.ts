/**
 * Security hardening sequence (20261010_01..08 + verify) against the REAL live
 * schema export. Run: npm run test:db
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  M,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  releaseTemplate,
  runVerify,
  seedBase,
  sql,
  sqlState,
  BRANCH_ID,
} from "./db-harness";

const LEGACY = [
  "public.process_purchase_order_receipt(uuid)",
  "public.journal_entries_apply_currency()",
  "public.sales_orders_apply_exchange_rate()",
  "public.update_tailoring_order_status(uuid, uuid, uuid, text)",
];

async function regproc(db: PGliteInterface, signature: string) {
  const { rows } = await db.query<{ f: string | null }>(`SELECT to_regprocedure($1)::text AS f`, [signature]);
  return rows[0].f;
}

async function publicFunctions(db: PGliteInterface) {
  const { rows } = await db.query<{ oid: number; sig: string }>(
    `SELECT p.oid, p.oid::regprocedure::text AS sig FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  );
  return rows;
}

after(releaseTemplate);

describe("live schema as exported (before any migration)", () => {
  let db: PGliteInterface;
  before(async () => {
    db = await createLiveDb();
    await seedBase(db);
  });
  after(() => db.close());

  it("reproduces the exposure: anon reads users (incl. password hashes) and may execute every function", async () => {
    const rows = await asRole(db, "anon", () =>
      db.query<{ password: string }>(`SELECT email, password FROM public.users`),
    );
    assert.ok(rows.rows.length > 0, "anon can read public.users through the USING (true) policy");

    const fns = await publicFunctions(db);
    assert.equal(fns.length, 53);
    for (const role of ["anon", "authenticated"]) {
      const { rows: denied } = await db.query(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND NOT has_function_privilege($1, p.oid, 'EXECUTE')`,
        [role],
      );
      assert.equal(denied.length, 0, `${role} can execute all 53 functions in the live schema`);
    }
  });

  it("verify.sql fails on the live export (it detects the findings)", async () => {
    const { failed, raised } = await runVerify(db);
    assert.ok(raised, "final assertion raises");
    const names = failed.map((row) => row.check_name);
    for (const expected of [
      "users has no policy for PUBLIC/anon/authenticated",
      "anon/authenticated have no table/view privilege in public",
      "anon/authenticated cannot EXECUTE any public function",
      "no public function is executable by PUBLIC",
      "every SECURITY DEFINER function pins search_path",
      "postgres default privileges grant nothing to anon/authenticated/PUBLIC",
      "postgres global function default removes PUBLIC EXECUTE",
    ]) {
      assert.ok(names.includes(expected), `expected FAIL: ${expected}`);
    }
  });
});

describe("release sequence 01..06", () => {
  let db: PGliteInterface;
  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    await seedBase(db);
  });
  after(() => db.close());

  it("verify.sql passes", async () => {
    const { failed, raised } = await runVerify(db);
    assert.deepEqual(failed, []);
    assert.equal(raised, null);
  });

  it("is idempotent: applying the whole sequence again changes nothing and still verifies", async () => {
    for (const file of RELEASE_SEQUENCE) await db.exec(sql(file));
    const { failed } = await runVerify(db);
    assert.deepEqual(failed, []);
  });

  for (const role of ["anon", "authenticated"] as const) {
    it(`${role}: cannot read or change users, and cannot execute any public function`, async () => {
      assert.equal(await sqlState(asRole(db, role, () => db.query(`SELECT id FROM public.users`))), "42501");
      assert.equal(
        await sqlState(asRole(db, role, () => db.query(`UPDATE public.users SET name = name`))),
        "42501",
      );
      assert.equal(
        await sqlState(asRole(db, role, () => db.query(`SELECT * FROM public.journal_entries`))),
        "42501",
      );
      // real call of a SECURITY DEFINER RPC that the live schema exposed
      assert.equal(
        await sqlState(
          asRole(db, role, () =>
            db.query(`SELECT public.process_inventory_adjustment(NULL, NULL, 'IN', 1, NULL, NULL, 0, NULL, $1)`, [BRANCH_ID]),
          ),
        ),
        "42501",
      );
      for (const fn of await publicFunctions(db)) {
        const { rows } = await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege($1, $2::oid, 'EXECUTE') AS ok`,
          [role, fn.oid],
        );
        assert.equal(rows[0].ok, false, `${role} must not execute ${fn.sig}`);
      }
    });
  }

  it("service_role keeps working: reads users and executes RPCs", async () => {
    const users = await asRole(db, "service_role", () => db.query(`SELECT id, password FROM public.users`));
    assert.ok(users.rows.length > 0);
    const rate = await asRole(db, "service_role", () =>
      db.query<{ r: string }>(`SELECT public.get_current_exchange_rate($1) AS r`, [BRANCH_ID]),
    );
    assert.equal(Number(rate.rows[0].r), 2500);
  });

  it("the public read policy on users is gone; the service_role policy stays", async () => {
    const { rows } = await db.query<{ policyname: string; roles: string[] }>(
      `SELECT policyname, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'`,
    );
    assert.deepEqual(rows.map((row) => row.policyname), ["Allow server-side bypass"]);
    assert.deepEqual(rows[0].roles, ["service_role"]);
  });

  it("legacy functions removed (no trigger, dependency or reference); business triggers intact", async () => {
    for (const signature of LEGACY) assert.equal(await regproc(db, signature), null, signature);
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND NOT t.tgisinternal`,
    );
    assert.equal(Number(rows[0].n), 15, "all 15 live triggers kept (08 is optional and not applied here)");
  });

  it("objects created later by postgres are NOT exposed (default privileges + global PUBLIC EXECUTE)", async () => {
    await db.exec(`
      CREATE TABLE public.zz_later_table (id int PRIMARY KEY);
      CREATE FUNCTION public.zz_later_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
      CREATE OR REPLACE FUNCTION public.ledger_period_totals(p_branch_id uuid, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
        RETURNS TABLE (debit_account text, credit_account text, currency text, entry_type text, month_key text, amount numeric, amount_usd numeric, entries bigint)
        LANGUAGE sql STABLE SET search_path = public, pg_temp
        AS $$ SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 0::numeric, 0::numeric, 0::bigint WHERE false $$;
    `);
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT has_table_privilege('anon', 'public.zz_later_table', 'SELECT') AS anon_table,
             has_table_privilege('authenticated', 'public.zz_later_table', 'INSERT') AS auth_table,
             has_table_privilege('service_role', 'public.zz_later_table', 'SELECT') AS svc_table,
             has_function_privilege('anon', 'public.zz_later_fn()', 'EXECUTE') AS anon_fn,
             has_function_privilege('service_role', 'public.zz_later_fn()', 'EXECUTE') AS svc_fn,
             (SELECT proacl::text FROM pg_proc WHERE oid = 'public.zz_later_fn()'::regprocedure) AS acl,
             has_function_privilege('anon', 'public.ledger_period_totals(uuid, timestamptz, timestamptz)', 'EXECUTE') AS anon_replaced
    `);
    assert.equal(rows[0].anon_table, false);
    assert.equal(rows[0].auth_table, false);
    assert.equal(rows[0].svc_table, true);
    assert.equal(rows[0].anon_fn, false);
    assert.equal(rows[0].svc_fn, true);
    assert.doesNotMatch(String(rows[0].acl), /(^|[{,])=X/, "no PUBLIC entry in the new function's ACL");
    assert.equal(rows[0].anon_replaced, false, "CREATE OR REPLACE keeps the hardened ACL");

    // only RLS is missing (the platform's rls_auto_enable trigger is not part of the dump); 06 fixes it
    const first = await runVerify(db);
    assert.deepEqual(first.failed.map((row) => row.check_name), ["RLS enabled on every public table"]);
    await db.exec(sql(M.reassert));
    assert.deepEqual((await runVerify(db)).failed, []);
    await db.exec(`DROP TABLE public.zz_later_table; DROP FUNCTION public.zz_later_fn();`);
  });

  it("an explicit re-grant (table, column, function, default privilege) is detected by verify and closed by 06", async () => {
    await db.exec(`
      GRANT SELECT ON public.users TO anon;
      GRANT SELECT (name) ON public.customers TO authenticated;
      GRANT EXECUTE ON FUNCTION public.get_current_exchange_rate(uuid, timestamptz) TO anon;
      GRANT EXECUTE ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric) TO PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
      CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true);
    `);

    const reopened = await runVerify(db);
    const names = reopened.failed.map((row) => row.check_name);
    for (const expected of [
      "users has no policy for PUBLIC/anon/authenticated",
      "anon/authenticated have no table/view privilege in public",
      "anon/authenticated have no column privilege in public",
      "anon/authenticated cannot EXECUTE any public function",
      "no public function is executable by PUBLIC",
      "postgres default privileges grant nothing to anon/authenticated/PUBLIC",
    ]) {
      assert.ok(names.includes(expected), `verify must flag: ${expected}`);
    }

    await db.exec(sql(M.reassert));
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

describe("20261010_04 legacy cleanup guards and rollback", () => {
  it("keeps a legacy function that something references, drops the rest", async () => {
    const db = await createLiveDb({ migrations: [M.hardening] });
    await db.exec(`
      CREATE FUNCTION public.zz_uses_legacy() RETURNS void LANGUAGE plpgsql
      SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.process_purchase_order_receipt(NULL); END $$;
    `);
    await db.exec(sql(M.legacyCleanup));
    assert.ok(await regproc(db, LEGACY[0]), "referenced function is kept");
    for (const signature of LEGACY.slice(1)) assert.equal(await regproc(db, signature), null, signature);
    await db.close();
  });

  it("keeps a trigger function that is attached to a trigger", async () => {
    const db = await createLiveDb({ migrations: [M.hardening] });
    await db.exec(`CREATE TABLE public.zz_t (id int); CREATE TRIGGER zz BEFORE INSERT ON public.zz_t
                   FOR EACH ROW EXECUTE FUNCTION public.journal_entries_apply_currency();`);
    await db.exec(sql(M.legacyCleanup));
    assert.ok(await regproc(db, LEGACY[1]));
    await db.close();
  });

  it("rollback re-creates the four functions — pinned search_path, service_role only, not attached", async () => {
    const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    await db.exec(sql(M.legacyRollback));
    await db.exec(sql(M.legacyRollback)); // idempotent
    for (const signature of LEGACY) {
      const { rows } = await db.query<Record<string, boolean>>(
        `SELECT has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS auth,
                has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') AS svc,
                EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid = $1::regprocedure) AS attached`,
        [signature],
      );
      assert.deepEqual(rows[0], { anon: false, auth: false, svc: true, attached: false }, signature);
    }
    assert.deepEqual((await runVerify(db)).failed, [], "rollback does not reopen anything");
    await db.close();
  });
});

describe("20261010_02 rollback", () => {
  it("drops the new functions/table, keeps financial rows, grants nothing", async () => {
    const db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    await seedBase(db);
    await db.query(
      `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, debit_account, credit_account, currency)
       VALUES ('JE-RB-1', $1, 'CAPITAL', 10, 'CASH', 'CAPITAL', 'USD')`,
      [BRANCH_ID],
    );
    await db.exec(sql(M.purchasesRollback));
    await db.exec(sql(M.purchasesRollback)); // idempotent
    assert.equal(await regproc(db, "public.receive_purchase_order(uuid, uuid, uuid)"), null);
    assert.equal(
      await regproc(db, "public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text)"),
      null,
    );
    const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries`);
    assert.equal(Number(rows[0].n), 1);
    const failed = (await runVerify(db)).failed.map((row) => row.check_name);
    assert.deepEqual(failed.sort(), [
      "api_idempotency_keys exists with RLS",
      "every RPC the app calls exists and service_role can EXECUTE it",
    ]);
    await db.close();
  });
});

describe("optional 07: event-trigger guard", () => {
  it("re-revokes immediately after a GRANT or CREATE in public, and cannot recurse", async () => {
    const db = await createLiveDb({ migrations: [...RELEASE_SEQUENCE, M.guard] });
    await db.exec(sql(M.guard)); // idempotent
    await db.exec(`GRANT SELECT ON public.users TO anon`);
    await db.exec(`GRANT EXECUTE ON FUNCTION public.get_current_exchange_rate(uuid, timestamptz) TO authenticated`);
    await db.exec(`CREATE TABLE public.zz_guarded (id int); GRANT ALL ON public.zz_guarded TO anon;`);
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT has_table_privilege('anon', 'public.users', 'SELECT') AS users,
             has_function_privilege('authenticated', 'public.get_current_exchange_rate(uuid, timestamptz)', 'EXECUTE') AS fn,
             has_table_privilege('anon', 'public.zz_guarded', 'SELECT') AS new_table,
             has_table_privilege('service_role', 'public.zz_guarded', 'SELECT') AS svc
    `);
    assert.deepEqual(rows[0], { users: false, fn: false, new_table: false, svc: true });
    await db.close();
  });
});

describe("optional 08: duplicate users trigger", () => {
  it("drops update_user_updated_at only, keeps updatedAt maintenance, idempotent", async () => {
    const db = await createLiveDb({ migrations: [...RELEASE_SEQUENCE, M.dupTrigger, M.dupTrigger] });
    const users = await seedBase(db);
    const { rows } = await db.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal ORDER BY 1`,
    );
    assert.deepEqual(rows.map((row) => row.tgname), ["update_users_updated_at"]);
    await db.query(`UPDATE public.users SET "updatedAt" = '2000-01-01' WHERE id = $1`, [users.owner]);
    const after = await db.query<{ y: number }>(
      `SELECT extract(year FROM "updatedAt")::int AS y FROM public.users WHERE id = $1`,
      [users.owner],
    );
    assert.ok(after.rows[0].y > 2000, "the remaining trigger still sets updatedAt");
    await db.close();
  });
});

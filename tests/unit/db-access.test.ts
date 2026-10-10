/**
 * Static guarantees that the database hardening (database/migrations/20261010_*)
 * relies on. If one of these fails, re-read docs/live-database-audit.md §3.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, filter: RegExp, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter.test(name)) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(ROOT, file).split(/[\\/]/).join("/");
const SOURCE_FILES = ["app", "lib", "components", "store", "hooks"]
  .map((dir) => join(ROOT, dir))
  .filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap((dir) => walk(dir, /\.(ts|tsx|js|jsx|mjs)$/))
  .concat(walk(ROOT, /^proxy\.ts$/).filter((file) => rel(file) === "proxy.ts"));

describe("database access is server-only and service_role-only", () => {
  it("only lib/supabase.ts creates a Supabase client, and it is server-only", () => {
    const creators = SOURCE_FILES.filter((file) => /@supabase\/(supabase-js|ssr)/.test(readFileSync(file, "utf8")));
    assert.deepEqual(creators.map(rel), ["lib/supabase.ts"]);
    const client = readFileSync(join(ROOT, "lib", "supabase.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.match(client, /^import "server-only";/m);
    assert.match(client, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(client, /PUBLISHABLE|ANON_KEY/i, "no anon/publishable-key client");
    assert.doesNotMatch(client, /export const supabase\b/, "no anon client export");
  });

  it("nothing imports a non-admin client or reads a public Supabase key", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, "utf8");
      if (/import\s*\{[^}]*\bsupabase\b(?!Admin)[^}]*\}\s*from\s*["']@\/lib\/supabase["']/.test(text)) offenders.push(`${rel(file)}: imports supabase`);
      if (/NEXT_PUBLIC_SUPABASE|SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY/.test(text)) offenders.push(`${rel(file)}: public Supabase key`);
    }
    assert.deepEqual(offenders, []);
  });

  it("no client component imports the database client", () => {
    const offenders = SOURCE_FILES.filter((file) => {
      const text = readFileSync(file, "utf8");
      return /^\s*["']use client["']/.test(text) && /@\/lib\/supabase["']/.test(text);
    });
    assert.deepEqual(offenders.map(rel), []);
  });
});

describe("every API route authenticates before touching the database", () => {
  const PUBLIC_ROUTES = new Set(["app/api/auth/login/route.ts", "app/api/auth/logout/route.ts", "app/api/auth/request-reset/route.ts"]);
  const GUARD = /await\s+require(Login|Permission|AnyPermission)\s*\(/;
  const routes = walk(join(ROOT, "app", "api"), /^route\.(ts|tsx)$/);

  it("found the API routes", () => {
    assert.ok(routes.length > 40);
  });

  for (const file of routes) {
    const name = rel(file);
    if (PUBLIC_ROUTES.has(name)) continue;
    it(`${name}: each handler calls a guard first`, () => {
      const text = readFileSync(file, "utf8");

      // `export { POST } from "./checkout/route"` — the target route is checked on its own
      const reexport = text.match(/export\s*\{[^}]*\}\s*from\s*["'](\.\/[^"']+)["']/);
      if (reexport && !/export\s+(?:async\s+)?function/.test(text)) {
        assert.ok(routes.some((route) => rel(route).startsWith(`${name.replace(/route\.tsx?$/, "")}${reexport[1].slice(2)}`)));
        return;
      }

      // local helpers (requireAdmin, requireViewer…) that call a guard count as guards
      const helpers = [...text.matchAll(/(?:^|\n)\s*async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
        .filter((match) => GUARD.test(match[2]))
        .map((match) => match[1]);
      const guardRe = new RegExp(`await\\s+(require(?:Login|Permission|AnyPermission)${helpers.map((h) => `|${h}`).join("")})\\s*\\(`);

      const handlers = [...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
      assert.ok(handlers.length > 0, "exports at least one handler");
      assert.doesNotMatch(text, /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/, "handlers must be functions (checked here)");
      handlers.forEach((match, index) => {
        const end = index + 1 < handlers.length ? handlers[index + 1].index : text.length;
        const body = text.slice(match.index, end);
        const guard = body.search(guardRe);
        assert.ok(guard >= 0, `${match[1]} has no guard call`);
        const db = body.search(/supabaseAdmin\s*[.\n]/);
        assert.ok(db < 0 || guard < db, `${match[1]} touches supabaseAdmin before the guard`);
        assert.match(body.slice(guard, guard + 300), /\breturn\b/, `${match[1]} returns when the guard fails`);
      });
    });
  }

  it("the three public auth routes are the only unguarded ones and are rate-limited or harmless", () => {
    for (const name of PUBLIC_ROUTES) {
      const text = readFileSync(join(ROOT, name), "utf8");
      if (name.endsWith("logout/route.ts")) continue;
      assert.match(text, /checkRateLimit|rateLimit/i, `${name} must be rate-limited`);
    }
  });
});

describe("migrations never re-open the API", () => {
  const MIGRATIONS = join(ROOT, "database", "migrations");
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

  it("found the 20261010 sequence", () => {
    for (const expected of [
      "20261010_01_security_hardening.sql",
      "20261010_02_atomic_purchases_and_idempotency.sql",
      "20261010_03_ledger_period_totals.sql",
      "20261010_04_legacy_function_cleanup.sql",
      "20261010_06_reassert_api_acl.sql",
      "20261010_verify.sql",
    ]) {
      assert.ok(files.includes(expected), expected);
    }
  });

  for (const name of files) {
    it(`${name}: no GRANT to anon / authenticated / PUBLIC`, () => {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--[^\n]*/g, "");
      const statements = sql.split(";").map((statement) => statement.replace(/\s+/g, " ").trim());
      const offenders = statements.filter((statement) => {
        const grant = statement.replace(/^ALTER DEFAULT PRIVILEGES( FOR ROLE \w+)?( IN SCHEMA \w+)? /i, "");
        return /^GRANT\b/i.test(grant) && /\bTO\b.*\b(anon|authenticated|PUBLIC)\b/i.test(grant);
      });
      assert.deepEqual(offenders, []);
      assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i);
      assert.doesNotMatch(sql, /CREATE POLICY[^;]*USING\s*\(\s*true\s*\)/i, "no USING (true) policy");
    });
  }

  it("verify.sql's list of app RPCs equals the RPCs the app calls", () => {
    const called = new Set<string>();
    for (const file of SOURCE_FILES) {
      for (const match of readFileSync(file, "utf8").matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)) called.add(match[1]);
    }
    const verify = readFileSync(join(MIGRATIONS, "20261010_verify.sql"), "utf8");
    const block = verify.slice(verify.indexOf("v_app_rpcs text[] := ARRAY["), verify.indexOf("];", verify.indexOf("v_app_rpcs")));
    const listed = new Set([...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]));
    assert.deepEqual([...called].sort(), [...listed].sort());
  });

  it("the app never calls a legacy function removed by 20261010_04", () => {
    for (const file of SOURCE_FILES) {
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /process_purchase_order_receipt|journal_entries_apply_currency|sales_orders_apply_exchange_rate|update_tailoring_order_status/,
        rel(file),
      );
    }
  });
});

# Release plan — database hardening + app release

_Single reviewed plan. Evidence: [live-database-audit.md](live-database-audit.md). Nothing in this plan has been applied to staging or production by the assistant._

## 1. What is released

| # | File | Mandatory | Touches rows | Purpose |
|---|---|---|---|---|
| 01 | `database/migrations/20261010_01_security_hardening.sql` | **yes** | no | Drop the public users policy; RLS on every table; revoke everything from anon/authenticated/PUBLIC; keep service_role; close default privileges (including the global PUBLIC EXECUTE); pin search_path on the 2 legacy DEFINER functions |
| 02 | `…_02_atomic_purchases_and_idempotency.sql` | **yes** (new app needs it) | no | `api_idempotency_keys`, `receive_purchase_order`, `record_purchase_payment` (INVOKER, service_role only) |
| 03 | `…_03_ledger_period_totals.sql` | recommended | no | Grouped ledger totals (read-only) for the accounting pages |
| 04 | `…_04_legacy_function_cleanup.sql` | yes | no | Guarded drop of the 4 unused legacy functions (kept automatically if anything references them) |
| 05 | `…_05_opening_balances.sql` (+ `.rollback.sql`) | **yes** (new app's opening-balances page needs it) | no (adds 2 functions, widens 2 CHECKs) | Opening balances: cash/bank, existing assets, supplier debts → CAPITAL. Never INVENTORY (that stays in `record_opening_stock`). See [opening-balances-design.md](opening-balances-design.md) |
| 06 | `…_06_reassert_api_acl.sql` | **yes, always last** | no | Re-asserts the ACL and defaults; closes anything re-granted in between |
| 07 | `…_07_acl_guard_event_trigger.sql` | optional | no | DDL-time re-revoke guard (validate on staging first) |
| 08 | `…_08_drop_duplicate_users_trigger.sql` | optional | no | Drop the redundant `update_user_updated_at` trigger |
| V | `…_verify.sql` | **yes** | no | PASS/FAIL assertions; raises at the end if anything fails |

All files are idempotent (tested: the whole sequence applied twice still verifies). None inserts, updates or deletes business rows (05 only creates functions; rows are written later, when the owner uses the opening-balances page). None changes the body of an existing business function, attaches a trigger, or touches `snapshot_journal_currency`, `record_opening_stock` or `process_inventory_adjustment`.

**Do not apply** anything in `database/migrations/superseded/`, and never a `*.rollback.sql` unless rolling back.

The application changes are on branch `production-hardening`: atomic purchases, idempotency, sessions, authorization, the removed anon client, and `users/[id]` authorizing before the target lookup. See [production-fixes.md](production-fixes.md).

## 2. How to run a file

Use a connection string held in an environment variable. Never paste it into a shared terminal or chat.

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261010_01_security_hardening.sql
```

- Each migration has its own `BEGIN … COMMIT`, so a failure leaves nothing half-applied.
- `verify.sql` prints a table of checks and then **raises** if any check is FAIL, so `psql` exits non-zero.
- In the Supabase SQL Editor, run the whole file. If it fails, the error lists the failed checks. To see every row, run the file without its last `DO` block (marked `-- @final-assertion`).

## 3. Phases

### Phase 0 — preparation

1. Confirm a restorable backup / PITR point of production (Supabase dashboard → Database → Backups). Record its time.
2. Create or refresh **staging** from the production schema. Data can be synthetic; do not copy real customer data unless policy allows it.
3. Point a staging deployment of the app at staging (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`). `SUPABASE_PUBLISHABLE_KEY` is **no longer needed**.

### Phase S — staging, full rehearsal

1. Apply in filename order: `01 → 02 → 03 → 04 → 05 → 06`, then (optional) `07`, `08`.
2. Run `verify.sql`. **All rows must be PASS.** Note the INFO rows (other roles' default privileges, legacy functions still present, event triggers).
3. Run the whole sequence again, then `verify.sql` again (idempotency on the real platform).
4. Deploy the `production-hardening` app to staging and run every check in §5.
5. Rehearse the rollbacks in §6 (02 and 04) on staging, then re-apply.

**Gate:** every §5 item passes, or has a written decision, before going to production.

### Phase 1 — database, production, BEFORE the app deploy

The currently deployed app (`master`) uses only the service_role client and calls none of the functions dropped by 04. I checked this with `git grep` on `master`. So the full sequence is backward-compatible and should go out **as soon as staging passes**, because F1 and F3 are exploitable now.

1. Quiet period (no cashier activity), backup point recorded.
2. Apply `01 → 02 → 03 → 04 → 05 → 06` (optional 07/08 only if they passed on staging).
3. Run `verify.sql` → all PASS. Then a manual check with the **anon key** (it must fail):

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/rest/v1/users?select=id" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
   ```

   Expect 401 or 403 (permission denied), **not 200**. The same applies to `POST /rest/v1/rpc/get_current_exchange_rate`.
4. Smoke test the **old** app: login, one POS sale, the accounting page opens. Any `42501` in the logs means the server is not using the service_role key; see §6.4.
5. **Credentials (C1, recommended):** because password hashes were publicly readable, ask every user to change their password (or reset them), and rotate the anon/publishable key in Supabase if available. The app does not use it.

If Phase 1 has to happen before staging is ready (emergency): apply **01 and 06 only**, then run verify. Expect exactly two FAIL rows, "every RPC the app calls exists …" (the new RPCs from 02, 03 and 05 are not created yet) and "api_idempotency_keys exists with RLS". Everything security-related must be PASS. Finish 02–06 after staging.

### Phase 2 — application deploy

1. Deploy `production-hardening`. Users must sign in again once, because the session format changed.
2. Smoke test (§5 items marked ★).
3. Watch logs for the first day: `[idempotency]`, `DB_MIGRATION_REQUIRED`, `permission denied (42501)`.

### Phase 3 — after go-live

- Re-run `database/audit/03_data_integrity_checks.sql` after day 1 and week 1.
- **Every future migration:** end the release with `06`, then `verify.sql`. CI (`npm run test:unit`) rejects any migration that grants to anon, authenticated or PUBLIC.
- After any schema change made in the Supabase dashboard: run `06` + `verify.sql` (the dashboard may run as `supabase_admin`, whose defaults postgres cannot change).
- Open decisions: D13, D5-follow-up, C2, C3 (D6 opening balances: built as 05) in [live-database-audit.md §6](live-database-audit.md#6-open-confirmations-and-decisions-owner--accountant-not-invented-here).

## 4. What was verified locally (no real Supabase)

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors (11 warnings, all present before this work) |
| `npm run test:unit` | ✅ 115/115. Includes `db-access.test.ts`: service_role-only client, a guard on every route, migration grant lint, verify RPC list = app RPCs |
| `npm run test:db` | ✅ 49/49 on the **unmodified live schema export** in PGlite (PG 18): exposure reproduced; 01–06 make verify pass; idempotent; anon/authenticated denied (42501) on users, journal and every function; service_role works; new objects stay closed; explicit re-grants caught by verify and closed by 06; 04 guards and rollback; 02 rollback; 07 guard; 08; purchases, ledger, checkout, returns, opening stock and opening balances (05: validation, preview writes nothing, posting, paying an opening supplier debt through the normal payment flow, second batch rules, past date, rollback) as service_role |
| `npm run build` | ✅ |
| `npm run test:e2e` | ✅ 24/24 against the production build with a mock PostgREST and **no anon key**. Includes the role × mutation matrix: no session → 401; cashier → 403 on 30 manager-only mutations; tailor → 403 on those plus 4 sales/tailoring-operate mutations; owner passes the authorization layer on all of them; opening balances are owner-only (admin, cashier and tailor get 403), validated (422), previewed and posted idempotently |

## 5. Staging-only validations

These cannot be proven locally. ★ = also run in production right after Phase 2.

| # | Check | Expected |
|---|---|---|
| S1 ★ | `curl` with the anon key: `GET /rest/v1/users`, `GET /rest/v1/journal_entries`, `POST /rest/v1/rpc/complete_sales_checkout` | permission denied (401/403), never data |
| S2 | Same requests with a signed-in `authenticated` JWT, if Supabase Auth is enabled on the project | denied |
| S3 ★ | App login, POS sale with gift and mixed payment, receipt printed | succeeds; stock and journal as before |
| S4 | Tailoring end to end: create (advance) → UNDER_TAILORING (fabric deducted **once**) → production receive → pickup (balance) → tailor payment | succeeds; compare movements and journal with the same flow before migration |
| S5 | Customer return through the inventory adjustment page (IN + negative amount, CASH and BANK) and supplier return (OUT + positive) | same entries as `workflows.db.test.ts` |
| S6 | Opening stock for a new item; attempt a second opening | first succeeds with one JE-OPEN; second refused |
| S7 ★ | Purchase: create → approve → receive → pay (partial, then remainder) | atomic; no duplicate receipt on double click |
| S8 | **Concurrency:** two browser tabs press "receive" on the same PO at once; two payments that together exceed the cash balance | one receipt; at most one payment succeeds |
| S9 | Accounting overview and summary: numbers identical to before 03 | equal |
| S10 | Currency exchange, asset purchase, manual expense with insufficient balance | as before (the expense is refused) |
| S11 | `verify.sql` INFO row "default privileges of other roles" | note the result (C3) |
| S12 | Optional 07: create the event trigger as `postgres`; then `GRANT SELECT ON public.users TO anon;` | immediately revoked; if creating the trigger is refused, skip 07 (C2) |
| S13 | Supabase Studio table editor and SQL editor still work for the project owner | they use privileged roles, so they are unaffected |
| S14 | Notifications: overdue tailoring job (`generate_overdue_tailoring_notifications`) runs | succeeds |

## 6. Rollback guidance

**Rule: no rollback step ever restores privileges for `anon`, `authenticated` or `PUBLIC`, or re-creates the `USING (true)` policy on `users`.** Re-opening them re-exposes every password hash and every money-moving function to anyone holding the public key. That is never a safe production state, even temporarily.

### 6.1 Order

App first, database second: deploy the previous app version **before** rolling back 02 (the new app requires the 02 functions and fails closed without them).

### 6.2 Per file

| File | Rollback | Effect on data |
|---|---|---|
| 01, 06 | **None that re-opens access.** If something breaks, see 6.4. | — |
| 02 | Previous app first, then `20261010_02_…rollback.sql` | Drops the two functions and the idempotency table. Movements, journal entries and payments created through them stay. Grants nothing. |
| 03 | `DROP FUNCTION IF EXISTS public.ledger_period_totals(uuid, timestamptz, timestamptz);` | The app falls back to the old full scan automatically |
| 04 | `20261010_04_…rollback.sql` | Re-creates the 4 functions verbatim from the live dump, with a **pinned search_path** and **service_role-only** EXECUTE, attached to no trigger (tested) |
| 07 | `DROP EVENT TRIGGER IF EXISTS app_acl_guard; DROP FUNCTION IF EXISTS app_private.reassert_public_acl(); DROP SCHEMA IF EXISTS app_private;` | none |
| 08 | `CREATE OR REPLACE TRIGGER "update_user_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();` | none (cosmetic) |

### 6.3 Restore from backup

Use a restore only for data corruption, which none of these migrations can cause because they touch no rows. A PITR restore to before Phase 1 would also bring back the exposure: after any restore, immediately re-apply `01` and `06` and run `verify.sql`.

### 6.4 Emergency: the app gets `permission denied (42501)` after Phase 1

This means the server is not using a key that maps to `service_role`, or a grant to service_role is missing. **Do not grant anything to anon.**

1. Check that `SUPABASE_SERVICE_ROLE_KEY` in the hosting environment is the **service_role** key (Supabase → Settings → API), not the anon/publishable key. Redeploy.
2. If a grant is missing, run this (service_role only, idempotent, safe for production):

   ```sql
   GRANT ALL     ON ALL TABLES    IN SCHEMA public TO service_role;
   GRANT ALL     ON ALL SEQUENCES IN SCHEMA public TO service_role;
   GRANT EXECUTE ON ALL ROUTINES  IN SCHEMA public TO service_role;
   NOTIFY pgrst, 'reload schema';
   ```

3. Run `verify.sql`. Server logs name the failing context (`[context] permission denied (42501) …`).

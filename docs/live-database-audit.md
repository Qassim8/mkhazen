# Live database audit (Supabase `public` schema)

_Date: 2026-10-09 · Branch: `production-hardening` · Status: reviewed, **nothing applied to any real database**_

## 1. Source of truth and method

- **Source of truth:** `database/audit/live_public_schema.sql`, a pg_dump 17.6 of the production `public` schema (schema, ACLs, default privileges; no data). Older exports and earlier chat snippets were **not** used as evidence. Line numbers below refer to this file.
- **Method:**
  1. I read the dump directly.
  2. I loaded the **entire dump unmodified** into an isolated PostgreSQL 18 (PGlite, in-process, no network), with the three Supabase API roles created first (`anon` and `authenticated` NOINHERIT, `service_role` BYPASSRLS). Loading succeeded with no errors, and the loaded schema matches the dump: 22 tables, 53 functions, 15 triggers, 2 policies, RLS on 22 tables.
  3. Every finding below that concerns privileges or behaviour was **reproduced** there (`SET ROLE anon` and friends). The automated version is `database/tests/live-hardening.db.test.ts`.
- **What this cannot show:**
  - PostgREST behaviour
  - `supabase_admin`-owned defaults that are not in a `public` dump
  - event triggers (they are database-level, not in the dump)
  - real concurrency
  - row data

  These are listed for staging in [release-plan.md §5](release-plan.md#5-staging-only-validations).

## 2. Findings

Severity: **P0** = exploitable now, money or credential exposure · **P1** = serious · **P2** = correctness/maintenance · **P3** = hygiene.

### 2.1 F1 · P0 · `users` is readable by anyone with the public anon key

| | |
|---|---|
| Evidence | Line 8544: `CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true)` (no `TO` clause, so it applies to PUBLIC). Every table has `GRANT ALL … TO "anon"` and `TO "authenticated"` (ACL section, lines 8680–9375). |
| Affected | `public.users`: `password` (bcrypt hashes), `email`, `salary`, `phone`, `role`, `branchId`. Through the ALL grants, also every other table, readable and **writable** wherever RLS has no policy. |
| Reproduced | As `anon`: `SELECT email, password FROM public.users` returns rows (test _"reproduces the exposure"_). |
| Risk | Offline cracking of every staff password. The anon key is public by design (it ships to browsers in a normal Supabase setup and appears in project settings), so this must be treated as already exploitable. |
| Fix | `20261010_01`: `DROP POLICY IF EXISTS "Enable read access for all users"` plus `REVOKE ALL ON ALL TABLES … FROM anon, authenticated, PUBLIC`. The `"Allow server-side bypass"` policy (line 8537, `TO service_role`) is kept. `06` re-drops the policy if it reappears, and `verify.sql` fails if any users policy names PUBLIC, anon or authenticated. |
| Follow-up (owner) | Assume the hashes leaked: **force a password reset for all staff after Phase 1** ([release-plan.md §3](release-plan.md#3-phase-1--database-hardening-production-before-the-app-deploy)). Also rotate the anon/publishable key in Supabase if the dashboard allows it. The app does not use that key. |

### 2.2 F2 · P1 · RLS enabled on 22 tables but only 2 policies

| | |
|---|---|
| Evidence | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for all 22 tables. Only two policies exist, both on `users`. |
| Meaning | For roles without BYPASSRLS, RLS with no policy means **deny all rows**. Today the only open table is `users` (because of F1). Every other table is protected by RLS alone, while its table grants are ALL, so a single permissive policy added later would expose it. |
| Fix | Do not add policies. The app never queries as anon or authenticated (§3), so the right model is **no table privileges at all** for those roles plus RLS as a second layer. `01` and `06` also enable RLS on any future table that lacks it. `verify.sql` checks both layers. |

### 2.3 F3 · P0 · All 53 functions executable by anon/authenticated, 35 of them `SECURITY DEFINER`

| | |
|---|---|
| Evidence | Every function has `GRANT ALL ON FUNCTION … TO "anon"` / `"authenticated"`. Only 9 also `REVOKE ALL … FROM PUBLIC` (cancel_tailoring_order, complete_tailoring_pickup, complete_tailoring_production, convert_tailoring_to_product, list_opening_stock_candidates, record_opening_stock, refund_customer_advance, update_tailoring_order, update_tailoring_status), and that revoke is cancelled by the explicit anon grant. |
| Why it is P0 | DEFINER functions run as `postgres` and bypass RLS. They trust a caller-supplied `p_user_id`, which is not tied to the caller. Two do not check the user at all: **`complete_sales_checkout` never validates `p_cashier_id`** and **`process_inventory_adjustment` has no user/role check**. Anyone with the anon key can, through PostgREST `/rpc/…`, create sales, move stock, post refunds (`IN` + negative amount pays cash out) and exchange currency, as any user ID they can read from F1. |
| App dependency | None. The app calls RPCs only through `supabaseAdmin` (service_role), see §3. |
| Fix | `01`: `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated, PUBLIC` then `GRANT EXECUTE … TO service_role`. `06` repeats it last. `verify.sql` asserts that no public function is executable by anon, authenticated or PUBLIC (including the implicit PUBLIC of a NULL `proacl`), and that all 24 RPCs the app calls are executable by service_role. |
| Tested workflows (service_role, after hardening) | `database/tests/workflows.db.test.ts`: POS checkout with a gift line; checkout rollback on insufficient stock; customer return (IN plus negative amount); return refused on insufficient SDG balance, fully rolled back; supplier return; `record_opening_stock`, including refusal of a second opening. `purchases.db.test.ts` covers receipt and payment. `ledger.db.test.ts` covers ledger totals. The tailoring RPC bodies are unchanged. Their EXECUTE for service_role is asserted by verify, and the end-to-end flow is a staging smoke test. |

The DEFINER inventory (35) is in Appendix A.

### 2.4 F4 · P0 · Default privileges hand every future object to anon/authenticated

| | |
|---|---|
| Evidence | Lines 9377–9420: `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES / FUNCTIONS / TABLES TO "anon"`, `"authenticated"` and `"service_role"`. The `supabase_admin` equivalents are present only as comments in the dump. |
| Risk | Any migration that creates a table or function (including 02 and 03 here) would re-expose it automatically. In addition, PostgreSQL's built-in default gives **EXECUTE to PUBLIC** on every new function, and a schema-scoped `REVOKE` cannot remove that built-in default. |
| Fix | `01`, repeated in `06`: <br>• `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS FROM anon, authenticated` <br>• **global** `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` <br>• re-grant the service_role defaults. |
| Proven | After the sequence, a new table and function created by postgres, and a `CREATE OR REPLACE` of an existing RPC, are not visible to anon. The new function's ACL has no PUBLIC entry. service_role gets access (test _"objects created later…"_). |
| Side effect (documented, intended) | The global PUBLIC-EXECUTE revoke applies to functions **postgres** creates in **any** schema from now on. Supabase-managed schemas (`auth`, `storage`, `extensions`, …) are created by `supabase_admin` and are not affected. If you later create a function in another schema that should be callable by everyone, grant it explicitly. |
| Residual risk | Default privileges of `supabase_admin` cannot be changed by `postgres`. If the platform or the dashboard (running as supabase_admin) creates objects in `public`, they may still be granted to anon. `verify.sql` reports those as INFO, and `06` closes them. Re-run `06` and `verify` after any dashboard schema change. |

### 2.5 Re-grant prevention (requirement "migrations created before or after cannot re-grant")

Layers, from strongest to weakest:

1. **Order.** `01` runs **first**, so the defaults are already closed when 02–04 create objects. `06` runs **last** and revokes anything granted in between.
2. **Repo lint** (`tests/unit/db-access.test.ts`). Any `GRANT … TO anon|authenticated|PUBLIC`, `DISABLE ROW LEVEL SECURITY` or `USING (true)` policy in `database/migrations/*.sql` fails CI.
3. **Default privileges** (F4). New postgres-owned objects are born closed.
4. **`verify.sql`**. It fails on any table, column, sequence or function privilege for anon, authenticated or PUBLIC, any default ACL for them, or a public users policy. It is part of every release.
5. **Optional `07` event trigger** (`app_private.reassert_public_acl`). It re-revokes immediately after `GRANT` or `CREATE …` in `public`. It only issues REVOKE and has a re-entrancy flag. An earlier draft re-granted service_role inside the trigger and recursed; the test caught it. **Limits:** Supabase does not fire event triggers for superuser sessions, and platform support must be confirmed on staging. Evidence that event triggers are allowed: the live schema contains a postgres-owned `event_trigger` function `rls_auto_enable` (Supabase's auto-RLS feature), but the event trigger itself is not in a schema dump.

Not done, deliberately: revoking `USAGE ON SCHEMA public` from anon/authenticated. Supabase tooling expects it, and with no object privileges it grants nothing. Revisit if the owner wants belt and braces.

### 2.6 F5 · P1 · `process_purchase_order_receipt(uuid)` (line 4169)

- DEFINER **without `search_path`**. It updates `public.products` and reads `purchase_order_items.product_id`, **neither of which exists**, so it fails whenever it is called.
- References: no trigger, no `pg_depend` dependents, no other function body, not called by the app (static test).
- `01` revokes it and pins `search_path`. `04` drops it only if it is still unreferenced at apply time (guards tested: a referencing function makes `04` keep it).

### 2.7 F6 · P2 · `journal_entries_apply_currency()` and `sales_orders_apply_exchange_rate()` are unattached

- Both are trigger functions, attached to no trigger. The live triggers use `snapshot_journal_currency()` and `snapshot_sales_order_currency()` instead. No dependents or references.
- **They are not reattached anywhere.** `04` drops them under the same guards (tested: a trigger using one makes `04` keep it). `verify.sql` fails if any trigger uses a legacy function.

### 2.8 F7 · P1 · `update_tailoring_order_status(uuid, uuid, uuid, text)` (line 5971)

- DEFINER **without `search_path`**. It is a legacy duplicate of `update_tailoring_status` (which the app calls) with a different argument order. Its NEW→UNDER_TAILORING path inserts `movement_type 'TAILORING'`, which `inventory_movements_movement_type_check` rejects, so that path cannot succeed.
- `01` pins `search_path = public, pg_temp` and revokes EXECUTE (the safe change). `04` then drops it if unreferenced. The `04` rollback re-creates it **with** the pinned search_path and service_role-only EXECUTE.

### 2.9 F8 · P3 · Two identical updatedAt triggers on `users` (lines 8011, 8018)

- `update_user_updated_at` and `update_users_updated_at`: both `BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`, which only sets `NEW."updatedAt" = NOW()`. `now()` is constant within a transaction, so running it twice gives the same value. **The duplicate is confirmed redundant and harmless.**
- Optional `08` drops `update_user_updated_at` only if, at apply time, both are identical (function, tgtype, enabled state, no arguments, no column list, no WHEN clause). It is tested, including that updatedAt is still maintained. It is not part of the mandatory sequence.

### 2.10 F9 · preserved · `snapshot_journal_currency()` uses `exchange_rates.rate`

- Lines 4787–4946: it reads `er.rate` and calls `require_exchange_rate()` / `get_current_exchange_rate()`. No migration here touches it.
- `verify.sql` fails if the body ever reads a `.sdg_per_usd` field (the `v_rate.sdg_per_usd` regression) or stops reading `exchange_rates` / `.rate`. The legitimate column `exchange_rate_sdg_per_usd` is not flagged.

### 2.11 F10 · preserved · `record_opening_stock()` already posts DR INVENTORY / CR CAPITAL

- Line 4196: one `JE-OPEN-…` CAPITAL entry DR INVENTORY / CR CAPITAL for the total, plus OPENING_STOCK movements. It refuses variants with non-zero stock or prior movements, and requires an owner or admin (`lower(role)`).
- Tested on the live schema: exactly one entry; a second opening for the same item is refused, so INVENTORY and CAPITAL are not duplicated.
- Any opening-balance flow must exclude INVENTORY and the inventory share of CAPITAL. Implemented accordingly in `20261010_05_opening_balances.sql` — see [opening-balances-design.md](opening-balances-design.md).

### 2.12 F11 · preserved · Returns = `process_inventory_adjustment` IN + negative amount (owner-approved)

- Line 3590. **IN + negative amount**:
  - DR SALES / CR CASH|BANK, entry_type SALE, SDG (inferred by `snapshot_journal_currency`), after a balance check on SDG entries;
  - plus DR INVENTORY / CR COGS at the **current** average cost;
  - plus an ADJUSTMENT_IN movement.
- **OUT + positive amount** (supplier return): DR CASH|BANK / CR INVENTORY (entry_type PURCHASE, USD).
- No returns subsystem has been added. `docs/production-audit.md` previously listed "no sales return" as a gap; that is now corrected there. The flow is covered by `workflows.db.test.ts`.
- Observations for the owner, **not changed**:
  - the COGS reversal uses today's average cost, not the original sale's cost;
  - the refund is converted at today's rate, not the invoice rate;
  - the return is not linked to an invoice.

  These are accounting choices. They are listed as decision D5-follow-up in §6, not "fixed".

### 2.13 Other findings (not in the brief; documented, not changed)

| ID | Sev | Finding | Action |
|---|---|---|---|
| X1 | P1 | `complete_sales_checkout` (line 214) never validates `p_cashier_id`: not existence, role, branch or isActive. Characterization test proves that a tailor or an other-branch user is accepted. | Unreachable once F3 is fixed (server checks `sales.pos`). Adding a DB check is decision **D13** (needs confirmation that every cashier row has `branchId` set, otherwise sales would start failing). |
| X2 | P1 | `process_inventory_adjustment` has no user/role/branch check, and `p_user_id` may be NULL. | Same: closed by F3. A DB check is part of D13. |
| X3 | P2 | Existing RPCs check `users."branchId" IS DISTINCT FROM p_branch_id` and mostly **not** `isActive`. | The app rejects deactivated sessions (`lib/auth.ts`). The new functions (02) check isActive. Changing old bodies is D13. |
| X4 | P2 | `inventory_movements` has two movement-type CHECKs. The effective set excludes `TAILORING` (only `inventory_movements_type_check` allows it). | Documented. Only the legacy F7 function used `TAILORING`. |
| X5 | P3 | Duplicate FKs (journal `sales_order_id` ×2; `inventory_movements.sales_order_id` with both RESTRICT and SET NULL) and duplicate indexes. | Documented for a later cleanup. RESTRICT wins, which is the safer behaviour. |
| X6 | P3 | DEFINER functions use `search_path = public` without `pg_temp`. | Low risk once only service_role can execute. Pin `public, pg_temp` when those bodies are next edited. |
| X7 | P3 | Other unused functions: `check_overdue_tailoring_orders`, `create_tailoring_overdue_notifications` (the app uses `generate_overdue_tailoring_notifications`), `pay_tailor_commission`, `get_effective_exchange_rate`, plus helpers. | Revoked by F3. Not dropped (not requested, and they may be used by internal functions). |
| X8 | P3 | `purchase_order_payments.payment_method varchar(30)` has no CHECK. `purchase_orders.journal_entry_id` has no FK. The `"Role"` enum has both cases (`ADMIN`/`admin`…). | The new RPCs validate `CASH`/`BANK` and use `lower(role)` (tested with `ADMIN`). |
| X9 | P3 | Column comment says `sellingPrice` is SDG, but `complete_sales_checkout` multiplies it by the rate (it is USD). | Documented. Tests assert the actual behaviour (USD × rate). |

## 3. The application uses only `service_role` (confirmation for F1–F4)

- `lib/supabase.ts` (`import "server-only"`) is the only file that creates a Supabase client. The previously exported but **never imported** anon client (`supabase` with `SUPABASE_PUBLISHABLE_KEY`) has been removed, so the app no longer needs that variable.
- No `NEXT_PUBLIC_SUPABASE_*` usage, no browser client, no client component importing the DB client, no `@supabase/ssr`.
- Every non-public API route calls `requireLogin` / `requirePermission` / `requireAnyPermission` (directly or through a local helper) before touching `supabaseAdmin`. Only `auth/login`, `auth/logout` and `auth/request-reset` are public, and login and reset are rate-limited.
- All of the above is enforced by `tests/unit/db-access.test.ts`. The E2E suite runs the production build **without** any anon key.
- If service_role ever receives `42501`, the server now logs `permission denied (42501) — check SUPABASE_SERVICE_ROLE_KEY and run …verify.sql` and returns a generic 503 (`lib/api-response.ts`).

## 4. Legacy function evidence

| Function | Trigger uses it | pg_depend dependents | Referenced by another body | App calls it | Decision |
|---|---|---|---|---|---|
| `process_purchase_order_receipt(uuid)` | no | none | no | no | revoke + pin (01) → guarded drop (04) |
| `journal_entries_apply_currency()` | no | none | no | no | guarded drop (04), never reattached |
| `sales_orders_apply_exchange_rate()` | no | none | no | no | guarded drop (04), never reattached |
| `update_tailoring_order_status(uuid,uuid,uuid,text)` | no | none | no | no | revoke + pin (01) → guarded drop (04) |

`04` re-checks all three conditions **at apply time** on the target database, so if staging or production differs from the dump, the function is kept and a NOTICE says why.

## 5. Reconciliation of pending migrations (deliverable B)

Pending before this work, never applied anywhere: `20261009_01_atomic_purchases_and_idempotency.sql` (+ `.verify.sql`, `.rollback.sql`) and `20261009_02_ledger_period_totals.sql`. They were written against a **guessed** stub schema. They are now in `database/migrations/superseded/` with a DO-NOT-APPLY banner and replaced by `20261010_02` and `20261010_03`.

| Topic | 20261009 (superseded) | Live schema fact | 20261010 (replacement) |
|---|---|---|---|
| Duplicates | — | `receive_purchase_order`, `record_purchase_payment`, `ledger_period_totals`, `api_idempotency_keys` do **not** exist live | Same names, `CREATE OR REPLACE` / `IF NOT EXISTS` (idempotent) |
| Average cost fallback | `COALESCE("averageCost", purchasePrice/f)` | `"averageCost" numeric(12,2) NOT NULL DEFAULT 0`, so COALESCE never falls back | **Bug fixed:** `COALESCE(NULLIF("averageCost",0), "purchasePrice"/factor)`, the same basis as `complete_sales_checkout` and `process_inventory_adjustment`. Test: stock 12 at avg 0 / price 60 per carton of 6 → new avg 15, not 10 |
| Conversion factor | `CASE WHEN COALESCE(f,0)>0 …`, template `LEFT JOIN` | `"conversionFactor" numeric DEFAULT 1` (nullable); `template_id NOT NULL` | `COALESCE(NULLIF(f,0),1)` and an INNER JOIN (an item without a template is impossible by FK) |
| Caller checks | role only | Existing RPCs check `users."branchId"`; `isActive` exists; `"Role"` enum has mixed case | exists + `isActive` + `"branchId" = p_branch_id` + `lower(role::text) IN ('owner','admin')`. Tested: inactive, other branch, unknown user, cashier, tailor rejected; `ADMIN` accepted |
| Status / type columns | casts `status::text`, `movement_type::text` (stub used enums) | `purchase_orders.status varchar(20)` + CHECK; `movement_type varchar(30)`; journal accounts `varchar(100)`, `entry_type varchar(30)` | plain comparisons |
| Journal entry number | `md5(random()…)` | `entry_number varchar(50) NOT NULL` | `JE-YYYY-` + 10 hex characters from `gen_random_uuid()` (16 characters, asserted ≤ 50) |
| Journal currency | relied on the trigger | `currency text NOT NULL`, `amount_usd NOT NULL`, consistency CHECK; `snapshot_journal_currency` resolves PURCHASE/SUPPLIERS↔CASH/BANK to USD | Relies on the live trigger (not reimplemented). Tested: `currency='USD'`, `amount_usd = amount` |
| Entry types | PURCHASE, PURCHASE_PAYMENT | both in `journal_entries_entry_type_check` | unchanged |
| Payment balance | own SUM formula | `get_account_balance(uuid,text,text)` exists live (invoker) and is used by the UI | calls `get_account_balance(branch, account, 'USD')` after an advisory lock, so the check uses the same number the UI shows (tested) |
| `payment_method` | — | `varchar(30)`, no CHECK | function validates `CASH`/`BANK` |
| Triggers | — | `inventory_movements_usd_cost_snapshot`, `trg_product_variants_stock_notify`, `update_product_variants_updated_at`, `journal_entries_currency_snapshot`, `trg_journal_settle_tailor_fx` fire on the new writes | No new triggers. The live ones fire as before (tested: USD cost snapshot is filled) |
| GRANTs | `REVOKE … FROM PUBLIC/anon/authenticated`, `GRANT … TO service_role` (correct) | Defaults would grant anon on creation | Same explicit revoke/grant, **and** 01 has already closed the defaults, and 06 re-asserts. The repo lint forbids any anon/authenticated/PUBLIC grant |
| Ledger function | groups by account/currency/type/month; INVOKER | columns as used; partial index `journal_entries_usd_created_idx (branch_id, created_at DESC) WHERE amount_usd IS NOT NULL` already covers all rows | Unchanged logic; no new index; proven equal to the raw computation on 400 entries through the live currency trigger |
| Verify | assumed stub objects | — | Replaced by one `20261010_verify.sql` for the whole release |

## 6. Open confirmations and decisions (owner / accountant; not invented here)

Decision IDs continue the list in [production-audit.md §11](production-audit.md) (D1–D12).

| ID | Question | Why it matters | Default if undecided |
|---|---|---|---|
| D13 | Add caller validation (exists, role, branch, isActive) inside `complete_sales_checkout`, `process_inventory_adjustment` and the other old RPCs? Confirm that all active staff rows have `branchId` set. | Defence in depth if the service key ever leaks. Without the confirmation, a NULL `branchId` would start blocking sales. | Not changed; F3 closes the external path. |
| D5-follow-up | Returns (approved flow): should the COGS reversal use the original sale cost and the refund use the invoice rate? Link returns to invoices? | Profit and FX accuracy on returns. | Current behaviour kept and documented (F11). |
| D6 | Opening balances | Must not duplicate `record_opening_stock`. | **Built at the owner's request** (`20261010_05` + page `/dashboard/accounting/opening-balances`): cash/bank, existing assets and supplier debts against CAPITAL; tailoring advances and tailor balances through the normal screens. The owner/accountant should still confirm the counterpart (CAPITAL) — see [opening-balances-design.md](opening-balances-design.md). |
| C1 | Force a password reset for all staff after Phase 1? | F1 exposed the hashes. | **Recommended: yes.** |
| C2 | Confirm on staging that event triggers can be created by `postgres` (optional `07`). | Platform rules. | **2026-10-10 production verify:** the project already runs event triggers (`ensure_rls`, `pgrst_ddl_watch`, `issue_pg_*`), so 07 is very likely allowed. Still optional; rely on 06 and verify. |
| C3 | After the first production verify, check the INFO row "default privileges of other roles". | `supabase_admin` defaults are not visible in this dump. | **2026-10-10 production verify: non-empty.** `supabase_admin` default privileges grant anon/authenticated on new tables, sequences and functions in `public` (the platform's defaults; postgres cannot change them). Rule: after any schema change made from the Supabase dashboard or by the platform, run `06` then `verify`. |

## Appendix A — SECURITY DEFINER functions (35)

The app calls (19):
- **Check role and branch:** cancel_tailoring_order, complete_tailoring_pickup, exchange_currency, pay_tailor_payment, refund_customer_advance.
- **Check role, branch and isActive:** complete_tailoring_production, convert_tailoring_to_product, create_tailoring_order, update_tailoring_order, update_tailoring_status.
- **Check role only:** record_opening_stock.
- **No caller check:** complete_sales_checkout, process_inventory_adjustment, create_asset_with_journal_entry, create_product, update_product, list_opening_stock_candidates, maintain_notifications, generate_overdue_tailoring_notifications.

Not called by the app:
- check_overdue_tailoring_orders
- create_tailoring_overdue_notifications
- generate_product_barcode
- generate_product_sku
- get_effective_exchange_rate
- notify_variant_stock
- settle_tailor_fx
- process_purchase_order_receipt (no search_path)
- update_tailoring_order_status (no search_path)

Trigger and event-trigger functions:
- prevent_exchange_rate_mutation
- snapshot_inventory_movement_cost
- snapshot_journal_currency
- snapshot_sales_item_currency
- snapshot_sales_order_currency
- snapshot_sales_payment_currency
- rls_auto_enable (event trigger, `search_path = pg_catalog`)

After the release, every one of them is executable by service_role only.

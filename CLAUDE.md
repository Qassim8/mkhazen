# CLAUDE.md — Mkhazen (mini ERP for a clothing & tailoring store, Sudan)

## ⚠️ Production system with REAL data

- The live database holds real sales, stock and accounting. Treat every DB change as sensitive.
- Never run SQL against any database yourself. Deliver SQL as files; the developer runs them on a
  staging copy first, then on production after a backup.
- Do only what the task asks. No refactors, renames, formatting sweeps or "improvements" outside scope.
  If something else looks wrong, report it at the end instead of changing it.
- Before changing DB functions, read their latest definition in the repo. If it is not there, ask.

## Environments

- Local dev (`.env.local`) points to the STAGING Supabase project (a copy of production).
- Production env vars live only in the hosting dashboard. Never edit, print or commit any `.env*` file.
- Every SQL file is run first on staging, then on production by the developer.

## Stack

- Next.js 16 App Router (`proxy.ts` = middleware), React 19, TypeScript, Tailwind v4
  (`bg-(--primary-red)` syntax), Zod, react-hook-form, react-hot-toast, react-icons.
- Supabase Postgres via `supabaseAdmin` (`@/lib/supabase`, service role). Business logic lives in
  plpgsql RPC functions (SECURITY DEFINER), called from `app/api/**/route.ts`.
- Custom auth: JWT cookie `auth_token`, `getSession()` from `@/lib/auth`, users in `public.users`
  (bcrypt). Not Supabase Auth.
- UI is Arabic, RTL (`dir="rtl"`). Keep all user-facing text in Arabic.

## Permissions

- Central rules in `lib/permissions.ts` → `can(role, permission)`, `canAccessPath`, `homePageFor`.
  Roles: owner > admin > cashier > tailor. Owner = everything; admin = everything except
  `purchases.approve`. Always check permissions server-side in API routes, not only in the UI.
- `users."isDeveloper"` = protected support account (DB trigger blocks delete/edit). Hide it from
  every user list except the owner's users page.
- Cashier and tailor must NEVER see costs, purchase prices, averageCost or profit.

## Accounting rules (do not break)

- Single debit/credit lines in `journal_entries` (debit_account, credit_account, amount).
- Accounting currency = USD (costs, product prices, purchases, profit). Customer & tailor dealings
  = SDG. Trigger `journal_entries_apply_currency` sets currency / exchange_rate_used / amount_usd;
  rates come from `exchange_rates` (manual, set in settings).
- NEVER update or delete existing journal entries. Corrections = new reversing/adjusting entries.
- Every money or stock operation must be atomic inside one plpgsql function (stock + movement +
  journal entries together). API routes only validate and call `supabaseAdmin.rpc(...)`.
- Stock is in selling units. Inventory is valued at `product_variants."averageCost"` (weighted
  average, includes allocated shipping from purchase orders). `"purchasePrice"` = last/entered
  purchase price, not the real cost.
- Checkout (`complete_sales_checkout`) reads prices from the DB; never trust client totals blindly.
- `entry_type` must be one of the values allowed by the CHECK constraint on journal_entries.

## Data & dates

- Supabase returns max 1000 rows per request → paginate (range) when aggregating.
- Timezone Africa/Khartoum (UTC+2). Reporting weeks start Saturday.
- DB columns on product tables are camelCase and must be quoted in SQL (`"stockQuantity"`).

## SQL deliverables

- Idempotent: `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`.
- One-off data fixes: provide a read-only `preview` script and a separate `apply` script wrapped in
  BEGIN/COMMIT that refuses to run twice.
- Put SQL in the existing migrations folder (or `db/migrations/` if none), named
  `YYYYMMDD_short_name.sql`, and state clearly which file to run and in what order.

## Code conventions

- No synchronous `setState` inside `useEffect` (lint rule `react-hooks/set-state-in-effect`);
  use `useSyncExternalStore`, derived state, or event handlers.
- Modals/drawers that must cover the screen: render with `createPortal(..., document.body)`.
- Thermal receipts are 80mm; print CSS must hide the rest with `display:none` (not visibility).
- Money: round to 2 decimals; show SDG with `formatSDG` from `@/lib/currency`.

## Before finishing a task

- Run the type-check and lint scripts from package.json; fix only errors you introduced.
- Summarize: files changed, SQL files to run (in order), and how to test on staging.

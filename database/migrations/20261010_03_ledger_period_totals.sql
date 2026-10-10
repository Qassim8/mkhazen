/* =====================================================================
   20261010_03 — Grouped journal totals for the accounting pages (read-only)
   =====================================================================
   Supersedes the never-applied 20261009_02 (moved to migrations/superseded/).

   The accounting overview/summary used to download every journal entry
   (1,000 rows per request) twice per page view. This function returns sums
   grouped by (debit, credit, currency, entry type, month in Sudan time UTC+2).
   All balance/profit maths in app/api/accounting/_lib/ledger.ts are linear
   sums, so results are identical (proved in database/tests/ledger.db.test.ts
   against the live schema).

   Live columns used (journal_entries): debit_account/credit_account
   varchar(100), currency text NOT NULL, entry_type varchar(30),
   amount numeric(12,2), amount_usd numeric(14,2) NOT NULL, created_at timestamptz.
   An index on (branch_id, created_at DESC) already exists
   (journal_entries_usd_created_idx, partial on amount_usd IS NOT NULL —
   amount_usd is NOT NULL, so it covers every row). No new index.

   Read-only, idempotent. The app falls back to the old full scan if this
   function is missing. Rollback:
     DROP FUNCTION IF EXISTS public.ledger_period_totals(uuid, timestamptz, timestamptz);
   ===================================================================== */

BEGIN;

CREATE OR REPLACE FUNCTION public.ledger_period_totals(
  p_branch_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL
)
RETURNS TABLE (
  debit_account  text,
  credit_account text,
  currency       text,
  entry_type     text,
  month_key      text,
  amount         numeric,
  amount_usd     numeric,
  entries        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    je.debit_account::text,
    je.credit_account::text,
    je.currency,
    je.entry_type::text,
    to_char((je.created_at AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM') AS month_key,
    sum(je.amount)     AS amount,
    sum(je.amount_usd) AS amount_usd,
    count(*)           AS entries
  FROM public.journal_entries je
  WHERE je.branch_id = p_branch_id
    AND (p_from IS NULL OR je.created_at >= p_from)
    AND (p_to   IS NULL OR je.created_at <  p_to)
  GROUP BY 1, 2, 3, 4, 5
$$;

REVOKE ALL ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

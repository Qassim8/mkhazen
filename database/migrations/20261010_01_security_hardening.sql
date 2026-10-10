/* =====================================================================
   20261010_01 — Security hardening of the public schema (Supabase)
   =====================================================================
   Source of truth: database/audit/live_public_schema.sql (pg_dump 17.6).
   Evidence and risk analysis: docs/live-database-audit.md (§2).

   What the live schema shows (before this migration):
     • public.users (password hashes, salaries, phones) has policy
       "Enable read access for all users" FOR SELECT USING (true), and every
       public table is GRANT ALL to anon and authenticated
       → anyone holding the public anon key can read every password hash.
     • All 53 public functions are GRANT ALL to anon and authenticated,
       35 of them SECURITY DEFINER (they bypass RLS as postgres).
       complete_sales_checkout and process_inventory_adjustment do not even
       check p_cashier_id / p_user_id; the others trust a caller-supplied
       p_user_id that is not tied to the caller.
     • Default privileges for role postgres GRANT ALL on future public tables,
       sequences and functions to anon and authenticated.
     • Two SECURITY DEFINER functions have no SET search_path:
       process_purchase_order_receipt(uuid), update_tailoring_order_status(...).

   The application only ever uses the server-only service_role client
   (lib/supabase.ts → supabaseAdmin; verified in docs/live-database-audit.md §3),
   so removing every anon/authenticated privilege does not affect it.

   This migration:
     1. drops the public SELECT policy on users;
     2. ensures RLS is enabled on every public table;
     3. revokes ALL table/sequence privileges and function EXECUTE from
        anon, authenticated and PUBLIC on every existing public object;
     4. (re)grants service_role exactly what the server needs;
     5. changes default privileges so future objects created by postgres are
        not granted to anon/authenticated, and removes PostgreSQL's global
        PUBLIC EXECUTE default for functions created by postgres;
     6. pins search_path on the two SECURITY DEFINER functions without one;
     7. asks PostgREST to reload its schema cache.

   Safe to re-run (idempotent). Touches no rows. Does not alter any function
   body, trigger, constraint or policy other than the public users policy.
   Can be applied to production before the new application version (Phase 1
   in docs/release-plan.md) — the current app keeps working.

   ⚠️ There is NO safe rollback that restores anon/authenticated access.
   See docs/release-plan.md §6 for the emergency procedure (service_role only).
   ===================================================================== */

BEGIN;

-- 0) Preconditions --------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'role service_role does not exist — this migration is for Supabase databases only';
  END IF;
END $$;

-- 1) users: no public read policy (service_role keeps "Allow server-side bypass")
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;

-- 2) RLS on every public table (all 22 already have it; new ones get it too)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.rel);
  END LOOP;
END $$;

-- 3) Existing objects: nothing for anon / authenticated / PUBLIC ----------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- 4) service_role (server routes) keeps full access ------------------------
GRANT ALL     ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL     ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL ROUTINES  IN SCHEMA public TO service_role;

-- 5) Future objects created by postgres ------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- PostgreSQL grants EXECUTE to PUBLIC on every new function by default; a
-- schema-scoped REVOKE cannot remove that built-in default, only a global one
-- can (affects functions created by postgres in any schema — see audit §2.4).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Preserve the server's defaults (already present in the live dump)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 6) SECURITY DEFINER functions without a fixed search_path ----------------
--    (both are legacy and unused; 20261010_04 drops them if still unreferenced)
DO $$
BEGIN
  IF to_regprocedure('public.process_purchase_order_receipt(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.process_purchase_order_receipt(uuid) SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.update_tailoring_order_status(uuid, uuid, uuid, text)') IS NOT NULL THEN
    ALTER FUNCTION public.update_tailoring_order_status(uuid, uuid, uuid, text) SET search_path = public, pg_temp;
  END IF;
END $$;

COMMIT;

-- 7) PostgREST schema cache (no-op if nothing is listening)
NOTIFY pgrst, 'reload schema';

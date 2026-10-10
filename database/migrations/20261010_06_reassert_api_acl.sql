/* =====================================================================
   20261010_06 — Re-assert the API ACL (always apply LAST)
   =====================================================================
   Catch-all that closes anything granted to anon / authenticated / PUBLIC
   after 20261010_01 ran, whether by 02–05, by a later migration, or by a
   dashboard action. Re-run it after EVERY future migration (it is part of
   the release checklist in docs/release-plan.md and is idempotent).

   Also re-applies the default-privilege changes from 01, so even if an
   intermediate migration altered them, the end state is the same.

   Touches no rows, no function bodies, no triggers.
   No rollback: there is no safe state that re-opens anon/authenticated.
   ===================================================================== */

BEGIN;

-- RLS on every public table (Supabase's rls_auto_enable usually does this already)
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

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated, PUBLIC;

GRANT ALL     ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL     ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL ROUTINES  IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL     ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL     ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Column-level grants are not removed by table-level REVOKE ALL.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.oid::regclass AS rel, a.attname, g.grantee
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL (
      SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS grantee
      FROM aclexplode(a.attacl) x
      WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated')
    ) g
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON %s FROM %s', r.attname, r.rel, r.grantee);
  END LOOP;
END $$;

-- The users table must never regain a public read policy.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;

-- Report (do not silently change) any other policy that names PUBLIC/anon/authenticated.
-- Without table grants such a policy grants nothing, but it should be reviewed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    RAISE WARNING 'review policy %.%: "%" applies to %', r.schemaname, r.tablename, r.policyname, r.roles;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

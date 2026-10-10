/* =====================================================================
   20261010_07 — OPTIONAL: event-trigger guard against re-granting the API
   =====================================================================
   Optional defence in depth. 01 + 06 already give the correct end state and
   the default privileges keep new postgres-owned objects closed. This guard
   additionally reacts at DDL time: after any CREATE TABLE/VIEW/FUNCTION/
   SEQUENCE or GRANT in schema public, it revokes everything from anon,
   authenticated and PUBLIC again (REVOKE only — service_role is untouched).

   Feasibility: the live schema already contains a postgres-owned event-trigger
   function (public.rls_auto_enable, Supabase's "auto-enable RLS"), so event
   triggers are permitted on this project. STILL VALIDATE ON STAGING FIRST.

   Limits (documented in docs/live-database-audit.md §2.5):
     • Supabase does not fire event triggers for superuser sessions
       (supabase_admin, i.e. some dashboard/platform actions). verify.sql and
       06 remain the real control.
     • The guard only issues REVOKE (not a trigger tag) and also has a
       re-entrancy flag, so it cannot recurse. (An earlier draft re-GRANTed
       service_role inside the trigger and recursed — caught by the tests.)
     • The guard never raises: a failure is logged as WARNING and the DDL
       proceeds (a broken guard must not block a migration).

   Idempotent. Rollback:
     DROP EVENT TRIGGER IF EXISTS app_acl_guard;
     DROP FUNCTION IF EXISTS app_private.reassert_public_acl();
     DROP SCHEMA IF EXISTS app_private;   -- only if empty
   ===================================================================== */

BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.reassert_public_acl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- Re-entrancy guard (belt and braces: the body below only issues REVOKE,
  -- which is not one of the trigger's tags).
  IF current_setting('app_private.acl_guard_active', true) = 'on' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger_ddl_commands()
    WHERE schema_name = 'public' OR command_tag = 'GRANT'
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('app_private.acl_guard_active', 'on', true);
  BEGIN
    -- REVOKE only: service_role keeps its grants (it is never revoked here)
    -- and new postgres-owned objects get service_role from default privileges.
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
    REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated, PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'app_acl_guard: could not re-assert public ACL: %', SQLERRM;
  END;
  PERFORM set_config('app_private.acl_guard_active', 'off', true);
END;
$$;

ALTER FUNCTION app_private.reassert_public_acl() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.reassert_public_acl() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS app_acl_guard;
CREATE EVENT TRIGGER app_acl_guard
  ON ddl_command_end
  WHEN TAG IN (
    'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
    'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE FOREIGN TABLE',
    'CREATE FUNCTION', 'CREATE PROCEDURE', 'CREATE AGGREGATE',
    'CREATE SEQUENCE', 'GRANT'
  )
  EXECUTE FUNCTION app_private.reassert_public_acl();

COMMIT;

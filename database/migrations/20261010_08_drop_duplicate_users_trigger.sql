/* =====================================================================
   20261010_08 — OPTIONAL: drop the duplicate updatedAt trigger on users
   =====================================================================
   Live schema (lines 8011 and 8018) has two triggers on public.users:
     update_user_updated_at   BEFORE UPDATE FOR EACH ROW → update_updated_at_column()
     update_users_updated_at  BEFORE UPDATE FOR EACH ROW → update_updated_at_column()
   update_updated_at_column() only does NEW."updatedAt" = NOW(); running it
   twice in one statement gives the same value (now() is fixed per
   transaction). The duplicate is therefore redundant and harmless; removing it
   is cosmetic. Kept OPTIONAL — it is safe to skip.

   Drops update_user_updated_at ONLY if, at apply time, update_users_updated_at
   exists on the same table with the same function, timing, events and level
   (pg_trigger.tgtype), no arguments, and no column list / WHEN clause on either. Otherwise
   nothing is dropped. Idempotent.

   Rollback:
     CREATE OR REPLACE TRIGGER "update_user_updated_at" BEFORE UPDATE ON "public"."users"
       FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
   ===================================================================== */

BEGIN;

DO $$
DECLARE
  v_dup  pg_trigger;
  v_keep pg_trigger;
BEGIN
  SELECT * INTO v_dup  FROM pg_trigger
  WHERE tgrelid = to_regclass('public.users') AND tgname = 'update_user_updated_at'  AND NOT tgisinternal;
  SELECT * INTO v_keep FROM pg_trigger
  WHERE tgrelid = to_regclass('public.users') AND tgname = 'update_users_updated_at' AND NOT tgisinternal;

  IF v_dup.oid IS NULL THEN
    RAISE NOTICE 'update_user_updated_at already absent';
  ELSIF v_keep.oid IS NULL THEN
    RAISE NOTICE 'KEPT update_user_updated_at — update_users_updated_at is missing';
  ELSIF v_dup.tgfoid <> v_keep.tgfoid
     OR v_dup.tgfoid <> to_regprocedure('public.update_updated_at_column()')
     OR v_dup.tgtype <> v_keep.tgtype
     OR v_dup.tgenabled <> v_keep.tgenabled
     OR v_dup.tgqual IS NOT NULL OR v_keep.tgqual IS NOT NULL
     OR v_dup.tgnargs <> 0 OR v_keep.tgnargs <> 0
     -- column lists (UPDATE OF ...): an empty int2vector prints as ''
     OR v_dup.tgattr::text <> '' OR v_keep.tgattr::text <> '' THEN
    RAISE NOTICE 'KEPT update_user_updated_at — the two triggers are not identical';
  ELSE
    DROP TRIGGER update_user_updated_at ON public.users;
    RAISE NOTICE 'dropped duplicate trigger update_user_updated_at';
  END IF;
END $$;

COMMIT;

/* =====================================================================
   20261010_04 — Guarded removal of unused legacy functions
   =====================================================================
   Evidence (docs/live-database-audit.md §4): in live_public_schema.sql none of
   these is attached to a trigger or referenced by another function, and the
   application never calls them (enforced by tests/unit/db-contract.test.ts).

     • process_purchase_order_receipt(uuid) — SECURITY DEFINER, no search_path;
       updates public.products / purchase_order_items.product_id, neither of
       which exists (catalog is product_templates + product_variants).
     • journal_entries_apply_currency() — old trigger function, not attached;
       the live trigger journal_entries_currency_snapshot uses
       snapshot_journal_currency() (reads exchange_rates.rate).
     • sales_orders_apply_exchange_rate() — old trigger function, not attached;
       the live trigger sales_orders_currency_snapshot uses
       snapshot_sales_order_currency().
     • update_tailoring_order_status(uuid, uuid, uuid, text) — SECURITY DEFINER,
       no search_path, superseded by update_tailoring_status(uuid, uuid, uuid, text)
       (the one the app calls). Its NEW→UNDER_TAILORING path inserts movement
       type 'TAILORING', which inventory_movements_movement_type_check rejects.

   Each DROP runs only if, at apply time, the function:
     1. is not used by any trigger, and
     2. has no dependent objects in pg_depend, and
     3. is not mentioned by name in any other function body.
   Otherwise it is KEPT and a NOTICE says why. No trigger is attached or
   re-attached here. Idempotent. Rollback (service_role only, pinned
   search_path): 20261010_04_legacy_function_cleanup.rollback.sql
   ===================================================================== */

BEGIN;

DO $$
DECLARE
  v_sig     text;
  v_oid     oid;
  v_name    text;
  v_reason  text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.process_purchase_order_receipt(uuid)',
    'public.journal_entries_apply_currency()',
    'public.sales_orders_apply_exchange_rate()',
    'public.update_tailoring_order_status(uuid, uuid, uuid, text)'
  ]
  LOOP
    v_oid := to_regprocedure(v_sig);

    IF v_oid IS NULL THEN
      RAISE NOTICE 'legacy cleanup: % already absent', v_sig;
      CONTINUE;
    END IF;

    SELECT proname INTO v_name FROM pg_proc WHERE oid = v_oid;
    v_reason := NULL;

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid = v_oid) THEN
      v_reason := 'used by a trigger';
    ELSIF EXISTS (
      SELECT 1 FROM pg_depend
      WHERE refclassid = 'pg_proc'::regclass AND refobjid = v_oid AND deptype IN ('n', 'a')
    ) THEN
      v_reason := 'has dependent objects (pg_depend)';
    ELSIF EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid <> v_oid AND p.prosrc ~ ('\m' || v_name || '\M')
    ) THEN
      v_reason := 'referenced by another function body';
    END IF;

    IF v_reason IS NULL THEN
      EXECUTE format('DROP FUNCTION %s', v_oid::regprocedure);
      RAISE NOTICE 'legacy cleanup: dropped %', v_sig;
    ELSE
      RAISE NOTICE 'legacy cleanup: KEPT % — %', v_sig, v_reason;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

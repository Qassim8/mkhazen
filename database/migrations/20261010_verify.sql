/* =====================================================================
   20261010_verify.sql — post-migration assertions (read-only)
   =====================================================================
   Run after 01..06 (and optionally 07/08) on staging, then on production.
   Prints one row per check (PASS / FAIL / INFO) and finally RAISES an
   exception if any check failed, so `psql -v ON_ERROR_STOP=1 -f` exits non-zero.
   Changes nothing (temporary table only, dropped at the end of the session).

   Also exercised automatically by database/tests/live-hardening.db.test.ts.
   ===================================================================== */

CREATE TEMP TABLE IF NOT EXISTS _verify (
  seq    serial,
  check_name text,
  status text,
  detail text
);
TRUNCATE _verify;

DO $$
DECLARE
  v_bad   text;
  v_count int;
  v_app_rpcs text[] := ARRAY[
    'cancel_tailoring_order', 'complete_sales_checkout', 'complete_tailoring_pickup',
    'complete_tailoring_production', 'convert_tailoring_to_product',
    'create_asset_with_journal_entry', 'create_product', 'create_tailoring_order',
    'exchange_currency', 'generate_overdue_tailoring_notifications', 'get_account_balance',
    'get_opening_balances_status', 'record_opening_balances',
    'get_current_exchange_rate', 'ledger_period_totals', 'list_opening_stock_candidates',
    'maintain_notifications', 'pay_tailor_payment', 'process_inventory_adjustment',
    'receive_purchase_order', 'record_opening_stock', 'record_purchase_payment',
    'refund_customer_advance', 'update_product', 'update_tailoring_order',
    'update_tailoring_status'
  ];
  v_legacy text[] := ARRAY[
    'process_purchase_order_receipt', 'journal_entries_apply_currency',
    'sales_orders_apply_exchange_rate', 'update_tailoring_order_status'
  ];
  v_expected_triggers text[] := ARRAY[
    'exchange_rates_immutable', 'inventory_movements_usd_cost_snapshot',
    'journal_entries_currency_snapshot', 'sales_order_items_currency_snapshot',
    'sales_order_payments_currency_snapshot', 'sales_orders_currency_snapshot',
    'trg_journal_settle_tailor_fx', 'trg_product_variants_stock_notify',
    'trg_sales_orders_resolve_delay', 'trg_tailor_payments_settle_fx',
    'update_product_templates_updated_at', 'update_product_variants_updated_at',
    'update_suppliers_updated_at', 'update_users_updated_at'
  ];
BEGIN

  ---------------------------------------------------------------- policies
  SELECT string_agg(policyname, ', ') INTO v_bad
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
    AND (policyname = 'Enable read access for all users'
         OR roles && ARRAY['public', 'anon', 'authenticated']::name[]);
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('users has no policy for PUBLIC/anon/authenticated',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('RLS enabled on every public table',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  ---------------------------------------------------------------- relations
  SELECT string_agg(format('%s:%s', r.rolname, c.relname), ', ') INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege(r.rolname, c.oid, 'SELECT')
      OR has_table_privilege(r.rolname, c.oid, 'INSERT')
      OR has_table_privilege(r.rolname, c.oid, 'UPDATE')
      OR has_table_privilege(r.rolname, c.oid, 'DELETE')
      OR has_table_privilege(r.rolname, c.oid, 'TRUNCATE')
      OR has_table_privilege(r.rolname, c.oid, 'REFERENCES')
      OR has_table_privilege(r.rolname, c.oid, 'TRIGGER'));
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('anon/authenticated have no table/view privilege in public',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(format('%s:%s.%s', r.rolname, c.relname, a.attname), ', ') INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT, INSERT, UPDATE, REFERENCES');
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('anon/authenticated have no column privilege in public',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, left(coalesce(v_bad, ''), 500));

  SELECT string_agg(format('%s:%s', r.rolname, c.relname), ', ') INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  WHERE c.relkind = 'S'
    AND has_sequence_privilege(r.rolname, c.oid, 'USAGE, SELECT, UPDATE');
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('anon/authenticated have no sequence privilege in public',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind IN ('r', 'p')
    AND NOT (has_table_privilege('service_role', c.oid, 'SELECT')
         AND has_table_privilege('service_role', c.oid, 'INSERT')
         AND has_table_privilege('service_role', c.oid, 'UPDATE')
         AND has_table_privilege('service_role', c.oid, 'DELETE'));
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('service_role has SELECT/INSERT/UPDATE/DELETE on every public table',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT CASE WHEN rolbypassrls THEN NULL ELSE 'service_role lacks BYPASSRLS' END INTO v_bad
  FROM pg_roles WHERE rolname = 'service_role';
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('service_role bypasses RLS',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  ---------------------------------------------------------------- functions
  SELECT string_agg(format('%s:%s', r.rolname, p.oid::regprocedure), ', ') INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
  WHERE has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('anon/authenticated cannot EXECUTE any public function',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, left(coalesce(v_bad, ''), 500));

  -- PUBLIC EXECUTE is the implicit default when proacl IS NULL
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proacl IS NULL
     OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0);
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('no public function is executable by PUBLIC',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, left(coalesce(v_bad, ''), 500));

  SELECT string_agg(rpc, ', ') INTO v_bad
  FROM unnest(v_app_rpcs) rpc
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.proname = rpc AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  );
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('every RPC the app calls exists and service_role can EXECUTE it',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('every SECURITY DEFINER function pins search_path',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('receive_purchase_order', 'record_purchase_payment', 'ledger_period_totals',
                      'record_opening_balances', 'get_opening_balances_status', 'opening_balance_timestamp')
    AND (p.prosecdef
      OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'));
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('new RPCs are SECURITY INVOKER with pinned search_path',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  ---------------------------------------------------------------- default privileges
  -- Any default ACL (for any grantor) in public or global that grants anon/authenticated/PUBLIC.
  SELECT string_agg(format('%s/%s/%s->%s',
           pg_get_userbyid(d.defaclrole), coalesce(n.nspname, '<global>'), d.defaclobjtype,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END), ', ') INTO v_bad
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE pg_get_userbyid(d.defaclrole) = 'postgres'
    AND (n.nspname = 'public' OR d.defaclnamespace = 0)
    AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated'));
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('postgres default privileges grant nothing to anon/authenticated/PUBLIC',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  -- The global function default must exist (otherwise the built-in PUBLIC EXECUTE applies)
  SELECT count(*) INTO v_count
  FROM pg_default_acl d
  WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f';
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('postgres global function default removes PUBLIC EXECUTE',
          CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
          CASE WHEN v_count = 1 THEN '' ELSE 'no global pg_default_acl row for functions' END);

  SELECT string_agg(t, ', ') INTO v_bad
  FROM unnest(ARRAY['r', 'S', 'f']) t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace AND n.nspname = 'public'
    CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    WHERE pg_get_userbyid(d.defaclrole) = 'postgres' AND d.defaclobjtype = t
      AND pg_get_userbyid(x.grantee) = 'service_role'
  );
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('postgres default privileges keep service_role (tables, sequences, functions)',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  -- Other grantors (e.g. supabase_admin) cannot be changed by postgres: report only.
  SELECT string_agg(format('%s/%s/%s->%s',
           pg_get_userbyid(d.defaclrole), coalesce(n.nspname, '<global>'), d.defaclobjtype,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END), ', ') INTO v_bad
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE pg_get_userbyid(d.defaclrole) <> 'postgres'
    AND (n.nspname = 'public' OR d.defaclnamespace = 0)
    AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated'));
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('INFO default privileges of other roles (residual risk, see audit §2.4)',
          'INFO', coalesce(v_bad, 'none'));

  ---------------------------------------------------------------- triggers & accounting invariants
  SELECT string_agg(t, ', ') INTO v_bad
  FROM unnest(v_expected_triggers) t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tr JOIN pg_class c ON c.oid = tr.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE tr.tgname = t AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'
  );
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('expected business triggers present and enabled',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(format('%s→%s', tr.tgname, p.proname), ', ') INTO v_bad
  FROM pg_trigger tr JOIN pg_proc p ON p.oid = tr.tgfoid
  WHERE p.proname = ANY (v_legacy);
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('no trigger uses a legacy currency/receipt function',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = ANY (v_legacy);
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('INFO legacy functions still present (kept if 04 found a dependency)',
          'INFO', coalesce(v_bad, 'none'));

  SELECT CASE
           WHEN p.oid IS NULL THEN 'snapshot_journal_currency() missing'
           WHEN p.prosrc ~ '\.sdg_per_usd\M' THEN 'body reads a .sdg_per_usd field (v_rate.sdg_per_usd regression)'
           WHEN p.prosrc !~ 'exchange_rates' OR p.prosrc !~ '\.rate\M' THEN 'body no longer reads exchange_rates.rate'
         END INTO v_bad
  FROM (SELECT 1) one
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.snapshot_journal_currency()');
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('snapshot_journal_currency uses exchange_rates.rate (no sdg_per_usd)',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_inventory_adjustment'
                               AND pronamespace = 'public'::regnamespace)
              THEN 'process_inventory_adjustment missing' END INTO v_bad;
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('approved return workflow (process_inventory_adjustment) present',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_opening_stock'
                               AND pronamespace = 'public'::regnamespace)
              THEN 'record_opening_stock missing' END INTO v_bad;
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('record_opening_stock present (DR INVENTORY / CR CAPITAL)',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  ---------------------------------------------------------------- 02 objects
  SELECT CASE
           WHEN to_regclass('public.api_idempotency_keys') IS NULL THEN 'table missing'
           WHEN NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.api_idempotency_keys')) THEN 'RLS off'
         END INTO v_bad;
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('api_idempotency_keys exists with RLS',
          CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_bad, ''));

  ---------------------------------------------------------------- informational
  SELECT string_agg(format('%s(%s)%s', evtname, evtevent, CASE WHEN evtenabled = 'D' THEN ' disabled' ELSE '' END), ', ')
    INTO v_bad FROM pg_event_trigger;
  INSERT INTO _verify(check_name, status, detail)
  VALUES ('INFO event triggers', 'INFO', coalesce(v_bad, 'none'));
END $$;

SELECT check_name, status, detail FROM _verify ORDER BY seq;

-- @final-assertion (the test harness runs everything above, then this block)
DO $$
DECLARE
  v_failed text;
BEGIN
  SELECT string_agg(check_name, '; ') INTO v_failed FROM _verify WHERE status = 'FAIL';
  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION 'verify FAILED: %', v_failed;
  END IF;
  RAISE NOTICE 'verify: all checks passed';
END $$;

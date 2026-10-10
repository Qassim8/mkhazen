/* =====================================================================
   20261010_05 — Opening balances (الأرصدة الافتتاحية)
   =====================================================================
   Design: docs/opening-balances-design.md. Replaces the earlier draft
   (database/drafts/opening_balances.DRAFT.sql) with the version the owner
   asked to be built.

   What it records, all against CAPITAL (owner's equity), entry_type 'CAPITAL',
   entry numbers JE-OPENBAL-…, dated on the opening date:
     • cash / bank, per account and currency  → DR CASH|BANK   / CR CAPITAL
     • existing fixed assets (also a row in public.assets,
       payment_method 'OPENING', so the assets page lists them)
                                              → DR ASSETS      / CR CAPITAL
     • supplier debts, as a RECEIVED purchase order of type 'OPENING' with no
       items, so it is paid later from the normal purchase payment screen
       (record_purchase_payment caps payments at the order's remaining amount)
                                              → DR CAPITAL     / CR SUPPLIERS

   What it never does:
     • post INVENTORY — opening stock stays in record_opening_stock()
       (already DR INVENTORY / CR CAPITAL), so nothing is duplicated;
     • record the same cash/bank account+currency twice, or a second opening
       debt for the same supplier;
     • allow a second opening date (all batches share the first one).

   Schema changes (widening only, existing rows unaffected):
     • purchase_orders_type_check   += 'OPENING'
     • assets_payment_method_check  += 'OPENING'

   Functions (SECURITY INVOKER, search_path pinned, EXECUTE service_role only):
     • record_opening_balances(...)   — dry run (preview) or post
     • get_opening_balances_status(uuid)

   Idempotent. Apply after 01–04 and BEFORE 06. Rollback:
   20261010_05_opening_balances.rollback.sql
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) Widen two CHECK constraints
--------------------------------------------------------------------- */

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_type_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_type_check
  CHECK ((purchase_type)::text = ANY (ARRAY['DIRECT', 'WORKFLOW', 'OPENING']::text[]));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_payment_method_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_payment_method_check
  CHECK ((payment_method)::text = ANY (ARRAY['CASH', 'BANK', 'OPENING']::text[]));

/* ---------------------------------------------------------------------
   2) Helpers (Sudan time = UTC+2, same as the ledger)
--------------------------------------------------------------------- */

-- Timestamp used for every opening entry of a given opening date:
-- today → now(); a past date → 23:59:59 of that day in Sudan time.
CREATE OR REPLACE FUNCTION public.opening_balance_timestamp(p_as_of date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_as_of >= ((now() AT TIME ZONE 'UTC') + interval '2 hours')::date THEN now()
    ELSE (((p_as_of + 1)::timestamp - interval '2 hours') AT TIME ZONE 'UTC') - interval '1 second'
  END
$$;

/* ---------------------------------------------------------------------
   3) Status (read-only) — what is already recorded
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_opening_balances_status(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first_at timestamptz;
BEGIN
  SELECT min(created_at) INTO v_first_at
  FROM public.journal_entries
  WHERE branch_id = p_branch_id AND entry_number LIKE 'JE-OPENBAL-%';

  RETURN jsonb_build_object(
    'as_of', CASE WHEN v_first_at IS NULL THEN NULL
                  ELSE to_char((v_first_at AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM-DD') END,

    'today', to_char((now() AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM-DD'),

    'current_rate', public.get_current_exchange_rate(p_branch_id),

    'cash', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'account', debit_account, 'currency', currency,
               'amount', amount, 'amount_usd', amount_usd, 'entry_number', entry_number)
             ORDER BY debit_account, currency)
      FROM public.journal_entries
      WHERE branch_id = p_branch_id AND entry_number LIKE 'JE-OPENBAL-%'
        AND debit_account IN ('CASH', 'BANK')
    ), '[]'::jsonb),

    'assets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'category', category, 'currency', currency,
               'value', purchase_value, 'value_usd', purchase_value_usd,
               'purchase_date', purchase_date)
             ORDER BY created_at)
      FROM public.assets
      WHERE branch_id = p_branch_id AND payment_method = 'OPENING'
    ), '[]'::jsonb),

    'supplier_debts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'order_id', po.id, 'order_number', po.order_number,
               'supplier_id', po.supplier_id, 'supplier_name', s.name,
               'amount', po.total_amount,
               'paid', COALESCE((SELECT sum(p.amount) FROM public.purchase_order_payments p
                                 WHERE p.purchase_order_id = po.id), 0))
             ORDER BY po.created_at)
      FROM public.purchase_orders po
      LEFT JOIN public.suppliers s ON s.id = po.supplier_id
      JOIN public.journal_entries je ON je.id = po.journal_entry_id AND je.branch_id = p_branch_id
      WHERE po.purchase_type = 'OPENING'
    ), '[]'::jsonb),

    'opening_stock', (
      SELECT jsonb_build_object('entries', count(*), 'total_usd', COALESCE(sum(amount_usd), 0))
      FROM public.journal_entries
      WHERE branch_id = p_branch_id AND entry_number LIKE 'JE-OPEN-%'
    ),

    -- capital entered by hand (accounting page), shown so it is not entered twice
    'manual_capital_usd', (
      SELECT COALESCE(sum(CASE WHEN credit_account = 'CAPITAL' THEN amount_usd ELSE -amount_usd END), 0)
      FROM public.journal_entries
      WHERE branch_id = p_branch_id AND entry_type = 'CAPITAL'
        AND 'CAPITAL' IN (debit_account, credit_account)
        AND entry_number NOT LIKE 'JE-OPEN-%' AND entry_number NOT LIKE 'JE-OPENBAL-%'
    ),

    -- first day-to-day operation (sale, purchase, expense…) — opening date should not be after it
    'first_operation_at', (
      SELECT min(created_at) FROM public.journal_entries
      WHERE branch_id = p_branch_id AND entry_type <> 'CAPITAL'
    )
  );
END;
$$;

/* ---------------------------------------------------------------------
   4) Record (or preview) opening balances
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.record_opening_balances(
  p_branch_id      uuid,
  p_user_id        uuid,
  p_as_of          date,
  p_cash           jsonb DEFAULT '[]'::jsonb,   -- [{account: CASH|BANK, currency: USD|SDG, amount}]
  p_assets         jsonb DEFAULT '[]'::jsonb,   -- [{name, category, currency, value, purchaseDate?}]
  p_supplier_debts jsonb DEFAULT '[]'::jsonb,   -- [{supplierId, amount (USD), reference?}]
  p_notes          text  DEFAULT NULL,
  p_dry_run        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user        record;
  v_today       date := ((now() AT TIME ZONE 'UTC') + interval '2 hours')::date;
  v_existing_at timestamptz;
  v_at          timestamptz;
  v_rate        numeric;
  v_line        jsonb;
  v_account     text;
  v_currency    text;
  v_amount      numeric;
  v_usd         numeric;
  v_name        text;
  v_category    text;
  v_pdate       date;
  v_supplier    record;
  v_reference   text;
  v_seen        text[] := '{}';
  v_entries     jsonb := '[]'::jsonb;
  v_capital_usd numeric := 0;
  v_count       int := 0;
  v_number      text;
  v_entry_id    uuid;
  v_asset_id    uuid;
  v_order_id    uuid;
  v_notes       text := NULLIF(btrim(p_notes), '');
BEGIN
  /* ---------- caller ---------- */
  IF p_branch_id IS NULL OR p_user_id IS NULL OR p_as_of IS NULL THEN
    RAISE EXCEPTION 'بيانات الأرصدة الافتتاحية غير مكتملة';
  END IF;

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id INTO v_user
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;
  IF lower(v_user.role::text) <> 'owner' THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك فقط';
  END IF;

  -- one batch at a time per branch (the checks below read what is already recorded)
  PERFORM pg_advisory_xact_lock(hashtext('opening-balances:' || p_branch_id::text));

  /* ---------- opening date ---------- */
  IF p_as_of > v_today THEN
    RAISE EXCEPTION 'تاريخ الافتتاح لا يمكن أن يكون في المستقبل';
  END IF;

  SELECT min(created_at) INTO v_existing_at
  FROM public.journal_entries
  WHERE branch_id = p_branch_id AND entry_number LIKE 'JE-OPENBAL-%';

  IF v_existing_at IS NOT NULL
     AND ((v_existing_at AT TIME ZONE 'UTC') + interval '2 hours')::date <> p_as_of THEN
    RAISE EXCEPTION 'تاريخ الافتتاح محدد من قبل (%) ولا يمكن تغييره',
      to_char((v_existing_at AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM-DD');
  END IF;

  v_at := public.opening_balance_timestamp(p_as_of);
  v_rate := public.get_current_exchange_rate(p_branch_id, v_at);

  IF jsonb_typeof(COALESCE(p_cash, '[]')) <> 'array'
     OR jsonb_typeof(COALESCE(p_assets, '[]')) <> 'array'
     OR jsonb_typeof(COALESCE(p_supplier_debts, '[]')) <> 'array' THEN
    RAISE EXCEPTION 'صيغة بيانات الأرصدة الافتتاحية غير صالحة';
  END IF;

  /* ---------- validate cash / bank ---------- */
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_cash, '[]')) LOOP
    v_account  := upper(btrim(v_line ->> 'account'));
    v_currency := upper(btrim(v_line ->> 'currency'));
    v_amount   := round(NULLIF(v_line ->> 'amount', '')::numeric, 2);

    IF v_account IS NULL OR v_account NOT IN ('CASH', 'BANK') THEN
      RAISE EXCEPTION 'حساب النقدية يجب أن يكون الخزينة أو البنك';
    END IF;
    IF v_currency IS NULL OR v_currency NOT IN ('USD', 'SDG') THEN
      RAISE EXCEPTION 'العملة غير صالحة';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'رصيد % يجب أن يكون أكبر من صفر',
        CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END;
    END IF;
    IF (v_account || ':' || v_currency) = ANY (v_seen) THEN
      RAISE EXCEPTION 'رصيد % بال% مكرر', CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
        CASE WHEN v_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END;
    END IF;
    v_seen := v_seen || (v_account || ':' || v_currency);

    IF EXISTS (SELECT 1 FROM public.journal_entries
               WHERE branch_id = p_branch_id AND entry_number LIKE 'JE-OPENBAL-%'
                 AND debit_account = v_account AND currency = v_currency) THEN
      RAISE EXCEPTION 'رصيد % الافتتاحي بال% مسجّل من قبل',
        CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
        CASE WHEN v_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END;
    END IF;

    IF v_currency = 'SDG' AND (v_rate IS NULL OR v_rate <= 0) THEN
      RAISE EXCEPTION 'لا يوجد سعر صرف مسجّل حتى تاريخ الافتتاح. سجّل سعر الصرف من الإعدادات أولًا';
    END IF;
    v_usd := CASE WHEN v_currency = 'SDG' THEN round(v_amount / v_rate, 2) ELSE v_amount END;

    v_capital_usd := v_capital_usd + v_usd;
    v_count := v_count + 1;
    v_entries := v_entries || jsonb_build_object(
      'kind', 'CASH', 'label', CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      'debit', v_account, 'credit', 'CAPITAL', 'currency', v_currency,
      'amount', v_amount, 'amount_usd', v_usd);
  END LOOP;

  /* ---------- validate assets ---------- */
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_assets, '[]')) LOOP
    v_name     := NULLIF(btrim(v_line ->> 'name'), '');
    v_category := upper(btrim(v_line ->> 'category'));
    v_currency := upper(btrim(v_line ->> 'currency'));
    v_amount   := round(NULLIF(v_line ->> 'value', '')::numeric, 2);
    v_pdate    := COALESCE(NULLIF(v_line ->> 'purchaseDate', '')::date, p_as_of);

    IF v_name IS NULL OR length(v_name) > 255 THEN
      RAISE EXCEPTION 'اسم الأصل مطلوب (بحد أقصى 255 حرفًا)';
    END IF;
    IF v_category IS NULL OR v_category NOT IN ('MACHINE', 'AIR_CONDITIONER', 'COMPUTER', 'PRINTER', 'FURNITURE', 'OTHER') THEN
      RAISE EXCEPTION 'تصنيف الأصل "%" غير صالح', v_name;
    END IF;
    IF v_currency IS NULL OR v_currency NOT IN ('USD', 'SDG') THEN
      RAISE EXCEPTION 'عملة الأصل "%" غير صالحة', v_name;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'قيمة الأصل "%" يجب أن تكون أكبر من صفر', v_name;
    END IF;
    IF v_pdate > p_as_of THEN
      RAISE EXCEPTION 'تاريخ شراء الأصل "%" بعد تاريخ الافتتاح', v_name;
    END IF;
    IF v_currency = 'SDG' AND (v_rate IS NULL OR v_rate <= 0) THEN
      RAISE EXCEPTION 'لا يوجد سعر صرف مسجّل حتى تاريخ الافتتاح. سجّل سعر الصرف من الإعدادات أولًا';
    END IF;
    v_usd := CASE WHEN v_currency = 'SDG' THEN round(v_amount / v_rate, 2) ELSE v_amount END;

    v_capital_usd := v_capital_usd + v_usd;
    v_count := v_count + 1;
    v_entries := v_entries || jsonb_build_object(
      'kind', 'ASSET', 'label', v_name, 'category', v_category, 'purchase_date', v_pdate,
      'debit', 'ASSETS', 'credit', 'CAPITAL', 'currency', v_currency,
      'amount', v_amount, 'amount_usd', v_usd);
  END LOOP;

  /* ---------- validate supplier debts ---------- */
  v_seen := '{}';
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_supplier_debts, '[]')) LOOP
    v_amount    := round(NULLIF(v_line ->> 'amount', '')::numeric, 2);
    v_reference := NULLIF(btrim(v_line ->> 'reference'), '');

    SELECT id, name, "isActive" AS is_active INTO v_supplier
    FROM public.suppliers WHERE id = NULLIF(v_line ->> 'supplierId', '')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'المورد غير موجود';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'دين المورد "%" يجب أن يكون أكبر من صفر', v_supplier.name;
    END IF;
    IF v_reference IS NOT NULL AND length(v_reference) > 100 THEN
      RAISE EXCEPTION 'المرجع طويل جدًا (%)', v_supplier.name;
    END IF;
    IF v_supplier.id::text = ANY (v_seen) THEN
      RAISE EXCEPTION 'المورد "%" مكرر', v_supplier.name;
    END IF;
    v_seen := v_seen || v_supplier.id::text;

    IF EXISTS (SELECT 1 FROM public.purchase_orders
               WHERE supplier_id = v_supplier.id AND purchase_type = 'OPENING') THEN
      RAISE EXCEPTION 'الدين الافتتاحي للمورد "%" مسجّل من قبل', v_supplier.name;
    END IF;

    v_capital_usd := v_capital_usd - v_amount;
    v_count := v_count + 1;
    v_entries := v_entries || jsonb_build_object(
      'kind', 'SUPPLIER_DEBT', 'label', v_supplier.name, 'supplier_id', v_supplier.id,
      'reference', v_reference,
      'debit', 'CAPITAL', 'credit', 'SUPPLIERS', 'currency', 'USD',
      'amount', v_amount, 'amount_usd', v_amount);
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'أدخل رصيدًا واحدًا على الأقل';
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'as_of', p_as_of, 'exchange_rate', v_rate,
      'entries', v_entries, 'capital_change_usd', round(v_capital_usd, 2));
  END IF;

  /* ---------- post ---------- */
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_entries) LOOP
    v_number := 'JE-OPENBAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    v_asset_id := NULL;
    v_order_id := NULL;

    IF v_line ->> 'kind' = 'ASSET' THEN
      INSERT INTO public.assets (
        branch_id, created_by, name, category, purchase_value, purchase_date,
        payment_method, reference, notes, currency, exchange_rate_used, purchase_value_usd,
        created_at, updated_at
      ) VALUES (
        p_branch_id, p_user_id, v_line ->> 'label', v_line ->> 'category',
        (v_line ->> 'amount')::numeric, (v_line ->> 'purchase_date')::date,
        'OPENING', v_number, v_notes, v_line ->> 'currency',
        CASE WHEN v_line ->> 'currency' = 'SDG' THEN v_rate END,
        (v_line ->> 'amount_usd')::numeric, v_at, v_at
      ) RETURNING id INTO v_asset_id;
    END IF;

    IF v_line ->> 'kind' = 'SUPPLIER_DEBT' THEN
      INSERT INTO public.purchase_orders (
        order_number, supplier_id, status, purchase_type, order_date,
        subtotal, delivery_cost, discount_amount, total_amount, total_amount_usd,
        notes, created_by, received_by, created_at, updated_at
      ) VALUES (
        'OB-' || to_char(p_as_of, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        (v_line ->> 'supplier_id')::uuid, 'RECEIVED', 'OPENING', v_at,
        (v_line ->> 'amount')::numeric, 0, 0, (v_line ->> 'amount')::numeric, (v_line ->> 'amount')::numeric,
        COALESCE('دين افتتاحي' || COALESCE(' — ' || (v_line ->> 'reference'), '') || COALESCE(' — ' || v_notes, ''), 'دين افتتاحي'),
        p_user_id, p_user_id, v_at, v_at
      ) RETURNING id INTO v_order_id;
    END IF;

    -- SDG lines: the live snapshot_journal_currency trigger resolves the rate as of v_at
    INSERT INTO public.journal_entries (
      entry_number, created_by, branch_id, entry_type, amount, currency,
      debit_account, credit_account, purchase_order_id, reference, description, created_at
    ) VALUES (
      v_number, p_user_id, p_branch_id, 'CAPITAL', (v_line ->> 'amount')::numeric, v_line ->> 'currency',
      v_line ->> 'debit', v_line ->> 'credit', v_order_id,
      COALESCE(v_line ->> 'reference', 'OPENING-BALANCE'),
      CASE v_line ->> 'kind'
        WHEN 'CASH' THEN 'رصيد افتتاحي — ' || (v_line ->> 'label')
        WHEN 'ASSET' THEN 'رصيد افتتاحي — أصل: ' || (v_line ->> 'label')
        ELSE 'رصيد افتتاحي — دين للمورد: ' || (v_line ->> 'label')
      END || COALESCE(' — ' || v_notes, ''),
      v_at
    ) RETURNING id INTO v_entry_id;

    IF v_order_id IS NOT NULL THEN
      UPDATE public.purchase_orders SET journal_entry_id = v_entry_id WHERE id = v_order_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', false, 'as_of', p_as_of, 'exchange_rate', v_rate,
    'entries', v_entries, 'capital_change_usd', round(v_capital_usd, 2), 'count', v_count);
END;
$$;

/* ---------------------------------------------------------------------
   5) Privileges: server only
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.opening_balance_timestamp(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_opening_balances_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_opening_balances(uuid, uuid, date, jsonb, jsonb, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opening_balance_timestamp(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_opening_balances_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_opening_balances(uuid, uuid, date, jsonb, jsonb, jsonb, text, boolean) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

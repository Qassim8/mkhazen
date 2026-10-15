/* =====================================================================
   20261015_01 — الأرصدة الافتتاحية المتكررة + قائمة الرواتب
   =====================================================================
   1) record_opening_balances: للمالك والمدير، ويقبل الإدخال أكثر من مرة
      (رصيد إضافي لنفس الحساب والعملة، ودين افتتاحي إضافي لنفس المورد).
      يبقى رفض التكرار داخل الدفعة الواحدة، ويبقى تاريخ الافتتاح ثابتًا.
   2) get_payroll: كل الموظفين عدا الخياطين والمالك (النشطون، وغير النشطين
      الذين لهم دفعات في الشهر)، حتى لو لم يُسجَّل لهم راتب.

   قابل لإعادة التشغيل. يُطبَّق بعد 20261014_01 ثم يُعاد تشغيل
   20261010_06_reassert_api_acl.sql.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) record_opening_balances (نفس الدالة؛ تغيّر الصلاحية وأُزيل رفض ما سبق تسجيله)
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
  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك أو المدير فقط';
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
   2) get_payroll — كل الموظفين عدا الخياطين والمالك
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_payroll(p_branch_id uuid, p_period date)
RETURNS TABLE (
  user_id uuid,
  name text,
  role text,
  "position" text,
  is_active boolean,
  salary_sdg numeric,
  advances_sdg numeric,
  salary_paid_sdg numeric,
  taken_sdg numeric,
  remaining_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH params AS (SELECT date_trunc('month', p_period)::date AS period),
  paid AS (
    SELECT ep.user_id,
           sum(ep.amount) FILTER (WHERE ep.type = 'ADVANCE') AS advances,
           sum(ep.amount) FILTER (WHERE ep.type = 'SALARY') AS salaries
    FROM public.employee_payments ep, params
    WHERE ep.branch_id = p_branch_id AND ep.period = params.period
    GROUP BY ep.user_id
  )
  SELECT u.id, u.name::text, lower(u.role::text), u.position::text, u."isActive",
         round(COALESCE(u.salary, 0)::numeric, 2),
         round(COALESCE(p.advances, 0), 2),
         round(COALESCE(p.salaries, 0), 2),
         round(COALESCE(p.advances, 0) + COALESCE(p.salaries, 0), 2),
         round(greatest(COALESCE(u.salary, 0)::numeric - COALESCE(p.advances, 0) - COALESCE(p.salaries, 0), 0), 2)
  FROM public.users u
  LEFT JOIN paid p ON p.user_id = u.id
  WHERE u."branchId" = p_branch_id
    AND lower(u.role::text) NOT IN ('tailor', 'owner')
    AND (u."isActive" OR p.user_id IS NOT NULL)
  ORDER BY u.name;
$$;

/* ---------------------------------------------------------------------
   3) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.record_opening_balances(uuid, uuid, date, jsonb, jsonb, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payroll(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_opening_balances(uuid, uuid, date, jsonb, jsonb, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payroll(uuid, date) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

/* =====================================================================
   قفل المخزون الافتتاحي والأرصدة الافتتاحية (يُفتح للمالك فقط)

   • public.system_settings: إعدادات منطقية بسيطة (key / bool_value)، تُزرع بقيمها الأولية
     مرة واحدة فقط (ON CONFLICT DO NOTHING) فلا يُعاد ضبط القفل عند إعادة تشغيل الملف:
        opening_stock_locked    = true   (المخزون الافتتاحي مقفل)
        opening_balances_locked = false  (الأرصدة الافتتاحية مفتوحة حاليًا)
   • public.system_setting_changes: سجل من غيّر القفل ومتى (لا يُعدَّل ولا يُحذف).
   • public.is_system_lock_on(key): قراءة القفل داخل الدوال.
   • public.set_opening_lock(key, locked, user): تغيير القفل — المالك فقط — مع التسجيل.
   • الدوال التالية أُعيد إصدارها كما هي تمامًا مع إضافة فحص القفل فقط (بعد فحص الصلاحية):
        record_opening_stock, record_opening_inventory  ← opening_stock_locked
        record_opening_balances, record_opening_cash    ← opening_balances_locked
   • لا تغيير على correct_opening_stock_entry ولا list_opening_stock_corrections.

   شغّله على staging ثم production بعد النسخ الاحتياطي. آمن لإعادة التشغيل.
   ===================================================================== */

CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  bool_value  boolean NOT NULL,
  description text,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_setting_changes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL,
  old_value  boolean,
  new_value  boolean NOT NULL,
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_setting_changes_key_idx
  ON public.system_setting_changes (key, changed_at DESC);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_setting_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.system_setting_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;
GRANT ALL ON TABLE public.system_setting_changes TO service_role;

INSERT INTO public.system_settings (key, bool_value, description) VALUES
  ('opening_stock_locked',    true,  'قفل إدخال المخزون الافتتاحي (الإضافة بعده عبر أوامر الشراء)'),
  ('opening_balances_locked', false, 'قفل إدخال الأرصدة الافتتاحية')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_system_lock_on(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT bool_value FROM public.system_settings WHERE key = p_key), false);
$$;

REVOKE ALL ON FUNCTION public.is_system_lock_on(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_lock_on(text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_opening_lock(
  p_key    text,
  p_locked boolean,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_old  boolean;
BEGIN
  IF p_key IS NULL OR p_key NOT IN ('opening_stock_locked', 'opening_balances_locked') THEN
    RAISE EXCEPTION 'إعداد القفل غير معروف';
  END IF;
  IF p_locked IS NULL THEN
    RAISE EXCEPTION 'قيمة القفل مطلوبة';
  END IF;

  SELECT id, role, "isActive" AS is_active INTO v_user
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, false) THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;
  IF lower(COALESCE(v_user.role::text, '')) <> 'owner' THEN
    RAISE EXCEPTION 'تغيير قفل الإدخال الافتتاحي متاح للمالك فقط';
  END IF;

  SELECT bool_value INTO v_old FROM public.system_settings WHERE key = p_key FOR UPDATE;

  IF FOUND AND v_old = p_locked THEN
    RETURN jsonb_build_object('key', p_key, 'locked', p_locked, 'changed', false);
  END IF;

  INSERT INTO public.system_settings (key, bool_value, updated_by, updated_at)
  VALUES (p_key, p_locked, p_user_id, now())
  ON CONFLICT (key) DO UPDATE
    SET bool_value = EXCLUDED.bool_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.system_setting_changes (key, old_value, new_value, changed_by)
  VALUES (p_key, v_old, p_locked, p_user_id);

  RETURN jsonb_build_object('key', p_key, 'locked', p_locked, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_opening_lock(text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_opening_lock(text, boolean, uuid) TO service_role;

/* ---------------------------------------------------------------------
   الدوال المُقفلة (نفس النص الأخير في المستودع + فحص القفل فقط)
--------------------------------------------------------------------- */

-- record_opening_stock — الأصل: database/audit/live_public_schema.sql
CREATE OR REPLACE FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_now            timestamptz := now();
  v_user           record;
  v_item           jsonb;
  v_variant        record;
  v_variant_id     uuid;
  v_qty            numeric(20,2);
  v_unit_cost      numeric(20,6);
  v_line_total     numeric(20,2);
  v_total          numeric(20,2) := 0;
  v_count          integer := 0;
  v_seen           uuid[] := ARRAY[]::uuid[];
  v_entry_number   text;
  v_journal_id     uuid;
  v_notes          text;
  v_has_branch     boolean;
  v_has_currency   boolean;
  v_has_amount_usd boolean;
  v_has_legacy     boolean;
  v_rate_id        uuid;
  v_rate_value     numeric(20,6);
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'معرف الفرع مطلوب';
  END IF;

  /* --- الصلاحية: المالك أو المدير --- */
  SELECT id, role INTO v_user FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تسجيل المخزون الافتتاحي متاح للمالك أو المدير فقط';
  END IF;

  IF public.is_system_lock_on('opening_stock_locked') THEN
    RAISE EXCEPTION 'المخزون الافتتاحي مقفل. استخدم أوامر الشراء لإضافة بضاعة';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف لتسجيلها';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_entry_number := 'JE-OPEN-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements' AND column_name = 'branch_id'
  ) INTO v_has_branch;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'currency'
  ) INTO v_has_currency;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'amount_usd'
  ) INTO v_has_amount_usd;

  /* --- أعمدة نظام العملتين القديم: لو موجودة لازم نملاها بنفسنا،
         عشان الـ trigger القديم ما يحاولش يملاها ويفشل --- */
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'exchange_rate_id'
  ) INTO v_has_legacy;

  IF v_has_legacy THEN
    SELECT id, rate INTO v_rate_id, v_rate_value
    FROM public.exchange_rates
    WHERE branch_id = p_branch_id
      AND effective_at <= v_now
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1;

    IF v_rate_id IS NULL THEN
      RAISE EXCEPTION 'لازم تسجّل سعر الصرف الحالي من الإعدادات قبل تسجيل المخزون الافتتاحي';
    END IF;
  END IF;

  /* --- الأصناف --- */
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := NULLIF(v_item ->> 'variantId', '')::uuid;
    v_qty        := round(COALESCE((v_item ->> 'quantity')::numeric, 0), 2);
    v_unit_cost  := round(COALESCE((v_item ->> 'unitCost')::numeric, 0), 6);

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'معرف الصنف مطلوب';
    END IF;

    IF v_variant_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'الصنف مكرر في نفس العملية';
    END IF;

    v_seen := v_seen || v_variant_id;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;

    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'تكلفة الوحدة يجب أن تكون أكبر من صفر';
    END IF;

    SELECT v.id, v."templateId", v."stockQuantity", v."purchasePrice",
           COALESCE(v."isActive", true) AS is_active, pt.name AS product_name
    INTO v_variant
    FROM public.product_variants v
    JOIN public.product_templates pt ON pt.id = v."templateId"
    WHERE v.id = v_variant_id
    FOR UPDATE OF v;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف غير موجود';
    END IF;

    IF NOT v_variant.is_active THEN
      RAISE EXCEPTION 'الصنف % غير نشط', v_variant.product_name;
    END IF;

    IF COALESCE(v_variant."stockQuantity", 0) <> 0 THEN
      RAISE EXCEPTION 'الصنف % رصيده ليس صفرًا، فلا يصلح كمخزون افتتاحي', v_variant.product_name;
    END IF;

    IF EXISTS (SELECT 1 FROM public.inventory_movements m WHERE m.variant_id = v_variant.id) THEN
      RAISE EXCEPTION 'الصنف % عليه حركات مخزون سابقة، استخدم تسوية المخزون بدل المخزون الافتتاحي', v_variant.product_name;
    END IF;

    v_line_total := round(v_qty * v_unit_cost, 2);
    v_total := v_total + v_line_total;
    v_count := v_count + 1;

    UPDATE public.product_variants
    SET "stockQuantity" = v_qty,
        "averageCost"   = v_unit_cost,
        "purchasePrice" = CASE
                            WHEN COALESCE("purchasePrice", 0) = 0 THEN v_unit_cost
                            ELSE "purchasePrice"
                          END,
        "updatedAt"     = v_now
    WHERE id = v_variant.id;

    IF v_has_branch THEN
      INSERT INTO public.inventory_movements (
        movement_type, quantity, unit_cost, reference, notes,
        template_id, variant_id, created_by, branch_id, created_at
      ) VALUES (
        'OPENING_STOCK', v_qty, v_unit_cost, v_entry_number,
        COALESCE(v_notes, 'مخزون افتتاحي'),
        v_variant."templateId", v_variant.id, p_user_id, p_branch_id, v_now
      );
    ELSE
      INSERT INTO public.inventory_movements (
        movement_type, quantity, unit_cost, reference, notes,
        template_id, variant_id, created_by, created_at
      ) VALUES (
        'OPENING_STOCK', v_qty, v_unit_cost, v_entry_number,
        COALESCE(v_notes, 'مخزون افتتاحي'),
        v_variant."templateId", v_variant.id, p_user_id, v_now
      );
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'إجمالي قيمة المخزون الافتتاحي يجب أن يكون أكبر من صفر';
  END IF;

  /* --- قيد واحد لكل العملية: مدين المخزون / دائن رأس المال --- */
  IF v_has_legacy THEN
    -- الأعمدة القديمة بتتملا هنا عشان الـ trigger القديم يعدّي من غير ما ينادي
    -- الدالة المكسورة get_effective_exchange_rate
    EXECUTE
      'INSERT INTO public.journal_entries (
         entry_number, branch_id, entry_type, amount, description, reference,
         debit_account, credit_account, created_by, created_at,
         source_currency, exchange_rate_id, exchange_rate_sdg_per_usd
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id'
    INTO v_journal_id
    USING
      v_entry_number, p_branch_id, 'CAPITAL', v_total,
      'مخزون افتتاحي: ' || v_count || ' صنف' || COALESCE(' — ' || v_notes, ''),
      v_entry_number, 'INVENTORY', 'CAPITAL', p_user_id, v_now,
      'USD', v_rate_id, v_rate_value;
  ELSE
    INSERT INTO public.journal_entries (
      entry_number, branch_id, entry_type, amount,
      description, reference, debit_account, credit_account,
      created_by, created_at
    ) VALUES (
      v_entry_number, p_branch_id, 'CAPITAL', v_total,
      'مخزون افتتاحي: ' || v_count || ' صنف' || COALESCE(' — ' || v_notes, ''),
      v_entry_number, 'INVENTORY', 'CAPITAL', p_user_id, v_now
    )
    RETURNING id INTO v_journal_id;
  END IF;

  /* --- شبكة أمان: لو مفيش trigger بيحدد العملة، نحددها هنا (التكلفة بالدولار) --- */
  IF v_has_currency THEN
    EXECUTE format(
      'UPDATE public.journal_entries SET currency = %L WHERE id = %L AND currency IS NULL',
      'USD', v_journal_id
    );
  END IF;

  IF v_has_amount_usd THEN
    EXECUTE format(
      'UPDATE public.journal_entries SET amount_usd = %L WHERE id = %L AND amount_usd IS NULL',
      v_total, v_journal_id
    );
  END IF;

  RETURN jsonb_build_object(
    'journal_entry_id', v_journal_id,
    'entry_number',     v_entry_number,
    'items_count',      v_count,
    'total_cost_usd',   v_total
  );
END;
$_$;

-- record_opening_inventory — الأصل: 20261014_01_deposit_gifts_opening_payroll.sql
CREATE OR REPLACE FUNCTION public.record_opening_inventory(
  p_branch_id uuid,
  p_user_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_user record;
  v_variant record;
  v_old_stock numeric(14,2);
  v_old_cost numeric(14,6);
  v_new_stock numeric(14,2);
  v_new_cost numeric(14,2);
  v_total numeric(14,2);
  v_entry_id uuid;
  v_entry_number text;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
BEGIN
  SELECT id, role, "branchId" AS branch_id, "isActive" AS is_active INTO v_user
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, false) THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;
  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;
  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك أو المدير فقط';
  END IF;

  IF public.is_system_lock_on('opening_stock_locked') THEN
    RAISE EXCEPTION 'المخزون الافتتاحي مقفل. استخدم أوامر الشراء لإضافة بضاعة';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 OR round(p_quantity, 2) <> p_quantity THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 OR round(p_unit_cost, 2) <> p_unit_cost THEN
    RAISE EXCEPTION 'تكلفة الوحدة بالدولار يجب أن تكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  SELECT v.id, v."templateId" AS template_id, v."stockQuantity" AS stock,
         v."averageCost" AS average_cost, v."purchasePrice" AS purchase_price,
         COALESCE(v."isActive", true) AS is_active, pt.name AS product_name
  INTO v_variant
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  WHERE v.id = p_variant_id
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;
  IF NOT v_variant.is_active THEN
    RAISE EXCEPTION 'الصنف % غير نشط', v_variant.product_name;
  END IF;

  v_total := round(p_quantity * p_unit_cost, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'قيمة المخزون الافتتاحي يجب أن تكون أكبر من صفر';
  END IF;

  -- متوسط مرجح على الرصيد الموجب الحالي
  v_old_stock := greatest(COALESCE(v_variant.stock, 0), 0);
  v_old_cost := COALESCE(NULLIF(v_variant.average_cost, 0), NULLIF(v_variant.purchase_price, 0), p_unit_cost);
  v_new_stock := round(COALESCE(v_variant.stock, 0) + p_quantity, 2);
  v_new_cost := CASE
    WHEN v_old_stock <= 0 THEN p_unit_cost
    ELSE round((v_old_stock * v_old_cost + p_quantity * p_unit_cost) / (v_old_stock + p_quantity), 2)
  END;

  v_entry_number := 'JE-OPENINV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  UPDATE public.product_variants
  SET "stockQuantity" = v_new_stock,
      "averageCost" = v_new_cost,
      "purchasePrice" = CASE WHEN COALESCE("purchasePrice", 0) = 0 THEN p_unit_cost ELSE "purchasePrice" END,
      "updatedAt" = v_now
  WHERE id = v_variant.id;

  INSERT INTO public.inventory_movements (
    movement_type, quantity, unit_cost, unit_cost_usd, reference, notes,
    template_id, variant_id, created_by, created_at
  ) VALUES (
    'OPENING', p_quantity, p_unit_cost, p_unit_cost, v_entry_number,
    COALESCE(v_notes, 'رصيد افتتاحي'),
    v_variant.template_id, v_variant.id, p_user_id, v_now
  );

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference, created_at
  ) VALUES (
    v_entry_number, 'CAPITAL', v_total, 'USD', v_total,
    'مخزون افتتاحي: ' || v_variant.product_name || ' × ' || p_quantity || COALESCE(' — ' || v_notes, ''),
    'INVENTORY', 'CAPITAL', p_branch_id, p_user_id, v_entry_number, v_now
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'journal_entry_id', v_entry_id,
    'entry_number', v_entry_number,
    'variant_id', v_variant.id,
    'product_name', v_variant.product_name,
    'quantity', p_quantity,
    'unit_cost', p_unit_cost,
    'total_cost_usd', v_total,
    'stock_quantity', v_new_stock,
    'average_cost', v_new_cost
  );
END;
$$;

-- record_opening_cash — الأصل: 20261014_01_deposit_gifts_opening_payroll.sql
CREATE OR REPLACE FUNCTION public.record_opening_cash(
  p_branch_id uuid,
  p_user_id uuid,
  p_account text,
  p_currency text,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_rate numeric(14,4);
  v_amount_usd numeric(14,2);
  v_entry_id uuid;
  v_entry_number text;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
BEGIN
  SELECT id, role, "branchId" AS branch_id, "isActive" AS is_active INTO v_user
  FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, false) THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;
  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;
  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك أو المدير فقط';
  END IF;

  IF public.is_system_lock_on('opening_balances_locked') THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية مقفلة. افتح القفل من الإعدادات (للمالك فقط) إن احتجت لتسجيل أرصدة جديدة';
  END IF;

  IF p_account IS NULL OR p_account NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'الحساب يجب أن يكون الخزينة أو البنك';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('SDG', 'USD') THEN
    RAISE EXCEPTION 'العملة غير صالحة';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  IF p_currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
    v_amount_usd := round(p_amount / v_rate, 2);
  ELSE
    v_rate := NULL;
    v_amount_usd := p_amount;
  END IF;

  v_entry_number := 'JE-OPENCASH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference
  ) VALUES (
    v_entry_number, 'CAPITAL', p_amount, p_currency, v_rate, v_amount_usd,
    'رصيد افتتاحي — ' || CASE WHEN p_account = 'CASH' THEN 'الخزينة' ELSE 'البنك' END
      || ' (' || CASE WHEN p_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END || ')'
      || COALESCE(' — ' || v_notes, ''),
    p_account, 'CAPITAL', p_branch_id, p_user_id, 'OPENING-BALANCE'
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'journal_entry_id', v_entry_id,
    'entry_number', v_entry_number,
    'account', p_account,
    'currency', p_currency,
    'amount', p_amount,
    'amount_usd', v_amount_usd
  );
END;
$$;

-- record_opening_balances — الأصل: 20261015_01_opening_repeatable_payroll_list.sql
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

  IF public.is_system_lock_on('opening_balances_locked') THEN
    RAISE EXCEPTION 'الأرصدة الافتتاحية مقفلة. افتح القفل من الإعدادات (للمالك فقط) إن احتجت لتسجيل أرصدة جديدة';
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

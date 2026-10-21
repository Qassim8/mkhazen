-- =====================================================================
-- 20261020_01_manual_and_opening_stock_corrections.sql
--
-- "تعديل" القيود اليدوية والمخزون الافتتاحي، بدون كسر قاعدة "لا تُعدَّل ولا
-- تُحذف قيود قديمة أبدًا" — القيد الأصلي يبقى كما هو للأبد:
--
--   • القيد اليدوي (رأس مال / مصروف / إيراد آخر): التصحيح = قيد عكسي يلغي
--     الأصل رياضيًا بالضبط (نفس العملة وسعر الصرف والقيمة بالدولار) + قيد
--     جديد بالقيمة الصحيحة. كلاهما يشير إلى الأصل عبر correction_of_id
--     للتتبع فقط، وبدون أي UPDATE/DELETE على الصف القديم.
--
--   • المخزون الافتتاحي: التصحيح متاح فقط إذا لم تحدث أي حركة أخرى على
--     الصنف منذ تسجيله (حركة واحدة فقط من نوع OPENING_STOCK). الفرق يُسجَّل
--     كحركة ADJUSTMENT_IN/OUT + قيد تعديلي جديد بفرق القيمة فقط (قد يكون
--     صفرًا)، مع تحديث الكمية/متوسط التكلفة في product_variants.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.
-- =====================================================================

BEGIN;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS correction_of_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_correction_reversal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_journal_entries_correction_of_id
  ON public.journal_entries (correction_of_id)
  WHERE correction_of_id IS NOT NULL;

-- =====================================================================
-- correct_manual_journal_entry
-- =====================================================================
CREATE OR REPLACE FUNCTION public.correct_manual_journal_entry(
  p_branch_id uuid,
  p_user_id uuid,
  p_entry_id uuid,
  p_new_amount numeric,
  p_new_currency text,
  p_new_payment_method text,
  p_new_account text,
  p_new_description text,
  p_new_reference text,
  p_notes text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user       record;
  v_original   record;
  v_reversal_id     uuid;
  v_new_id          uuid;
  v_reversal_number text;
  v_new_number      text;
  v_debit  text;
  v_credit text;
  v_balance numeric;
  v_notes text;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'معرف الفرع مطلوب';
  END IF;

  SELECT id, role INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تصحيح القيود متاح للمالك أو المدير فقط';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');

  SELECT * INTO v_original
  FROM public.journal_entries
  WHERE id = p_entry_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'القيد غير موجود';
  END IF;

  IF v_original.is_correction_reversal THEN
    RAISE EXCEPTION 'لا يمكن تصحيح قيد عكسي';
  END IF;

  IF v_original.entry_type NOT IN ('CAPITAL', 'EXPENSE', 'OTHER') THEN
    RAISE EXCEPTION 'تصحيح القيود متاح فقط للقيود اليدوية (رأس مال / مصروف / إيراد آخر)';
  END IF;

  IF p_new_amount IS NULL OR p_new_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
  END IF;

  IF p_new_currency IS NULL OR p_new_currency NOT IN ('USD', 'SDG') THEN
    RAISE EXCEPTION 'العملة غير صالحة';
  END IF;

  IF trim(COALESCE(p_new_description, '')) = '' THEN
    RAISE EXCEPTION 'البيان مطلوب';
  END IF;

  /* =====================================================
     1) القيد العكسي: نفس قيمة الأصل بالضبط (مقلوب مدين/دائن)،
        وبنفس العملة/سعر الصرف/القيمة بالدولار حرفيًا من الأصل
        حتى يُلغيه رياضيًا حتى لو تغيّر سعر الصرف لاحقًا
  ===================================================== */
  v_reversal_number := 'JE-FIX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, branch_id, entry_type, amount, description, reference,
    debit_account, credit_account, created_by, created_at,
    currency, exchange_rate_used, amount_usd,
    correction_of_id, is_correction_reversal
  ) VALUES (
    v_reversal_number, p_branch_id, v_original.entry_type, v_original.amount,
    'عكس تصحيحي للقيد ' || v_original.entry_number || COALESCE(' — ' || v_notes, ''),
    v_original.reference,
    v_original.credit_account, v_original.debit_account, p_user_id, now(),
    v_original.currency, v_original.exchange_rate_used, v_original.amount_usd,
    v_original.id, true
  )
  RETURNING id INTO v_reversal_id;

  /* =====================================================
     2) الحسابان المدين/الدائن الجديدان — نفس منطق
        /api/accounting/manual بالضبط
  ===================================================== */
  IF v_original.entry_type = 'CAPITAL' THEN
    IF p_new_payment_method NOT IN ('CASH', 'BANK') THEN
      RAISE EXCEPTION 'يجب تحديد البنك أو الخزينة';
    END IF;

    v_debit  := CASE WHEN p_new_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;
    v_credit := 'CAPITAL';

  ELSIF v_original.entry_type = 'EXPENSE' THEN
    IF p_new_payment_method NOT IN ('CASH', 'BANK') THEN
      RAISE EXCEPTION 'يجب تحديد طريقة الدفع';
    END IF;

    IF p_new_account IS NULL OR p_new_account = 'SALARIES' THEN
      RAISE EXCEPTION 'الرواتب والسلف تُصرف من صفحة الموظفين، ونوع المصروف مطلوب';
    END IF;

    IF p_new_account NOT IN ('UTILITIES', 'RENTS', 'MAINTENANCE', 'OTHER_EXPENSE') THEN
      RAISE EXCEPTION 'حساب المصروف غير صالح';
    END IF;

    v_debit  := p_new_account;
    v_credit := CASE WHEN p_new_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

    -- فحص الرصيد بعد تطبيق العكس أعلاه (الذي أعاد رصيد الحساب لحالته قبل الخطأ)
    v_balance := public.get_account_balance(p_branch_id, v_credit, p_new_currency);
    IF p_new_amount > v_balance THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ في الحساب (المتاح %)', v_balance;
    END IF;

  ELSE -- OTHER
    IF p_new_payment_method NOT IN ('CASH', 'BANK') THEN
      RAISE EXCEPTION 'يجب تحديد طريقة استلام الإيراد';
    END IF;

    v_debit  := CASE WHEN p_new_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;
    v_credit := 'OTHER_INCOME';
  END IF;

  /* =====================================================
     3) القيد الجديد بالقيمة الصحيحة — عملته وسعر صرفه يُحتسبان
        تلقائيًا بنفس الـ trigger تمامًا كقيد يدوي جديد
  ===================================================== */
  v_new_number := 'JE-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, branch_id, entry_type, amount, description, reference,
    debit_account, credit_account, created_by, created_at,
    currency,
    correction_of_id, is_correction_reversal
  ) VALUES (
    v_new_number, p_branch_id, v_original.entry_type, p_new_amount,
    p_new_description, p_new_reference,
    v_debit, v_credit, p_user_id, now(),
    p_new_currency,
    v_original.id, false
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'reversal_entry_id',     v_reversal_id,
    'reversal_entry_number', v_reversal_number,
    'new_entry_id',          v_new_id,
    'new_entry_number',      v_new_number
  );
END;
$$;

ALTER FUNCTION public.correct_manual_journal_entry(
  uuid, uuid, uuid, numeric, text, text, text, text, text, text
) OWNER TO postgres;

-- =====================================================================
-- correct_opening_stock_entry
-- =====================================================================
CREATE OR REPLACE FUNCTION public.correct_opening_stock_entry(
  p_branch_id uuid,
  p_user_id uuid,
  p_variant_id uuid,
  p_new_quantity numeric,
  p_new_unit_cost numeric,
  p_notes text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user             record;
  v_variant          record;
  v_opening_movement record;
  v_movement_count   integer;
  v_old_qty          numeric(20,2);
  v_old_unit_cost    numeric(20,6);
  v_old_value        numeric(20,2);
  v_new_value        numeric(20,2);
  v_delta_qty        numeric(20,2);
  v_delta_value      numeric(20,2);
  v_entry_number     text;
  v_journal_id       uuid;
  v_movement_id      uuid;
  v_correction_of    uuid;
  v_notes            text;
  v_now              timestamptz := now();
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'معرف الفرع مطلوب';
  END IF;

  SELECT id, role INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تصحيح المخزون الافتتاحي متاح للمالك أو المدير فقط';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');

  SELECT v.id, v."templateId", v."stockQuantity", v."averageCost", v."purchasePrice",
         pt.name AS product_name
  INTO v_variant
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  WHERE v.id = p_variant_id
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;

  SELECT count(*) INTO v_movement_count
  FROM public.inventory_movements m
  WHERE m.variant_id = p_variant_id;

  IF v_movement_count <> 1 THEN
    RAISE EXCEPTION 'لا يمكن تصحيح الكمية الافتتاحية؛ توجد حركات أخرى على هذا الصنف، استخدم تسوية المخزون';
  END IF;

  SELECT * INTO v_opening_movement
  FROM public.inventory_movements m
  WHERE m.variant_id = p_variant_id
  LIMIT 1
  FOR UPDATE;

  IF v_opening_movement.movement_type <> 'OPENING_STOCK' THEN
    RAISE EXCEPTION 'لا يمكن تصحيح الكمية الافتتاحية؛ الحركة الوحيدة على هذا الصنف ليست مخزونًا افتتاحيًا';
  END IF;

  v_old_qty       := v_opening_movement.quantity;
  v_old_unit_cost := v_opening_movement.unit_cost;
  v_old_value     := round(v_old_qty * v_old_unit_cost, 2);

  IF p_new_quantity IS NULL OR p_new_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
  END IF;

  IF p_new_unit_cost IS NULL OR p_new_unit_cost <= 0 THEN
    RAISE EXCEPTION 'تكلفة الوحدة يجب أن تكون أكبر من صفر';
  END IF;

  IF p_new_quantity = v_old_qty AND p_new_unit_cost = v_old_unit_cost THEN
    RAISE EXCEPTION 'لا يوجد تغيير لحفظه';
  END IF;

  v_new_value   := round(p_new_quantity * p_new_unit_cost, 2);
  v_delta_qty   := p_new_quantity - v_old_qty;
  v_delta_value := v_new_value - v_old_value;

  v_entry_number := 'JE-FIX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  SELECT id INTO v_correction_of
  FROM public.journal_entries
  WHERE entry_number = v_opening_movement.reference AND branch_id = p_branch_id
  LIMIT 1;

  /* --- تحديث رصيد الصنف ومتوسط تكلفته --- */
  UPDATE public.product_variants
  SET "stockQuantity" = p_new_quantity,
      "averageCost"   = p_new_unit_cost,
      "purchasePrice" = CASE
                           WHEN COALESCE("purchasePrice", 0) = v_old_unit_cost THEN p_new_unit_cost
                           ELSE "purchasePrice"
                         END,
      "updatedAt"     = v_now
  WHERE id = p_variant_id;

  /* --- حركة مخزون توثّق فرق الكمية فقط (فرق صفري لا يحتاج حركة) --- */
  IF v_delta_qty > 0 THEN
    INSERT INTO public.inventory_movements (
      movement_type, quantity, unit_cost, reference, notes,
      template_id, variant_id, created_by, created_at
    ) VALUES (
      'ADJUSTMENT_IN', v_delta_qty, p_new_unit_cost, v_entry_number,
      'تصحيح كمية مخزون افتتاحي' || COALESCE(' — ' || v_notes, ''),
      v_variant."templateId", p_variant_id, p_user_id, v_now
    ) RETURNING id INTO v_movement_id;
  ELSIF v_delta_qty < 0 THEN
    INSERT INTO public.inventory_movements (
      movement_type, quantity, unit_cost, reference, notes,
      template_id, variant_id, created_by, created_at
    ) VALUES (
      'ADJUSTMENT_OUT', abs(v_delta_qty), v_old_unit_cost, v_entry_number,
      'تصحيح كمية مخزون افتتاحي' || COALESCE(' — ' || v_notes, ''),
      v_variant."templateId", p_variant_id, p_user_id, v_now
    ) RETURNING id INTO v_movement_id;
  END IF;

  /* --- قيد تعديلي بفرق القيمة فقط (قد يكون صفرًا) --- */
  IF v_delta_value > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, branch_id, entry_type, amount, description, reference,
      debit_account, credit_account, created_by, created_at,
      currency, correction_of_id
    ) VALUES (
      v_entry_number, p_branch_id, 'CAPITAL', v_delta_value,
      'تصحيح قيمة المخزون الافتتاحي: ' || v_variant.product_name || COALESCE(' — ' || v_notes, ''),
      v_opening_movement.reference, 'INVENTORY', 'CAPITAL', p_user_id, v_now,
      'USD', v_correction_of
    ) RETURNING id INTO v_journal_id;
  ELSIF v_delta_value < 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, branch_id, entry_type, amount, description, reference,
      debit_account, credit_account, created_by, created_at,
      currency, correction_of_id
    ) VALUES (
      v_entry_number, p_branch_id, 'CAPITAL', abs(v_delta_value),
      'تصحيح قيمة المخزون الافتتاحي: ' || v_variant.product_name || COALESCE(' — ' || v_notes, ''),
      v_opening_movement.reference, 'CAPITAL', 'INVENTORY', p_user_id, v_now,
      'USD', v_correction_of
    ) RETURNING id INTO v_journal_id;
  END IF;

  RETURN jsonb_build_object(
    'variant_id',      p_variant_id,
    'old_quantity',    v_old_qty,
    'new_quantity',    p_new_quantity,
    'old_unit_cost',   v_old_unit_cost,
    'new_unit_cost',   p_new_unit_cost,
    'delta_value_usd', v_delta_value,
    'movement_id',     v_movement_id,
    'journal_entry_id', v_journal_id,
    'entry_number',    v_entry_number
  );
END;
$$;

ALTER FUNCTION public.correct_opening_stock_entry(
  uuid, uuid, uuid, numeric, numeric, text
) OWNER TO postgres;

-- =====================================================================
-- list_opening_stock_corrections — الأصناف المؤهلة لتصحيح كميتها
-- الافتتاحية (حركة واحدة فقط من نوع OPENING_STOCK ولا شيء غيرها)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_opening_stock_corrections()
RETURNS TABLE(
  variant_id uuid, template_id uuid, product_name text, sku text, barcode text,
  color_name text, size text, selling_unit text,
  quantity numeric, unit_cost numeric,
  movement_id uuid, movement_created_at timestamptz, reference text
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT
    v.id, v."templateId", pt.name, v.sku, v.barcode, v."colorName", v.size, pt."sellingUnit",
    m.quantity, m.unit_cost, m.id, m.created_at, m.reference
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  JOIN public.inventory_movements m ON m.variant_id = v.id
  WHERE m.movement_type = 'OPENING_STOCK'
    AND COALESCE(v."isActive", true) = true
    AND (SELECT count(*) FROM public.inventory_movements m2 WHERE m2.variant_id = v.id) = 1
  ORDER BY pt.name, v.sku;
$$;

ALTER FUNCTION public.list_opening_stock_corrections() OWNER TO postgres;

COMMIT;

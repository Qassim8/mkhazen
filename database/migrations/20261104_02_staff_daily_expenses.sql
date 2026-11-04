/* =====================================================================
   نوع مصروف جديد: STAFF_DAILY_EXPENSES — "مصروفات الموظفين اليومية (وجبات ومواصلات)"

   لا يوجد CHECK على أسماء الحسابات في journal_entries (فقط على entry_type)، فالحساب الجديد
   لا يحتاج تغيير جداول. القوائم المسموحة موجودة داخل دالتين فقط، وأُعيد إصدارهما كما هما تمامًا
   مع إضافة الحساب الجديد للقائمة:
     • record_expense_with_payable   (تسجيل المصروف، وهو يشمل المصروف المجزأ)  ← 20261028_01
     • correct_manual_journal_entry  (تصحيح القيد اليدوي: عكس + قيد جديد)       ← 20261020_01
   لا تغيير على أي شيء آخر. القيود القديمة لا تُمس.

   شغّله على staging ثم production بعد النسخ الاحتياطي. آمن لإعادة التشغيل.
   ===================================================================== */

-- correct_manual_journal_entry — الأصل: 20261020_01_manual_and_opening_stock_corrections.sql
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

    IF p_new_account NOT IN ('STAFF_DAILY_EXPENSES', 'UTILITIES', 'RENTS', 'MAINTENANCE', 'OTHER_EXPENSE') THEN
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

-- record_expense_with_payable — الأصل: 20261028_01_split_payments_payables.sql
CREATE OR REPLACE FUNCTION public.record_expense_with_payable(
  p_branch_id      uuid,
  p_created_by     uuid,
  p_account        text,
  p_amount         numeric,
  p_currency       text,
  p_payment_method text,
  p_owner_paid     numeric,
  p_paid_now       numeric,
  p_remaining      numeric,
  p_due_date       date,
  p_description    text,
  p_reference      text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user       record;
  v_owner      numeric(14,2) := COALESCE(p_owner_paid, 0);
  v_now        numeric(14,2) := COALESCE(p_paid_now, 0);
  v_rem        numeric(14,2) := COALESCE(p_remaining, 0);
  v_rate       numeric(14,4);
  v_credit     text;
  v_balance    numeric(14,2);
  v_base       text;
  v_entry_id   uuid;
  v_first      uuid;
  v_recognition uuid;
  v_payable_id uuid;
  v_ids        uuid[] := '{}';
BEGIN
  IF p_branch_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'بيانات المصروف غير مكتملة';
  END IF;

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_created_by;

  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'تسجيل المصروفات متاح للكاشير أو المدير أو المالك فقط';
  END IF;

  -- الرواتب تُصرف من صفحة الموظفين؛ والإيجار لا يسجله الكاشير (مثل مسار المصروف الحالي)
  IF p_account IS NULL OR p_account NOT IN ('STAFF_DAILY_EXPENSES', 'UTILITIES', 'RENTS', 'MAINTENANCE', 'OTHER_EXPENSE') THEN
    RAISE EXCEPTION 'حساب المصروف غير صالح';
  END IF;

  IF p_account = 'RENTS' AND lower(v_user.role::text) = 'cashier' THEN
    RAISE EXCEPTION 'مصروف الإيجار لا يسجله الكاشير';
  END IF;

  IF p_currency IS NULL OR p_currency NOT IN ('USD', 'SDG') THEN
    RAISE EXCEPTION 'عملة المصروف غير صالحة';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'قيمة المصروف يجب أن تكون أكبر من صفر بمنزلتين عشريتين كحد أقصى';
  END IF;

  IF v_owner < 0 OR v_now < 0 OR v_rem < 0
     OR round(v_owner, 2) <> v_owner OR round(v_now, 2) <> v_now OR round(v_rem, 2) <> v_rem THEN
    RAISE EXCEPTION 'أجزاء الدفع يجب أن تكون أرقامًا موجبة بمنزلتين عشريتين كحد أقصى';
  END IF;

  IF round(v_owner + v_now + v_rem, 2) <> p_amount THEN
    RAISE EXCEPTION 'مجموع أجزاء الدفع (دفعه المالك + المدفوع الآن + المتبقي) يجب أن يساوي قيمة المصروف';
  END IF;

  IF NULLIF(btrim(COALESCE(p_description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'البيان مطلوب';
  END IF;

  IF v_now > 0 THEN
    IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
      RAISE EXCEPTION 'طريقة الدفع غير صالحة';
    END IF;

    v_credit := p_payment_method;
    v_balance := public.get_account_balance(p_branch_id, v_credit, p_currency);

    IF v_now > v_balance THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ في % (%). الرصيد الحالي: %',
        CASE WHEN v_credit = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
        CASE WHEN p_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END,
        v_balance;
    END IF;
  END IF;

  IF p_currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
  END IF;

  v_base := 'JE-' || to_char(now() AT TIME ZONE 'Africa/Khartoum', 'YYYY') || '-'
    || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  IF v_owner > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by, v_base || '-C', 'EXPENSE', v_owner,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_owner / v_rate ELSE v_owner END, 2),
      p_account, 'CAPITAL', p_reference, btrim(p_description) || ' — دفعه المالك من ماله'
    )
    RETURNING id INTO v_entry_id;

    v_ids := v_ids || v_entry_id;
    v_first := COALESCE(v_first, v_entry_id);
  END IF;

  IF v_now > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by, v_base || '-P', 'EXPENSE', v_now,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_now / v_rate ELSE v_now END, 2),
      p_account, v_credit, p_reference, btrim(p_description)
    )
    RETURNING id INTO v_entry_id;

    v_ids := v_ids || v_entry_id;
    v_first := COALESCE(v_first, v_entry_id);
  END IF;

  IF v_rem > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by, v_base || '-R', 'EXPENSE', v_rem,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_rem / v_rate ELSE v_rem END, 2),
      p_account, 'OTHER_PAYABLES', p_reference, btrim(p_description) || ' — مستحق على المحل'
    )
    RETURNING id INTO v_recognition;

    v_ids := v_ids || v_recognition;
    v_first := COALESCE(v_first, v_recognition);

    INSERT INTO public.payables (
      source_type, source_id, expense_account, description, currency, total_amount,
      owner_paid, paid_amount, remaining_amount, due_date, status, recognition_entry_id,
      branch_id, created_by
    ) VALUES (
      'EXPENSE', v_recognition, p_account, btrim(p_description), p_currency, p_amount,
      v_owner, v_now, v_rem, p_due_date, 'OPEN', v_recognition,
      p_branch_id, p_created_by
    )
    RETURNING id INTO v_payable_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_first,
    'entry_ids', to_jsonb(v_ids),
    'payable_id', v_payable_id
  );
END;
$$;

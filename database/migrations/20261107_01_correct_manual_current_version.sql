/* =====================================================================
   correct_manual_journal_entry: التصحيح يعمل على النسخة السارية، والعكس يعود لحساب دفعها

   المشكلة: تصحيح القيد نفسه أكثر من مرة كان يعكس القيد الأصلي في كل مرة (فيتراكم العكس
   ويختل رصيد الحسابات)، لأن القيد الأصلي يبقى ظاهرًا ومتاحًا للتصحيح بعد تصحيحه.

   التغيير (الدالة فقط، بنصها الأخير في 20261104_02 مع الإضافات التالية):
     • النسخة السارية: قبل أي عكس تُحدَّد آخر نسخة غير عكسية في سلسلة التصحيحات
       (correction_of_id) ويعمل التصحيح عليها، سواء مُرِّر القيد الأصلي أو أي نسخة منه.
     • العكس يقلب مدين/دائن النسخة السارية بنفس العملة وسعر الصرف و amount_usd، فيعود لنفس
       حساب الدفع (CASH أو BANK) الخاص بتلك النسخة، لا لحساب ثابت.
     • قفل استشاري على الفرع لمنع تصحيحين متزامنين لنفس القيد.
     • الرد يحوي reversed_entry_id (النسخة التي عُكست). لا تغيير في بقية الشروط والرسائل.

   لا تمس القيود القديمة. إصلاح القيود الخاطئة السابقة في ملفي
   20261107_02_fix_correction_chains_preview.sql و 20261107_03_fix_correction_chains_apply.sql.
   شغّله على staging ثم production بعد النسخ الاحتياطي. آمن لإعادة التشغيل.
   ===================================================================== */

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
  v_next       record;
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

  -- تصحيحان متزامنان في الفرع ينتظر أحدهما الآخر، فلا يُعكس القيد نفسه مرتين
  PERFORM pg_advisory_xact_lock(hashtext('manual-correction:' || p_branch_id::text));

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

  /* =====================================================
     النسخة السارية: لو القيد صُحح سابقًا (نسخة جديدة بعد عكس) فالتصحيح الجديد
     يعكس آخر نسخة غير عكسية في السلسلة وليس القيد الأصلي مرة أخرى.
     العكس والقيد الجديد يرتبطان بتلك النسخة عبر correction_of_id.
  ===================================================== */
  LOOP
    SELECT * INTO v_next
    FROM public.journal_entries
    WHERE correction_of_id = v_original.id
      AND NOT is_correction_reversal
      AND branch_id = p_branch_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    v_original := v_next;
  END LOOP;

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
     1) القيد العكسي: نفس قيمة النسخة السارية بالضبط (مقلوب مدين/دائن)،
        فيعود المبلغ لنفس حساب الدفع (CASH أو BANK) الذي خرج منه/دخل إليه
        ذلك القيد، وبنفس العملة/سعر الصرف/القيمة بالدولار حرفيًا
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
    'new_entry_number',      v_new_number,
    'reversed_entry_id',     v_original.id
  );
END;
$$;

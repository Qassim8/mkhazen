/* =====================================================================
   20261029_01 — الرواتب والسلف المرنة للموظفين (تعديل النظام الموجود)
   =====================================================================
   ما كان موجودًا (20261014_01 و 20261015_01):
   • employee_payments (user_id, period, type = ADVANCE | SALARY, amount, payment_method, journal_entry_id)
   • pay_employee: السلفة والراتب مربوطان بالراتب الشهري (المأخوذ لا يتجاوز الراتب، والراتب
     إلزامي)، وكل سلفة قيدها مصروف رواتب (مدين SALARIES / دائن CASH|BANK).
   • get_payroll: الراتب / السلف / المدفوع / المتبقي من الراتب.

   ما يفعله هذا الملف (على نفس الجدول والدالتين، بلا نظام موازٍ):
   1) السلفة: مبلغ مفتوح غير مرتبط بالراتب، وتُسترد. قيدها أصل لا مصروف:
        سلفة      : EMPLOYEE_ADVANCES / CASH|BANK  (مع فحص الرصيد)
        استرداد   : CASH|BANK / EMPLOYEE_ADVANCES  (لا يتجاوز رصيد السلف)
      رصيد سلف الموظف = السلف − المسترد − المخصوم من الرواتب.
      حساب EMPLOYEE_ADVANCES ("سلف الموظفين") جديد (أصل، لا يوجد CHECK على أسماء الحسابات).
      نوع قيد جديد EMPLOYEE_ADVANCE في journal_entries_entry_type_check.
   2) الراتب اختياري ودفعه حر: أي مبلغ في أي وقت (لا ربط بالراتب المسجل، وهو مجرد اقتراح):
        SALARIES / CASH|BANK  (مع فحص الرصيد)
      خيار "خصم من رصيد السلف" (p_deduct_advance، لا يتجاوز الرصيد ولا مبلغ الراتب):
        SALARIES / CASH|BANK  بالصافي   +   SALARIES / EMPLOYEE_ADVANCES  بالمخصوم
        (أي: SALARIES بالمبلغ الكامل)
   3) نسبة من الأرباح (عمولة): نوع COMMISSION: SALARIES / CASH|BANK بوصف يوضح أنها عمولة.
      لا تؤثر على رصيد السلف.
   4) فرق العملة: السلف بالجنيه. عند وصول رصيد سلف الموظف إلى صفر يُغلق ما تبقّى من رصيد
      EMPLOYEE_ADVANCES بالدولار لهذا الموظف على CURRENCY_EXCHANGE (نفس أسلوب settle_tailor_fx).
   5) get_payroll بأعمدة جديدة، و get_employee_advance_balance، و get_employee_advances_summary.

   السلف القديمة (ADVANCE قبل هذا الملف) كانت مصروف رواتب مدفوعًا مقدمًا، فتُعلَّم is_legacy
   ولا تدخل في رصيد السلف الجديد (لا قيد يُعدَّل). تظهر في السجل بلا رصيد.

   لا يمس نظام مستحقات وسلف الخياطين (TAILOR_ADVANCES / pay_tailor_dues).
   صلاحيات الدوال: المالك والمدير فقط كما كانت. قابل لإعادة التشغيل.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) نوع القيد EMPLOYEE_ADVANCE (آخر قائمة: 20261028_01)
--------------------------------------------------------------------- */

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_entry_type_check
  CHECK ((entry_type)::text = ANY (ARRAY[
    'CAPITAL', 'PURCHASE', 'PURCHASE_PAYMENT', 'SALE', 'SALE_PAYMENT',
    'CUSTOMER_ADVANCE', 'CUSTOMER_ADVANCE_REFUND',
    'TAILOR_ADVANCE', 'TAILOR_ADVANCE_APPLICATION', 'TAILOR_COST', 'TAILOR_PAYMENT',
    'TAILOR_DUES_PAYMENT', 'TAILOR_DUES_ADVANCE',
    'TAILORING_MATERIAL', 'PRODUCTION', 'COGS', 'EXPENSE', 'ASSET',
    'INVENTORY_ADJUSTMENT', 'SALES_RETURN', 'OTHER', 'CURRENCY_EXCHANGE', 'GIFT',
    'PAYABLE_PAYMENT', 'EMPLOYEE_ADVANCE'
  ]::text[]));

/* ---------------------------------------------------------------------
   2) employee_payments: أنواع جديدة وأعمدة
--------------------------------------------------------------------- */

-- الصفوف الموجودة وقت أول تشغيل = قديمة (true)؛ بعدها الافتراضي false
ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT true;
ALTER TABLE public.employee_payments ALTER COLUMN is_legacy SET DEFAULT false;

ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS deducted_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.employee_payments
  ADD COLUMN IF NOT EXISTS deduction_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.employee_payments
  ADD COLUMN IF NOT EXISTS fx_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.employee_payments DROP CONSTRAINT IF EXISTS employee_payments_type_check;
ALTER TABLE public.employee_payments ADD CONSTRAINT employee_payments_type_check
  CHECK (type = ANY (ARRAY['ADVANCE', 'ADVANCE_RETURN', 'SALARY', 'COMMISSION']));

ALTER TABLE public.employee_payments DROP CONSTRAINT IF EXISTS employee_payments_deduction_check;
ALTER TABLE public.employee_payments ADD CONSTRAINT employee_payments_deduction_check
  CHECK (deducted_amount >= 0 AND deducted_amount <= amount AND (deducted_amount = 0 OR type = 'SALARY'));

COMMENT ON COLUMN public.employee_payments.is_legacy IS 'سلفة/دفعة قبل نظام السلف المرن: قيدها مصروف رواتب ولا تدخل في رصيد السلف';
COMMENT ON COLUMN public.employee_payments.deducted_amount IS 'الجزء المخصوم من رصيد سلف الموظف عند صرف راتب (amount = الراتب الكامل)';

/* ---------------------------------------------------------------------
   3) أرصدة السلف
--------------------------------------------------------------------- */

-- رصيد السلف بالجنيه = السلف − المسترد − المخصوم
CREATE OR REPLACE FUNCTION public.get_employee_advance_balance(p_employee_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(sum(
    CASE ep.type
      WHEN 'ADVANCE' THEN ep.amount
      WHEN 'ADVANCE_RETURN' THEN -ep.amount
      WHEN 'SALARY' THEN -ep.deducted_amount
      ELSE 0
    END
  ), 0), 2)
  FROM public.employee_payments ep
  WHERE ep.user_id = p_employee_id AND NOT ep.is_legacy;
$$;

-- رصيد EMPLOYEE_ADVANCES الدفتري بالدولار لهذا الموظف (من قيود دفعاته فقط)
CREATE OR REPLACE FUNCTION public.get_employee_advance_usd_balance(p_employee_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(sum(
    CASE
      WHEN je.debit_account = 'EMPLOYEE_ADVANCES' THEN je.amount_usd
      WHEN je.credit_account = 'EMPLOYEE_ADVANCES' THEN -je.amount_usd
      ELSE 0
    END
  ), 0), 2)
  FROM public.journal_entries je
  WHERE je.id IN (
    SELECT unnest(ARRAY[ep.journal_entry_id, ep.deduction_entry_id, ep.fx_entry_id])
    FROM public.employee_payments ep
    WHERE ep.user_id = p_employee_id AND NOT ep.is_legacy
  );
$$;

/* ---------------------------------------------------------------------
   4) pay_employee — سلفة / استرداد / راتب (مع خصم اختياري) / عمولة
--------------------------------------------------------------------- */

DROP FUNCTION IF EXISTS public.pay_employee(uuid, uuid, uuid, date, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.pay_employee(
  p_branch_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_period date,
  p_type text,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_deduct_advance numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_employee record;
  v_this_month date := date_trunc('month', now() AT TIME ZONE 'Africa/Khartoum')::date;
  v_period date;
  v_deduct numeric(14,2) := COALESCE(p_deduct_advance, 0);
  v_net numeric(14,2);
  v_advance_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_balance numeric(14,2);
  v_rate numeric(14,4);
  v_entry_id uuid;
  v_deduction_entry_id uuid;
  v_fx_entry_id uuid;
  v_payment_id uuid;
  v_reference text;
  v_prefix text;
  v_label text;
  v_usd_balance numeric(14,2);
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
    RAISE EXCEPTION 'صرف الرواتب والسلف متاح للمالك أو المدير فقط';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('ADVANCE', 'ADVANCE_RETURN', 'SALARY', 'COMMISSION') THEN
    RAISE EXCEPTION 'نوع الدفعة غير صالح';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'المبلغ غير صالح';
  END IF;
  IF v_deduct < 0 OR round(v_deduct, 2) <> v_deduct THEN
    RAISE EXCEPTION 'مبلغ الخصم من السلف غير صالح';
  END IF;
  IF v_deduct > 0 AND p_type <> 'SALARY' THEN
    RAISE EXCEPTION 'الخصم من رصيد السلف متاح عند صرف الراتب فقط';
  END IF;
  IF v_deduct > p_amount THEN
    RAISE EXCEPTION 'المخصوم من السلف يتجاوز مبلغ الراتب';
  END IF;

  -- السلفة والاسترداد يُسجَّلان في شهر العملية؛ الراتب والعمولة لشهر الفترة المختارة (غير مستقبلي)
  IF p_type IN ('ADVANCE', 'ADVANCE_RETURN') THEN
    v_period := v_this_month;
  ELSE
    v_period := date_trunc('month', p_period)::date;
    IF v_period IS NULL OR v_period > v_this_month THEN
      RAISE EXCEPTION 'لا يمكن الصرف لشهر مستقبلي';
    END IF;
  END IF;

  SELECT id, name, role, "branchId" AS branch_id INTO v_employee
  FROM public.users WHERE id = p_employee_id;
  IF NOT FOUND OR v_employee.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا الفرع';
  END IF;
  IF lower(COALESCE(v_employee.role::text, '')) = 'tailor' THEN
    RAISE EXCEPTION 'الخياطين يُصرف لهم من مستحقات الخياطين وليس من الرواتب';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('employee-advance-' || p_employee_id::text));

  v_advance_balance := public.get_employee_advance_balance(p_employee_id);
  v_net := round(p_amount - v_deduct, 2);

  IF p_type = 'ADVANCE_RETURN' AND p_amount > v_advance_balance THEN
    RAISE EXCEPTION 'الاسترداد يتجاوز رصيد سلف الموظف (% ج.س)', v_advance_balance;
  END IF;
  IF v_deduct > v_advance_balance THEN
    RAISE EXCEPTION 'الخصم يتجاوز رصيد سلف الموظف (% ج.س)', v_advance_balance;
  END IF;

  -- الخارج من الخزينة/البنك: السلفة كاملة، الراتب بالصافي، العمولة كاملة (الاسترداد داخل)
  IF p_type <> 'ADVANCE_RETURN' AND (CASE WHEN p_type = 'SALARY' THEN v_net ELSE p_amount END) > 0 THEN
    v_balance := public.get_account_balance(p_branch_id, p_payment_method, 'SDG');
    IF (CASE WHEN p_type = 'SALARY' THEN v_net ELSE p_amount END) > v_balance THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
        CASE WHEN p_payment_method = 'CASH' THEN 'الخزينة' ELSE 'البنك' END, v_balance;
    END IF;
  END IF;

  v_rate := public.require_exchange_rate(p_branch_id);
  v_prefix := CASE p_type WHEN 'ADVANCE' THEN 'ADV' WHEN 'ADVANCE_RETURN' THEN 'ADR' WHEN 'COMMISSION' THEN 'COM' ELSE 'SAL' END;
  v_reference := v_prefix || '-' || to_char(v_period, 'YYYYMM') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_label := v_employee.name || ' — ' || to_char(v_period, 'YYYY-MM') || COALESCE(' - ' || v_notes, '');

  IF p_type = 'ADVANCE' THEN
    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
      description, debit_account, credit_account, branch_id, created_by, reference
    ) VALUES (
      'JE-' || v_reference, 'EMPLOYEE_ADVANCE', p_amount, 'SDG', v_rate, round(p_amount / v_rate, 2),
      'سلفة موظف — ' || v_label, 'EMPLOYEE_ADVANCES', p_payment_method, p_branch_id, p_user_id, v_reference
    )
    RETURNING id INTO v_entry_id;

  ELSIF p_type = 'ADVANCE_RETURN' THEN
    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
      description, debit_account, credit_account, branch_id, created_by, reference
    ) VALUES (
      'JE-' || v_reference, 'EMPLOYEE_ADVANCE', p_amount, 'SDG', v_rate, round(p_amount / v_rate, 2),
      'استرداد سلفة موظف — ' || v_label, p_payment_method, 'EMPLOYEE_ADVANCES', p_branch_id, p_user_id, v_reference
    )
    RETURNING id INTO v_entry_id;

  ELSIF p_type = 'COMMISSION' THEN
    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
      description, debit_account, credit_account, branch_id, created_by, reference
    ) VALUES (
      'JE-' || v_reference, 'EXPENSE', p_amount, 'SDG', v_rate, round(p_amount / v_rate, 2),
      'عمولة (نسبة من الأرباح) — ' || v_label, 'SALARIES', p_payment_method, p_branch_id, p_user_id, v_reference
    )
    RETURNING id INTO v_entry_id;

  ELSE
    -- راتب: الصافي من الخزينة/البنك، والمخصوم من رصيد السلف؛ SALARIES بالمبلغ الكامل
    IF v_net > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
        description, debit_account, credit_account, branch_id, created_by, reference
      ) VALUES (
        'JE-' || v_reference, 'EXPENSE', v_net, 'SDG', v_rate, round(v_net / v_rate, 2),
        'صرف راتب — ' || v_label, 'SALARIES', p_payment_method, p_branch_id, p_user_id, v_reference
      )
      RETURNING id INTO v_entry_id;
    END IF;

    IF v_deduct > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
        description, debit_account, credit_account, branch_id, created_by, reference
      ) VALUES (
        'JE-' || v_reference || '-D', 'EXPENSE', v_deduct, 'SDG', v_rate, round(v_deduct / v_rate, 2),
        'خصم من رصيد السلف عند صرف الراتب — ' || v_label, 'SALARIES', 'EMPLOYEE_ADVANCES',
        p_branch_id, p_user_id, v_reference
      )
      RETURNING id INTO v_deduction_entry_id;

      v_entry_id := COALESCE(v_entry_id, v_deduction_entry_id);
    END IF;
  END IF;

  INSERT INTO public.employee_payments (
    branch_id, user_id, period, type, amount, payment_method,
    journal_entry_id, deducted_amount, deduction_entry_id, notes, created_by
  ) VALUES (
    p_branch_id, p_employee_id, v_period, p_type, p_amount, p_payment_method,
    v_entry_id, v_deduct, v_deduction_entry_id, v_notes, p_user_id
  )
  RETURNING id INTO v_payment_id;

  v_new_balance := public.get_employee_advance_balance(p_employee_id);

  -- رصيد السلف صار صفرًا بعد استرداد/خصم: نغلق ما تبقّى من فرق الدولار على CURRENCY_EXCHANGE
  IF v_new_balance = 0 AND (p_type = 'ADVANCE_RETURN' OR v_deduct > 0) THEN
    v_usd_balance := public.get_employee_advance_usd_balance(p_employee_id);

    IF abs(v_usd_balance) >= 0.01 THEN
      INSERT INTO public.journal_entries (
        entry_number, entry_type, amount, currency, amount_usd,
        description, debit_account, credit_account, branch_id, created_by, reference
      ) VALUES (
        'JE-' || v_reference || '-FX', 'CURRENCY_EXCHANGE', abs(v_usd_balance), 'USD', abs(v_usd_balance),
        CASE WHEN v_usd_balance > 0 THEN 'خسارة فرق صرف على سلف الموظف — ' ELSE 'ربح فرق صرف على سلف الموظف — ' END
          || v_employee.name,
        CASE WHEN v_usd_balance > 0 THEN 'CURRENCY_EXCHANGE' ELSE 'EMPLOYEE_ADVANCES' END,
        CASE WHEN v_usd_balance > 0 THEN 'EMPLOYEE_ADVANCES' ELSE 'CURRENCY_EXCHANGE' END,
        p_branch_id, p_user_id, v_reference
      )
      RETURNING id INTO v_fx_entry_id;

      UPDATE public.employee_payments SET fx_entry_id = v_fx_entry_id WHERE id = v_payment_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'journal_entry_id', v_entry_id,
    'deduction_entry_id', v_deduction_entry_id,
    'fx_entry_id', v_fx_entry_id,
    'reference', v_reference,
    'employee_id', p_employee_id,
    'period', v_period,
    'type', p_type,
    'amount', p_amount,
    'deducted', v_deduct,
    'net', CASE WHEN p_type = 'SALARY' THEN v_net ELSE p_amount END,
    'advance_balance', v_new_balance
  );
END;
$$;

/* ---------------------------------------------------------------------
   5) get_payroll — الموظفون (عدا الخياطين والمالك) وحركات الشهر ورصيد السلف
--------------------------------------------------------------------- */

DROP FUNCTION IF EXISTS public.get_payroll(uuid, date);

CREATE OR REPLACE FUNCTION public.get_payroll(p_branch_id uuid, p_period date)
RETURNS TABLE (
  user_id uuid,
  name text,
  role text,
  "position" text,
  is_active boolean,
  salary_sdg numeric,
  advance_balance_sdg numeric,
  advances_month_sdg numeric,
  returned_month_sdg numeric,
  deducted_month_sdg numeric,
  salary_paid_sdg numeric,
  commission_paid_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH params AS (SELECT date_trunc('month', p_period)::date AS period),
  paid AS (
    SELECT ep.user_id,
           sum(ep.amount) FILTER (WHERE ep.type = 'ADVANCE') AS advances,
           sum(ep.amount) FILTER (WHERE ep.type = 'ADVANCE_RETURN') AS returned,
           sum(ep.deducted_amount) FILTER (WHERE ep.type = 'SALARY') AS deducted,
           sum(ep.amount) FILTER (WHERE ep.type = 'SALARY') AS salaries,
           sum(ep.amount) FILTER (WHERE ep.type = 'COMMISSION') AS commissions
    FROM public.employee_payments ep, params
    WHERE ep.branch_id = p_branch_id AND ep.period = params.period
    GROUP BY ep.user_id
  ), balances AS (
    SELECT u.id AS user_id, public.get_employee_advance_balance(u.id) AS balance
    FROM public.users u
    WHERE u."branchId" = p_branch_id
  )
  SELECT u.id, u.name::text, lower(u.role::text), u.position::text, u."isActive",
         round(COALESCE(u.salary, 0)::numeric, 2),
         b.balance,
         round(COALESCE(p.advances, 0), 2),
         round(COALESCE(p.returned, 0), 2),
         round(COALESCE(p.deducted, 0), 2),
         round(COALESCE(p.salaries, 0), 2),
         round(COALESCE(p.commissions, 0), 2)
  FROM public.users u
  JOIN balances b ON b.user_id = u.id
  LEFT JOIN paid p ON p.user_id = u.id
  WHERE u."branchId" = p_branch_id
    AND lower(u.role::text) NOT IN ('tailor', 'owner')
    AND (u."isActive" OR p.user_id IS NOT NULL OR b.balance <> 0)
  ORDER BY u."isActive" DESC, u.name;
$$;

/* ---------------------------------------------------------------------
   6) get_employee_advances_summary — بطاقة "سلف الموظفين"
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_employee_advances_summary(p_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH balances AS (
    SELECT u.id, public.get_employee_advance_balance(u.id) AS balance
    FROM public.users u
    WHERE u."branchId" = p_branch_id AND lower(u.role::text) <> 'tailor'
  )
  SELECT jsonb_build_object(
    'total_balance_sdg', COALESCE((SELECT sum(balance) FROM balances WHERE balance > 0), 0),
    'employees_count', COALESCE((SELECT count(*) FROM balances WHERE balance > 0), 0),
    -- رصيد حساب EMPLOYEE_ADVANCES الدفتري بالدولار
    'book_usd', (
      SELECT round(COALESCE(sum(
        CASE
          WHEN je.debit_account = 'EMPLOYEE_ADVANCES' THEN je.amount_usd
          WHEN je.credit_account = 'EMPLOYEE_ADVANCES' THEN -je.amount_usd
          ELSE 0
        END
      ), 0), 2)
      FROM public.journal_entries je
      WHERE je.branch_id = p_branch_id
        AND (je.debit_account = 'EMPLOYEE_ADVANCES' OR je.credit_account = 'EMPLOYEE_ADVANCES')
    )
  );
$$;

/* ---------------------------------------------------------------------
   7) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_employee_advance_balance(uuid)',
    'public.get_employee_advance_usd_balance(uuid)',
    'public.pay_employee(uuid, uuid, uuid, date, text, numeric, text, text, numeric)',
    'public.get_payroll(uuid, date)',
    'public.get_employee_advances_summary(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

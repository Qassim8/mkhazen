/* =====================================================================
   20261031_01 — فصل سلف الخياط عن مستحقاته (نفس منطق سلف الموظفين)
   =====================================================================
   ما كان موجودًا:
   • pay_tailor_dues (20261013_01): السداد الكامل فقط، و"السلفة" = سداد جزئي من المستحقات
     (TAILORS_PAYABLE / CASH|BANK، قيد TAILOR_DUES_ADVANCE) لا تتجاوز المتبقي — أي هي
     نفسها خصم من المستحقات وليست سلفة مفتوحة.
   • حساب TAILOR_ADVANCES استُخدم فقط لدفعات مقدمة مربوطة بطلب لم تُثبت تكلفته
     (pay_tailor_payment: TAILOR_ADVANCES / CASH)، وتُخصم تلقائيًا من أجرة نفس الطلب عند التسليم
     (complete_tailoring_pickup: TAILORS_PAYABLE / TAILOR_ADVANCES بنوع TAILOR_ADVANCE_APPLICATION).
     التطبيق لا يستدعي pay_tailor_payment، فلا سلف جديدة من هذا المسار.

   ما يفعله هذا الملف (تعديل على pay_tailor_dues نفسها):
   1) kind = 'ADVANCE': سلفة مفتوحة غير مرتبطة بالمستحقات (لا تتطلب مستحقات ولا تُحدّ بها):
        TAILOR_ADVANCES / CASH|BANK  (مع فحص الرصيد، قيد TAILOR_ADVANCE).
   2) kind = 'ADVANCE_RETURN': استرداد نقدي مباشر: CASH|BANK / TAILOR_ADVANCES، لا يتجاوز الرصيد
        (قيد TAILOR_ADVANCE_RETURN).
   3) kind = 'SETTLEMENT': دفع المستحقات (كامل أو جزء، الافتراضي المتبقي كله) بلا أي خصم تلقائي.
      خيار p_deduct_advance (يحدده المستخدم، لا يتجاوز رصيد السلف ولا المبلغ):
        TAILORS_PAYABLE / TAILOR_ADVANCES بالمخصوم (قيد TAILOR_ADVANCE_DEDUCTION)
        TAILORS_PAYABLE / CASH|BANK بالصافي (قيد TAILOR_DUES_PAYMENT)
      موزَّعة على طلبات الخياط من الأقدم للأحدث كما كان، وكل قيد يحمل الطلب.
   4) رصيد السلف العام = السلف − المسترد نقدًا − المخصوم من المستحقات (جدول tailor_advance_movements).
      السلف المربوطة بطلبات لم تُسلَّم (القديمة) تظهر منفصلة (order_advances_sdg) وتبقى كما هي: تُخصم
      تلقائيًا من أجرة طلبها عند التسليم، ولا يشملها الاسترداد ولا الخصم اليدوي.
   5) فرق العملة:
      • settle_tailor_fx لـ TAILORS_PAYABLE كما هو، بتعديل واحد: حد TAILOR_ADVANCES فيه صار
        لقيدَي السلف المربوطة بالطلب فقط (TAILOR_ADVANCE و TAILOR_ADVANCE_APPLICATION)، وإلا فقيد
        الخصم (مدين TAILORS_PAYABLE / دائن TAILOR_ADVANCES الحامل لرقم الطلب) كان يُحتسب مرتين
        ويُنتج قيد فرق صرف خاطئًا.
      • عند وصول رصيد سلف الخياط بالجنيه إلى صفر (استرداد أو خصم) يُغلق ما تبقّى من رصيد
        TAILOR_ADVANCES بالدولار على CURRENCY_EXCHANGE.
   6) أنواع قيد جديدة: TAILOR_ADVANCE_RETURN و TAILOR_ADVANCE_DEDUCTION.
      لا يُعدَّل أي قيد قديم. الصلاحيات كما هي (المالك والمدير).

   قابل لإعادة التشغيل. تُطبَّق بعد 20261030_01.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) أنواع القيود (آخر قائمة: 20261029_01)
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
    'PAYABLE_PAYMENT', 'EMPLOYEE_ADVANCE',
    'TAILOR_ADVANCE_RETURN', 'TAILOR_ADVANCE_DEDUCTION'
  ]::text[]));

/* ---------------------------------------------------------------------
   2) حركات رصيد سلف الخياط العام
--------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tailor_advance_movements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  tailor_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  type               text NOT NULL CHECK (type IN ('ADVANCE', 'RETURN', 'DEDUCTION')),
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  -- السلفة والاسترداد: خزينة/بنك. الخصم من المستحقات: طريقة دفع الصافي المرافق (أو NULL)
  payment_method     text CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'BANK')),
  reference          text,
  -- قيود الحركة (قيد واحد للسلفة/الاسترداد، وقيد لكل طلب في الخصم)
  journal_entry_ids  uuid[] NOT NULL DEFAULT '{}',
  fx_entry_id        uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  notes              text,
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tailor_advance_movements_tailor
  ON public.tailor_advance_movements (tailor_id, created_at);

ALTER TABLE public.tailor_advance_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tailor_advance_movements FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tailor_advance_movements TO service_role;

COMMENT ON TABLE public.tailor_advance_movements IS 'سلف الخياط المفتوحة (غير المرتبطة بالمستحقات): سلفة / استرداد نقدي / خصم من المستحقات';

/* ---------------------------------------------------------------------
   3) الأرصدة
--------------------------------------------------------------------- */

-- رصيد السلف العام بالجنيه = السلف − المسترد نقدًا − المخصوم من المستحقات
CREATE OR REPLACE FUNCTION public.get_tailor_advance_balance(p_tailor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(sum(CASE m.type WHEN 'ADVANCE' THEN m.amount ELSE -m.amount END), 0), 2)
  FROM public.tailor_advance_movements m
  WHERE m.tailor_id = p_tailor_id;
$$;

-- رصيد TAILOR_ADVANCES الدفتري بالدولار لهذا الرصيد العام (من قيود حركاته)
CREATE OR REPLACE FUNCTION public.get_tailor_advance_usd_balance(p_tailor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(sum(
    CASE
      WHEN je.debit_account = 'TAILOR_ADVANCES' THEN je.amount_usd
      WHEN je.credit_account = 'TAILOR_ADVANCES' THEN -je.amount_usd
      ELSE 0
    END
  ), 0), 2)
  FROM public.journal_entries je
  WHERE je.id IN (
    SELECT unnest(m.journal_entry_ids || CASE WHEN m.fx_entry_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[m.fx_entry_id] END)
    FROM public.tailor_advance_movements m
    WHERE m.tailor_id = p_tailor_id
  );
$$;

-- السلف القديمة المربوطة بطلبات لم تُطبَّق على أجرتها بعد (تُخصم تلقائيًا عند التسليم كما كانت)
CREATE OR REPLACE FUNCTION public.get_tailor_order_advances_sdg(p_tailor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(sum(public.get_tailor_paid_sdg(o.id, 'ADVANCE')), 0), 2)
  FROM public.sales_orders o
  WHERE o.order_type = 'TAILORING'
    AND o.tailor_id = p_tailor_id
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries j
      WHERE j.sales_order_id = o.id AND j.entry_type = 'TAILOR_ADVANCE_APPLICATION'
    );
$$;

-- ملخص السلف لكل خياط (p_tailor_id NULL = الكل) مع حركات شهر p_period
CREATE OR REPLACE FUNCTION public.get_tailor_advances(p_branch_id uuid, p_period date, p_tailor_id uuid DEFAULT NULL)
RETURNS TABLE (
  tailor_id uuid,
  general_balance_sdg numeric,
  order_advances_sdg numeric,
  total_balance_sdg numeric,
  advances_month_sdg numeric,
  returned_month_sdg numeric,
  deducted_month_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', p_period)::timestamp AT TIME ZONE 'Africa/Khartoum') AS start_at,
           ((date_trunc('month', p_period) + interval '1 month')::timestamp AT TIME ZONE 'Africa/Khartoum') AS end_at
  ), month_totals AS (
    SELECT m.tailor_id,
           sum(m.amount) FILTER (WHERE m.type = 'ADVANCE') AS advances,
           sum(m.amount) FILTER (WHERE m.type = 'RETURN') AS returned,
           sum(m.amount) FILTER (WHERE m.type = 'DEDUCTION') AS deducted
    FROM public.tailor_advance_movements m, bounds b
    WHERE m.branch_id = p_branch_id AND m.created_at >= b.start_at AND m.created_at < b.end_at
    GROUP BY m.tailor_id
  )
  SELECT u.id,
         public.get_tailor_advance_balance(u.id),
         public.get_tailor_order_advances_sdg(u.id),
         round(public.get_tailor_advance_balance(u.id) + public.get_tailor_order_advances_sdg(u.id), 2),
         round(COALESCE(t.advances, 0), 2),
         round(COALESCE(t.returned, 0), 2),
         round(COALESCE(t.deducted, 0), 2)
  FROM public.users u
  LEFT JOIN month_totals t ON t.tailor_id = u.id
  WHERE u."branchId" = p_branch_id
    AND lower(u.role::text) = 'tailor'
    AND (p_tailor_id IS NULL OR u.id = p_tailor_id);
$$;

/* ---------------------------------------------------------------------
   4) settle_tailor_fx — نفس تعريف live_public_schema.sql بتعديل حد TAILOR_ADVANCES فقط
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION "public"."settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order record;
  v_net numeric(14,2);
  v_labor_recognized boolean;
BEGIN
  SELECT id, branch_id, order_number, order_type
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id;

  IF NOT FOUND OR v_order.order_type <> 'TAILORING' THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE sales_order_id = p_order_id
      AND credit_account = 'TAILORS_PAYABLE'
      AND entry_type = 'TAILOR_COST'
  ) INTO v_labor_recognized;

  IF NOT v_labor_recognized THEN
    RETURN;
  END IF;

  IF public.get_tailor_paid_sdg(p_order_id) < public.get_tailor_cost_sdg(p_order_id) - 0.01 THEN
    RETURN; -- لسه فيه مستحق بالجنيه
  END IF;

  SELECT round(COALESCE(SUM(
    CASE
      WHEN credit_account = 'TAILORS_PAYABLE' THEN amount_usd
      WHEN debit_account = 'TAILORS_PAYABLE' THEN -amount_usd
      ELSE 0
    END
    -
    -- حد السلف المربوطة بالطلب فقط؛ قيد خصم السلف العام (TAILOR_ADVANCE_DEDUCTION) لا يدخل هنا
    CASE
      WHEN entry_type IN ('TAILOR_ADVANCE', 'TAILOR_ADVANCE_APPLICATION') AND debit_account = 'TAILOR_ADVANCES' THEN amount_usd
      WHEN entry_type IN ('TAILOR_ADVANCE', 'TAILOR_ADVANCE_APPLICATION') AND credit_account = 'TAILOR_ADVANCES' THEN -amount_usd
      ELSE 0
    END
  ), 0), 2)
  INTO v_net
  FROM public.journal_entries
  WHERE sales_order_id = p_order_id;

  IF abs(v_net) < 0.01 THEN
    RETURN;
  END IF;

  INSERT INTO public.journal_entries (
    entry_number, branch_id, created_by, entry_type, amount,
    currency, amount_usd, debit_account, credit_account,
    reference, sales_order_id, description
  ) VALUES (
    'JE-TLR-FX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_order.branch_id, p_user_id, 'CURRENCY_EXCHANGE', abs(v_net),
    'USD', abs(v_net),
    CASE WHEN v_net > 0 THEN 'TAILORS_PAYABLE' ELSE 'CURRENCY_EXCHANGE' END,
    CASE WHEN v_net > 0 THEN 'CURRENCY_EXCHANGE' ELSE 'TAILORS_PAYABLE' END,
    v_order.order_number, p_order_id,
    CASE WHEN v_net > 0
      THEN 'ربح فرق صرف على أجرة الخياط - ' || v_order.order_number
      ELSE 'خسارة فرق صرف على أجرة الخياط - ' || v_order.order_number
    END
  );
END;
$$;

/* ---------------------------------------------------------------------
   5) pay_tailor_dues — سلفة مفتوحة / استرداد نقدي / دفع المستحقات (+ خصم اختياري)
--------------------------------------------------------------------- */

DROP FUNCTION IF EXISTS public.pay_tailor_dues(uuid, uuid, uuid, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.pay_tailor_dues(
  p_branch_id uuid,
  p_user_id uuid,
  p_tailor_id uuid,
  p_kind text,
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
  v_now timestamptz := now();
  v_user record;
  v_tailor record;
  v_order record;
  v_total_remaining numeric(14,2) := 0;
  v_amount numeric(14,2);
  v_deduct numeric(14,2) := COALESCE(p_deduct_advance, 0);
  v_net numeric(14,2);
  v_left numeric(14,2);
  v_ded_left numeric(14,2);
  v_alloc numeric(14,2);
  v_alloc_ded numeric(14,2);
  v_alloc_net numeric(14,2);
  v_rate numeric(14,4);
  v_balance numeric(14,2);
  v_advance_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_reference text;
  v_entry_id uuid;
  v_ded_entry_id uuid;
  v_net_entry_id uuid;
  v_entry_ids uuid[] := '{}';
  v_ded_entry_ids uuid[] := '{}';
  v_fx_entry_id uuid;
  v_usd_balance numeric(14,2);
  v_allocations jsonb := '[]'::jsonb;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_suffix text;
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
    RAISE EXCEPTION 'سداد مستحقات الخياطين متاح للمدير أو المالك فقط';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('SETTLEMENT', 'ADVANCE', 'ADVANCE_RETURN') THEN
    RAISE EXCEPTION 'نوع العملية غير صالح';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  IF v_deduct < 0 OR round(v_deduct, 2) <> v_deduct THEN
    RAISE EXCEPTION 'مبلغ الخصم من السلف غير صالح';
  END IF;
  IF v_deduct > 0 AND p_kind <> 'SETTLEMENT' THEN
    RAISE EXCEPTION 'الخصم من رصيد السلف متاح عند دفع المستحقات فقط';
  END IF;

  SELECT id, name, role, "branchId" AS branch_id INTO v_tailor
  FROM public.users WHERE id = p_tailor_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'الخياط غير موجود'; END IF;
  IF v_tailor.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الخياط لا ينتمي إلى الفرع المحدد';
  END IF;
  IF lower(COALESCE(v_tailor.role::text, '')) <> 'tailor' THEN
    RAISE EXCEPTION 'المستخدم المحدد ليس حساب خياط';
  END IF;

  -- عملية واحدة لكل خياط في نفس الوقت + قفل طلباته (نفس قفل pay_tailor_payment)
  PERFORM pg_advisory_xact_lock(hashtext('tailor-dues-' || p_tailor_id::text));
  PERFORM 1 FROM public.sales_orders
  WHERE branch_id = p_branch_id AND order_type = 'TAILORING' AND tailor_id = p_tailor_id
  ORDER BY id
  FOR UPDATE;

  v_advance_balance := public.get_tailor_advance_balance(p_tailor_id);
  v_rate := public.require_exchange_rate(p_branch_id);

  v_reference :=
    CASE p_kind WHEN 'ADVANCE' THEN 'TLR-ADV-' WHEN 'ADVANCE_RETURN' THEN 'TLR-ADVRET-' ELSE 'TLR-DUES-' END ||
    to_char(v_now AT TIME ZONE 'Africa/Khartoum', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  /* ---------------- سلفة مفتوحة / استرداد نقدي ---------------- */
  IF p_kind IN ('ADVANCE', 'ADVANCE_RETURN') THEN
    IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
      RAISE EXCEPTION 'المبلغ غير صالح';
    END IF;
    v_amount := p_amount;

    IF p_kind = 'ADVANCE' THEN
      v_balance := public.get_account_balance(p_branch_id, p_payment_method, 'SDG');
      IF v_amount > v_balance THEN
        RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
          CASE WHEN p_payment_method = 'CASH' THEN 'الخزينة' ELSE 'البنك' END, v_balance;
      END IF;
    ELSIF v_amount > v_advance_balance THEN
      RAISE EXCEPTION 'الاسترداد يتجاوز رصيد سلف الخياط (% ج.س)', v_advance_balance;
    END IF;

    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
      description, debit_account, credit_account, branch_id, created_by, reference
    ) VALUES (
      'JE-' || v_reference,
      CASE WHEN p_kind = 'ADVANCE' THEN 'TAILOR_ADVANCE' ELSE 'TAILOR_ADVANCE_RETURN' END,
      v_amount, 'SDG', v_rate, round(v_amount / v_rate, 2),
      CASE WHEN p_kind = 'ADVANCE' THEN 'سلفة للخياط ' ELSE 'استرداد سلفة من الخياط ' END
        || v_tailor.name || COALESCE(' - ' || v_notes, ''),
      CASE WHEN p_kind = 'ADVANCE' THEN 'TAILOR_ADVANCES' ELSE p_payment_method END,
      CASE WHEN p_kind = 'ADVANCE' THEN p_payment_method ELSE 'TAILOR_ADVANCES' END,
      p_branch_id, p_user_id, v_reference
    )
    RETURNING id INTO v_entry_id;

    INSERT INTO public.tailor_advance_movements (
      branch_id, tailor_id, type, amount, payment_method, reference, journal_entry_ids, notes, created_by, created_at
    ) VALUES (
      p_branch_id, p_tailor_id, CASE WHEN p_kind = 'ADVANCE' THEN 'ADVANCE' ELSE 'RETURN' END,
      v_amount, p_payment_method, v_reference, ARRAY[v_entry_id], v_notes, p_user_id, v_now
    );

    v_new_balance := public.get_tailor_advance_balance(p_tailor_id);

    -- رصيد السلف صار صفرًا بعد الاسترداد: نغلق ما تبقّى من فرق الدولار على CURRENCY_EXCHANGE
    IF p_kind = 'ADVANCE_RETURN' AND v_new_balance = 0 THEN
      v_usd_balance := public.get_tailor_advance_usd_balance(p_tailor_id);

      IF abs(v_usd_balance) >= 0.01 THEN
        INSERT INTO public.journal_entries (
          entry_number, entry_type, amount, currency, amount_usd,
          description, debit_account, credit_account, branch_id, created_by, reference
        ) VALUES (
          'JE-' || v_reference || '-FX', 'CURRENCY_EXCHANGE', abs(v_usd_balance), 'USD', abs(v_usd_balance),
          CASE WHEN v_usd_balance > 0 THEN 'خسارة فرق صرف على سلف الخياط ' ELSE 'ربح فرق صرف على سلف الخياط ' END
            || v_tailor.name,
          CASE WHEN v_usd_balance > 0 THEN 'CURRENCY_EXCHANGE' ELSE 'TAILOR_ADVANCES' END,
          CASE WHEN v_usd_balance > 0 THEN 'TAILOR_ADVANCES' ELSE 'CURRENCY_EXCHANGE' END,
          p_branch_id, p_user_id, v_reference
        )
        RETURNING id INTO v_fx_entry_id;

        UPDATE public.tailor_advance_movements SET fx_entry_id = v_fx_entry_id
        WHERE reference = v_reference AND tailor_id = p_tailor_id;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'reference', v_reference,
      'kind', p_kind,
      'tailor_id', p_tailor_id,
      'tailor_name', v_tailor.name,
      'amount', v_amount,
      'amount_usd', round(v_amount / v_rate, 2),
      'currency', 'SDG',
      'exchange_rate_used', v_rate,
      'payment_method', p_payment_method,
      'journal_entry_id', v_entry_id,
      'fx_entry_id', v_fx_entry_id,
      'allocations', '[]'::jsonb,
      'advance_balance', v_new_balance
    );
  END IF;

  /* ---------------- دفع المستحقات (+ خصم اختياري من رصيد السلف) ---------------- */
  SELECT round(COALESCE(sum(d.remaining_sdg), 0), 2) INTO v_total_remaining
  FROM public.get_tailor_dues_orders(p_branch_id, p_tailor_id) d;

  IF v_total_remaining <= 0 THEN
    RAISE EXCEPTION 'لا توجد مستحقات متبقية لهذا الخياط';
  END IF;

  v_amount := COALESCE(p_amount, v_total_remaining);
  IF v_amount <= 0 OR round(v_amount, 2) <> v_amount THEN
    RAISE EXCEPTION 'مبلغ السداد غير صالح';
  END IF;
  IF v_amount > v_total_remaining THEN
    RAISE EXCEPTION 'المبلغ يتجاوز مستحقات الخياط المتبقية. المتبقي: % ج.س', v_total_remaining;
  END IF;

  IF v_deduct > v_amount THEN
    RAISE EXCEPTION 'المخصوم من السلف يتجاوز مبلغ السداد';
  END IF;
  IF v_deduct > v_advance_balance THEN
    RAISE EXCEPTION 'الخصم يتجاوز رصيد سلف الخياط (% ج.س)', v_advance_balance;
  END IF;

  v_net := round(v_amount - v_deduct, 2);

  IF v_net > 0 THEN
    v_balance := public.get_account_balance(p_branch_id, p_payment_method, 'SDG');
    IF v_net > v_balance THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
        CASE WHEN p_payment_method = 'CASH' THEN 'الخزينة' ELSE 'البنك' END, v_balance;
    END IF;
  END IF;

  v_left := v_amount;
  v_ded_left := v_deduct;

  -- التوزيع على الطلبات من الأقدم للأحدث
  FOR v_order IN
    SELECT d.sales_order_id, d.order_number, d.remaining_sdg
    FROM public.get_tailor_dues_orders(p_branch_id, p_tailor_id) d
    WHERE d.remaining_sdg > 0
    ORDER BY d.order_created_at, d.order_number
  LOOP
    EXIT WHEN v_left <= 0;

    v_alloc := least(v_order.remaining_sdg, v_left);
    v_alloc_ded := least(v_alloc, v_ded_left);
    v_alloc_net := round(v_alloc - v_alloc_ded, 2);
    v_net_entry_id := NULL;
    v_ded_entry_id := NULL;

    IF v_alloc_net > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
        description, debit_account, credit_account,
        branch_id, created_by, reference, sales_order_id, created_at
      ) VALUES (
        'JE-TLR-DUES-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        'TAILOR_DUES_PAYMENT', v_alloc_net, 'SDG', v_rate, round(v_alloc_net / v_rate, 2),
        'سداد مستحقات الخياط ' || v_tailor.name || ' — طلب ' || v_order.order_number
          || COALESCE(' - ' || v_notes, ''),
        'TAILORS_PAYABLE', p_payment_method,
        p_branch_id, p_user_id, v_reference, v_order.sales_order_id, v_now
      )
      RETURNING id INTO v_net_entry_id;
    END IF;

    IF v_alloc_ded > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
        description, debit_account, credit_account,
        branch_id, created_by, reference, sales_order_id, created_at
      ) VALUES (
        'JE-TLR-DED-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        'TAILOR_ADVANCE_DEDUCTION', v_alloc_ded, 'SDG', v_rate, round(v_alloc_ded / v_rate, 2),
        'خصم من سلف الخياط ' || v_tailor.name || ' عند سداد مستحقات طلب ' || v_order.order_number
          || COALESCE(' - ' || v_notes, ''),
        'TAILORS_PAYABLE', 'TAILOR_ADVANCES',
        p_branch_id, p_user_id, v_reference, v_order.sales_order_id, v_now
      )
      RETURNING id INTO v_ded_entry_id;

      v_ded_entry_ids := v_ded_entry_ids || v_ded_entry_id;
    END IF;

    -- صفوف الدفعات بعد القيدين؛ trigger الجدول يشغّل settle_tailor_fx عند اكتمال أجرة الطلب
    IF v_net_entry_id IS NOT NULL THEN
      INSERT INTO public.tailor_commission_payments (
        branch_id, tailor_id, sales_order_id, amount, payment_method, payment_type,
        notes, journal_entry_id, created_by, created_at, currency, amount_original, exchange_rate_used
      ) VALUES (
        p_branch_id, p_tailor_id, v_order.sales_order_id,
        greatest(round(v_alloc_net / v_rate, 2), 0.01), p_payment_method, 'SETTLEMENT',
        COALESCE(v_notes || ' — ', '') || v_reference, v_net_entry_id, p_user_id, v_now,
        'SDG', v_alloc_net, v_rate
      );
    END IF;

    IF v_ded_entry_id IS NOT NULL THEN
      INSERT INTO public.tailor_commission_payments (
        branch_id, tailor_id, sales_order_id, amount, payment_method, payment_type,
        notes, journal_entry_id, created_by, created_at, currency, amount_original, exchange_rate_used
      ) VALUES (
        p_branch_id, p_tailor_id, v_order.sales_order_id,
        greatest(round(v_alloc_ded / v_rate, 2), 0.01), p_payment_method, 'SETTLEMENT',
        COALESCE(v_notes || ' — ', '') || 'خصم من رصيد السلف — ' || v_reference, v_ded_entry_id, p_user_id, v_now,
        'SDG', v_alloc_ded, v_rate
      );
    END IF;

    v_allocations := v_allocations || jsonb_build_object(
      'sales_order_id', v_order.sales_order_id,
      'order_number', v_order.order_number,
      'amount', v_alloc,
      'amount_usd', round(v_alloc / v_rate, 2),
      'journal_entry_id', COALESCE(v_net_entry_id, v_ded_entry_id),
      'deduction_entry_id', v_ded_entry_id
    );

    v_ded_left := round(v_ded_left - v_alloc_ded, 2);
    v_left := round(v_left - v_alloc, 2);
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'تعذر توزيع كامل المبلغ على طلبات الخياط';
  END IF;

  v_new_balance := v_advance_balance;

  IF v_deduct > 0 THEN
    INSERT INTO public.tailor_advance_movements (
      branch_id, tailor_id, type, amount, payment_method, reference, journal_entry_ids, notes, created_by, created_at
    ) VALUES (
      p_branch_id, p_tailor_id, 'DEDUCTION', v_deduct, p_payment_method, v_reference,
      v_ded_entry_ids, v_notes, p_user_id, v_now
    );

    v_new_balance := public.get_tailor_advance_balance(p_tailor_id);

    -- رصيد السلف صار صفرًا بعد الخصم: نغلق ما تبقّى من فرق الدولار على CURRENCY_EXCHANGE
    IF v_new_balance = 0 THEN
      v_usd_balance := public.get_tailor_advance_usd_balance(p_tailor_id);

      IF abs(v_usd_balance) >= 0.01 THEN
        INSERT INTO public.journal_entries (
          entry_number, entry_type, amount, currency, amount_usd,
          description, debit_account, credit_account, branch_id, created_by, reference
        ) VALUES (
          'JE-' || v_reference || '-FX', 'CURRENCY_EXCHANGE', abs(v_usd_balance), 'USD', abs(v_usd_balance),
          CASE WHEN v_usd_balance > 0 THEN 'خسارة فرق صرف على سلف الخياط ' ELSE 'ربح فرق صرف على سلف الخياط ' END
            || v_tailor.name,
          CASE WHEN v_usd_balance > 0 THEN 'CURRENCY_EXCHANGE' ELSE 'TAILOR_ADVANCES' END,
          CASE WHEN v_usd_balance > 0 THEN 'TAILOR_ADVANCES' ELSE 'CURRENCY_EXCHANGE' END,
          p_branch_id, p_user_id, v_reference
        )
        RETURNING id INTO v_fx_entry_id;

        UPDATE public.tailor_advance_movements SET fx_entry_id = v_fx_entry_id
        WHERE reference = v_reference AND tailor_id = p_tailor_id AND type = 'DEDUCTION';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'reference', v_reference,
    'kind', p_kind,
    'tailor_id', p_tailor_id,
    'tailor_name', v_tailor.name,
    'amount', v_amount,
    'amount_usd', round(v_amount / v_rate, 2),
    'currency', 'SDG',
    'exchange_rate_used', v_rate,
    'payment_method', p_payment_method,
    'deducted', v_deduct,
    'net', v_net,
    'allocations', v_allocations,
    'fx_entry_id', v_fx_entry_id,
    'advance_balance', v_new_balance,
    'remaining_sdg', round(v_total_remaining - v_amount, 2)
  );
END;
$$;

/* ---------------------------------------------------------------------
   6) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.settle_tailor_fx(uuid, uuid)',
    'public.get_tailor_advance_balance(uuid)',
    'public.get_tailor_advance_usd_balance(uuid)',
    'public.get_tailor_order_advances_sdg(uuid)',
    'public.get_tailor_advances(uuid, date, uuid)',
    'public.pay_tailor_dues(uuid, uuid, uuid, text, numeric, text, text, numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

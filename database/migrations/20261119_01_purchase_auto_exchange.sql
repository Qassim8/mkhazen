/* =====================================================================
   دفع المشتريات بالدولار: تحويل تلقائي للناقص من رصيد الجنيه في نفس الحساب

   قبل: الدفع يُرفض لو رصيد الدولار في الحساب (الخزنة أو البنك) لا يكفي، حتى لو رصيد الجنيه
   في الحساب نفسه يغطي الفرق.
   الآن، لكل حساب دفع (ولكل جزء في الدفع المزدوج منفصلًا):
     shortfall_usd = المطلوب − رصيد الدولار (لو > 0)
     sdg_needed    = round(shortfall_usd × سعر الصرف الحالي، 2)
     • رصيد الجنيه ≥ sdg_needed → تحويل الناقص فقط بنفس القيدين المحاسبيين لـ exchange_currency
       (خروج جنيه: CURRENCY_EXCHANGE / الحساب، دخول دولار: الحساب / CURRENCY_EXCHANGE، بمرجع FX-...)
       بوصف "تحويل تلقائي لدفع أمر الشراء {الرقم}"، ثم الدفع بالدولار كالمعتاد.
     • الاثنان لا يكفيان → رفض: "رصيد {الحساب} غير كافٍ: المتاح X$ و Y ج.س (= Y÷السعر$)، والمطلوب Z$."
   الترتيب في المعاملة الواحدة: الفحص، ثم التحويل، ثم الاستلام، ثم الدفع. أي فشل يلغي الكل.

   الدوال:
     • check_purchase_payment_funds        (أُعيد كتابتها: تحسب الجنيه أيضًا، ورسالة الرفض الجديدة)
     • ensure_purchase_payment_usd          (جديدة: تنفّذ التحويل للناقص فقط، أو لا شيء)
     • receive_purchase_order_with_payment  (فحص ← تحويل ← استلام ← دفع)
     • receive_purchase_order_with_split_payment
     • record_purchase_payment_split
     • record_purchase_payment              (نصها الأخير في 20261023_01 + سطر التحويل قبل فحص الرصيد)
   الشراء المباشر يمر عبر دالتي الاستلام مع الدفع، فيشمله التحويل.
   لا تغيير في الجداول ولا في الدفع على مراحل.

   يعتمد على 20261103_01 و 20261104_01. شغّله على staging ثم production بعد النسخ الاحتياطي.
   آمن لإعادة التشغيل.
   ===================================================================== */

CREATE OR REPLACE FUNCTION public.check_purchase_payment_funds(
  p_branch_id      uuid,
  p_payment_method text,
  p_amount         numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account    text;
  v_amount     numeric;
  v_usd        numeric;
  v_sdg        numeric;
  v_rate       numeric;
  v_shortfall  numeric;
  v_sdg_needed numeric;
BEGIN
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع يجب أن تكون خزينة أو بنك';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

  -- نفس القفل الذي تستخدمه record_purchase_payment: الصرف المتزامن من نفس الحساب ينتظر
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':USD'));

  v_usd := public.get_account_balance(p_branch_id, v_account, 'USD');

  IF v_amount <= v_usd THEN
    RETURN;
  END IF;

  -- الناقص بالدولار يغطيه رصيد الجنيه في نفس الحساب بسعر الصرف الحالي؟
  v_shortfall := round(v_amount - v_usd, 2);
  v_sdg  := public.get_account_balance(p_branch_id, v_account, 'SDG');
  v_rate := public.get_current_exchange_rate(p_branch_id);

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    v_sdg_needed := round(v_shortfall * v_rate, 2);
    IF v_sdg >= v_sdg_needed THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'رصيد % غير كافٍ: المتاح %$ و % ج.س (= %$)، والمطلوب %$.',
    CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
    to_char(v_usd, 'FM999999999990.00'),
    to_char(v_sdg, 'FM999999999990.00'),
    CASE WHEN v_rate IS NOT NULL AND v_rate > 0
         THEN to_char(round(v_sdg / v_rate, 2), 'FM999999999990.00')
         ELSE '؟ (لا يوجد سعر صرف مسجل)' END,
    to_char(v_amount, 'FM999999999990.00');
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_purchase_payment_usd(
  p_branch_id      uuid,
  p_user_id        uuid,
  p_payment_method text,
  p_amount         numeric,
  p_order_number   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account    text;
  v_amount     numeric := round(COALESCE(p_amount, 0), 2);
  v_usd        numeric;
  v_rate       numeric;
  v_shortfall  numeric;
  v_sdg_needed numeric;
  v_ref        text;
  v_note       text;
  v_out_id     uuid;
  v_in_id      uuid;
BEGIN
  -- يرفض لو الدولار والجنيه معًا لا يكفيان (ويأخذ قفل الصرف من الحساب)
  PERFORM public.check_purchase_payment_funds(p_branch_id, p_payment_method, v_amount);

  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':SDG'));

  v_usd := public.get_account_balance(p_branch_id, v_account, 'USD');
  IF v_amount <= v_usd THEN
    RETURN NULL; -- الدولار يكفي: لا تحويل
  END IF;

  v_shortfall  := round(v_amount - v_usd, 2);
  v_rate       := public.get_current_exchange_rate(p_branch_id);
  v_sdg_needed := round(v_shortfall * v_rate, 2);

  v_ref  := 'FX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_note := 'تحويل تلقائي لدفع أمر الشراء ' || COALESCE(p_order_number, '') || ' بسعر ' || trim_scale(v_rate);

  -- نفس قيدي exchange_currency: الجنيه بالسعر المسجّل في النظام، والدولار بقيمته، والفرق (إن وُجد) على CURRENCY_EXCHANGE
  INSERT INTO public.journal_entries (
    entry_number, branch_id, created_by, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    v_ref || '-OUT', p_branch_id, p_user_id, 'CURRENCY_EXCHANGE', v_sdg_needed,
    'SDG', v_rate, round(v_sdg_needed / v_rate, 2),
    'CURRENCY_EXCHANGE', v_account, v_ref,
    v_note || ' (خروج SDG)'
  )
  RETURNING id INTO v_out_id;

  INSERT INTO public.journal_entries (
    entry_number, branch_id, created_by, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    v_ref || '-IN', p_branch_id, p_user_id, 'CURRENCY_EXCHANGE', v_shortfall,
    'USD', NULL, v_shortfall,
    v_account, 'CURRENCY_EXCHANGE', v_ref,
    v_note || ' (دخول USD)'
  )
  RETURNING id INTO v_in_id;

  RETURN jsonb_build_object(
    'reference',    v_ref,
    'account',      v_account,
    'sdg_amount',   v_sdg_needed,
    'usd_amount',   v_shortfall,
    'rate',         v_rate,
    'out_entry_id', v_out_id,
    'in_entry_id',  v_in_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_with_payment(
  p_order_id       uuid,
  p_user_id        uuid,
  p_branch_id      uuid,
  p_amount         numeric,
  p_payment_date   timestamptz,
  p_payment_method text,
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status     text;
  v_number     text;
  v_conversion jsonb;
  v_receipt    jsonb;
  v_payment    jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- لو الطلب ليس جاهزًا للاستلام ترفضه receive_purchase_order برسالتها المعتادة
  SELECT status::text, order_number INTO v_status, v_number
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_status = 'APPROVED' THEN
    -- 1) الفحص قبل أي تعديل  2) تحويل الناقص فقط (إن لزم)
    PERFORM public.check_purchase_payment_funds(p_branch_id, p_payment_method, p_amount);
    v_conversion := public.ensure_purchase_payment_usd(p_branch_id, p_user_id, p_payment_method, p_amount, v_number);
  END IF;

  -- 3) الاستلام  4) الدفع
  v_receipt := public.receive_purchase_order(p_order_id, p_user_id, p_branch_id);

  v_payment := public.record_purchase_payment(
    p_order_id, p_user_id, p_branch_id, p_amount, p_payment_date, p_payment_method, p_reference, p_notes
  );

  RETURN v_receipt || jsonb_build_object(
    'payment', v_payment,
    'conversions', CASE WHEN v_conversion IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_conversion) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_purchase_payment_split(
  p_order_id     uuid,
  p_user_id      uuid,
  p_branch_id    uuid,
  p_cash_amount  numeric,
  p_bank_amount  numeric,
  p_payment_date timestamptz,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash        numeric := round(COALESCE(p_cash_amount, 0), 2);
  v_bank        numeric := round(COALESCE(p_bank_amount, 0), 2);
  v_order       record;
  v_paid        numeric;
  v_remaining   numeric;
  v_cash_res    jsonb;
  v_bank_res    jsonb;
  v_conversions jsonb := '[]'::jsonb;
  v_conversion  jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الدفعة غير مكتملة';
  END IF;

  IF v_cash < 0 OR v_bank < 0 THEN
    RAISE EXCEPTION 'مبلغ الخزينة ومبلغ البنك لا يمكن أن يكونا سالبين';
  END IF;

  IF v_cash + v_bank <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- مجموع الجزأين لا يتجاوز المتبقي (حالة الطلب نفسها تفحصها record_purchase_payment)
  SELECT id, order_number, status, total_amount INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF FOUND AND v_order.status IN ('APPROVED', 'RECEIVED') THEN
    SELECT COALESCE(sum(amount), 0) INTO v_paid
    FROM public.purchase_order_payments
    WHERE purchase_order_id = p_order_id;

    v_remaining := greatest(0, round(v_order.total_amount - v_paid, 2));

    IF v_cash + v_bank > v_remaining THEN
      RAISE EXCEPTION 'مجموع الدفعة أكبر من المبلغ المتبقي (% $)', to_char(v_remaining, 'FM999999999990.00');
    END IF;
  END IF;

  -- 1) الفحص: كل جزء مغطى برصيد حسابه (دولار + جنيه بالسعر الحالي)، كل حساب منفصل
  PERFORM public.check_purchase_payment_funds(p_branch_id, 'CASH', v_cash);
  PERFORM public.check_purchase_payment_funds(p_branch_id, 'BANK', v_bank);

  -- 2) تحويل الناقص فقط لكل حساب
  v_conversion := public.ensure_purchase_payment_usd(p_branch_id, p_user_id, 'CASH', v_cash, v_order.order_number);
  IF v_conversion IS NOT NULL THEN v_conversions := v_conversions || jsonb_build_array(v_conversion); END IF;
  v_conversion := public.ensure_purchase_payment_usd(p_branch_id, p_user_id, 'BANK', v_bank, v_order.order_number);
  IF v_conversion IS NOT NULL THEN v_conversions := v_conversions || jsonb_build_array(v_conversion); END IF;

  -- 3) الدفع: كل جزء دفعة وقيد مستقل
  IF v_cash > 0 THEN
    v_cash_res := public.record_purchase_payment(
      p_order_id, p_user_id, p_branch_id, v_cash, p_payment_date, 'CASH', p_reference, p_notes
    );
  END IF;

  IF v_bank > 0 THEN
    v_bank_res := public.record_purchase_payment(
      p_order_id, p_user_id, p_branch_id, v_bank, p_payment_date, 'BANK', p_reference, p_notes
    );
  END IF;

  RETURN jsonb_build_object(
    'amount',      v_cash + v_bank,
    'cash',        v_cash_res,
    'bank',        v_bank_res,
    'conversions', v_conversions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_with_split_payment(
  p_order_id     uuid,
  p_user_id      uuid,
  p_branch_id    uuid,
  p_cash_amount  numeric,
  p_bank_amount  numeric,
  p_payment_date timestamptz,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash        numeric := round(COALESCE(p_cash_amount, 0), 2);
  v_bank        numeric := round(COALESCE(p_bank_amount, 0), 2);
  v_status      text;
  v_number      text;
  v_conversions jsonb := '[]'::jsonb;
  v_conversion  jsonb;
  v_receipt     jsonb;
  v_payment     jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  IF v_cash < 0 OR v_bank < 0 THEN
    RAISE EXCEPTION 'مبلغ الخزينة ومبلغ البنك لا يمكن أن يكونا سالبين';
  END IF;

  IF v_cash + v_bank <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- لو الطلب ليس جاهزًا للاستلام ترفضه receive_purchase_order برسالتها المعتادة
  SELECT status::text, order_number INTO v_status, v_number
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_status = 'APPROVED' THEN
    -- 1) الفحص قبل أي تعديل: لو أي حساب لا يكفي (دولار + جنيه) يُرفض الكل
    PERFORM public.check_purchase_payment_funds(p_branch_id, 'CASH', v_cash);
    PERFORM public.check_purchase_payment_funds(p_branch_id, 'BANK', v_bank);

    -- 2) تحويل الناقص فقط لكل حساب
    v_conversion := public.ensure_purchase_payment_usd(p_branch_id, p_user_id, 'CASH', v_cash, v_number);
    IF v_conversion IS NOT NULL THEN v_conversions := v_conversions || jsonb_build_array(v_conversion); END IF;
    v_conversion := public.ensure_purchase_payment_usd(p_branch_id, p_user_id, 'BANK', v_bank, v_number);
    IF v_conversion IS NOT NULL THEN v_conversions := v_conversions || jsonb_build_array(v_conversion); END IF;
  END IF;

  -- 3) الاستلام  4) الدفع
  v_receipt := public.receive_purchase_order(p_order_id, p_user_id, p_branch_id);

  v_payment := public.record_purchase_payment_split(
    p_order_id, p_user_id, p_branch_id, v_cash, v_bank, p_payment_date, p_reference, p_notes
  );

  RETURN v_receipt || jsonb_build_object('payment', v_payment, 'conversions', v_conversions);
END;
$$;

-- record_purchase_payment — الأصل: 20261023_01_cashier_operator_permissions.sql (+ سطر التحويل التلقائي)
CREATE OR REPLACE FUNCTION public.record_purchase_payment(
  p_order_id       uuid,
  p_user_id        uuid,
  p_branch_id      uuid,
  p_amount         numeric,
  p_payment_date   timestamptz,
  p_payment_method text,
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user       record;
  v_order      record;
  v_amount     numeric;
  v_paid       numeric;
  v_remaining  numeric;
  v_account    text;
  v_balance    numeric;
  v_payment    public.purchase_order_payments;
  v_journal_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الدفعة غير مكتملة';
  END IF;

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'تسجيل دفعات الموردين متاح للمالك أو المدير أو الكاشير فقط';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع يجب أن تكون خزينة أو بنك';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'تاريخ الدفعة غير صالح';
  END IF;

  SELECT id, order_number, status, total_amount
  INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب الشراء غير موجود';
  END IF;

  IF v_order.status = 'DRAFT' THEN
    RAISE EXCEPTION 'لا يمكن تسجيل دفعة قبل اعتماد طلب الشراء';
  ELSIF v_order.status NOT IN ('APPROVED', 'RECEIVED') THEN
    RAISE EXCEPTION 'لا يمكن تسجيل دفعة على طلب شراء ملغي';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_paid
  FROM public.purchase_order_payments
  WHERE purchase_order_id = p_order_id;

  v_remaining := greatest(0, round(v_order.total_amount - v_paid, 2));

  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'مبلغ الدفعة أكبر من المبلغ المتبقي (% $)', to_char(v_remaining, 'FM999999999990.00');
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

  -- Concurrent cash-outs from the same account wait here
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':USD'));

  -- الناقص بالدولار يُحوَّل تلقائيًا من رصيد الجنيه في نفس الحساب إن كفى (وإلا رفض برسالة الرصيدين)
  PERFORM public.ensure_purchase_payment_usd(p_branch_id, p_user_id, v_account, v_amount, v_order.order_number);

  -- Same balance the UI shows (live function, USD entries only)
  v_balance := public.get_account_balance(p_branch_id, v_account, 'USD');

  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (دولار). الرصيد الحالي % $ — يمكنك تحويل جنيه إلى دولار من صفحة المحاسبة',
      CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      to_char(v_balance, 'FM999999999990.00');
  END IF;

  INSERT INTO public.purchase_order_payments (
    purchase_order_id, amount, payment_date, payment_method, reference, notes, created_by
  ) VALUES (
    p_order_id, v_amount, p_payment_date, p_payment_method,
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''), p_user_id
  )
  RETURNING * INTO v_payment;

  -- currency/amount_usd come from snapshot_journal_currency() (→ USD)
  INSERT INTO public.journal_entries (
    entry_number, purchase_order_id, created_by, branch_id, entry_type,
    amount, description, reference, debit_account, credit_account
  ) VALUES (
    'JE-' || to_char(now(), 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_order_id, p_user_id, p_branch_id, 'PURCHASE_PAYMENT',
    v_amount, 'دفعة للمورد عن طلب الشراء ' || v_order.order_number,
    NULLIF(btrim(p_reference), ''), 'SUPPLIERS', v_account
  )
  RETURNING id INTO v_journal_id;

  RETURN to_jsonb(v_payment) || jsonb_build_object('journal_entry_id', v_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.check_purchase_payment_funds(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_purchase_payment_usd(uuid, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order_with_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_purchase_payment_split(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order_with_split_payment(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_purchase_payment_funds(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_purchase_payment_usd(uuid, uuid, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_with_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_purchase_payment_split(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_with_split_payment(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) TO service_role;

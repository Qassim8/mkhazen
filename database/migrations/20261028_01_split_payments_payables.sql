/* =====================================================================
   20261028_01 — الدفع المجزأ للأصول والمصروفات (مستحقات على المحل)
   =====================================================================
   الأصل أو المصروف يُسجَّل بقيمته الكاملة يوم حدوثه، ويُقسَّم إلى ثلاثة أجزاء
   (أي جزء قد يكون صفرًا، ومجموعها = القيمة الكاملة، بنفس عملة القيد):
     owner_paid : [ASSETS | حساب المصروف] / CAPITAL        دفعه المالك من ماله (لا يمس الخزنة)
     paid_now   : [ASSETS | حساب المصروف] / CASH | BANK    مع فحص الرصيد
     remaining  : [ASSETS | حساب المصروف] / OTHER_PAYABLES التزام يُسدَّد لاحقًا
   دفعة لاحقة (pay_payable): OTHER_PAYABLES / CASH | BANK مع فحص الرصيد، ولا تتجاوز المتبقي.
   فرق العملة: لو القيد بالجنيه، عند اكتمال السداد يُغلق فرق رصيد OTHER_PAYABLES بالدولار
   لهذا الالتزام على CURRENCY_EXCHANGE (بنفس أسلوب settle_tailor_fx):
     صافي > 0 (دفعنا دولارات أقل مما أثبتنا) : OTHER_PAYABLES / CURRENCY_EXCHANGE  (ربح)
     صافي < 0                                : CURRENCY_EXCHANGE / OTHER_PAYABLES  (خسارة)

   ما في هذا الملف:
   1) الجدولان payables و payable_payments (RLS + service_role فقط).
   2) journal_entries_entry_type_check += PAYABLE_PAYMENT.
      لا يوجد CHECK على أسماء الحسابات في journal_entries، فحساب OTHER_PAYABLES الجديد
      لا يحتاج قيدًا هنا (التغيير في TypeScript: enum وتسميات وحساب الأرصدة).
   3) create_asset_with_journal_entry: معاملات جديدة اختيارية
      (p_owner_paid / p_paid_now / p_remaining / p_due_date). بدونها: السلوك الحالي حرفيًا
      (قيد واحد: ASSETS / الخزينة أو البنك بكامل القيمة، برقم القيد نفسه). التوقيع القديم
      (11 معاملًا) يُحذف حتى لا يبقى تحميلان لنفس الاسم. مبنية على آخر تعريف في
      database/audit/live_public_schema.sql (لم يُعدَّل في migrations لاحقة).
   4) record_expense_with_payable: لا توجد دالة قاعدة بيانات لتسجيل المصروف (كان يُكتب من
      الـ API مباشرة). دالة جديدة ذرّية تُستخدم فقط عند إرسال تجزئة؛ بدون تجزئة يبقى
      مسار المصروف الحالي كما هو.
   5) pay_payable و get_payables_summary.

   تُطبَّق بعد 20261027_01..03. قابل لإعادة التشغيل. لا تلمس أي قيد قديم.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) الجداول
--------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.payables (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type          text NOT NULL CHECK (source_type IN ('ASSET', 'EXPENSE')),
  -- ASSET: id الأصل. EXPENSE: id قيد الالتزام (OTHER_PAYABLES)
  source_id            uuid,
  -- لمصروف: حساب المصروف (UTILITIES / RENTS / MAINTENANCE / OTHER_EXPENSE)
  expense_account      text,
  description          text NOT NULL,
  currency             text NOT NULL CHECK (currency IN ('USD', 'SDG')),
  total_amount         numeric(14,2) NOT NULL CHECK (total_amount > 0),
  owner_paid           numeric(14,2) NOT NULL DEFAULT 0 CHECK (owner_paid >= 0),
  -- المدفوع من الخزنة/البنك (المدفوع الآن + الدفعات اللاحقة)
  paid_amount          numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount     numeric(14,2) NOT NULL CHECK (remaining_amount >= 0),
  due_date             date,
  status               text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID')),
  -- قيد الالتزام الأصلي (دائن OTHER_PAYABLES) وقيد فرق العملة عند الإغلاق
  recognition_entry_id uuid REFERENCES public.journal_entries(id),
  fx_entry_id          uuid REFERENCES public.journal_entries(id),
  branch_id            uuid NOT NULL REFERENCES public.branches(id),
  created_by           uuid REFERENCES public.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payables_parts_check
    CHECK (round(owner_paid + paid_amount + remaining_amount, 2) = total_amount),
  CONSTRAINT payables_status_remaining_check
    CHECK ((status = 'PAID') = (remaining_amount = 0))
);

CREATE INDEX IF NOT EXISTS idx_payables_open
  ON public.payables (due_date NULLS LAST, created_at)
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_payables_source ON public.payables (source_type, source_id);

CREATE TABLE IF NOT EXISTS public.payable_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id         uuid NOT NULL REFERENCES public.payables(id),
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  amount_usd         numeric(14,2),
  exchange_rate_used numeric(14,4),
  method             text NOT NULL CHECK (method IN ('CASH', 'BANK')),
  journal_entry_id   uuid REFERENCES public.journal_entries(id),
  notes              text,
  created_by         uuid REFERENCES public.users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payable_payments_payable
  ON public.payable_payments (payable_id, created_at);

ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payables FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payables TO service_role;

ALTER TABLE public.payable_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payable_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payable_payments TO service_role;

COMMENT ON TABLE public.payables IS 'مستحقات على المحل: أصول/مصروفات سُجّلت بقيمتها الكاملة ويُدفع جزء منها لاحقًا (حساب OTHER_PAYABLES)';

/* ---------------------------------------------------------------------
   2) نوع قيد جديد: PAYABLE_PAYMENT (آخر قائمة: 20261013_01)
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
    'PAYABLE_PAYMENT'
  ]::text[]));

/* ---------------------------------------------------------------------
   3) create_asset_with_journal_entry — + الدفع المجزأ (اختياري)
--------------------------------------------------------------------- */

DROP FUNCTION IF EXISTS public.create_asset_with_journal_entry(uuid, uuid, text, text, numeric, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION "public"."create_asset_with_journal_entry"(
  "p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text",
  "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text",
  "p_reference" "text", "p_notes" "text", "p_entry_number" "text",
  "p_currency" "text" DEFAULT 'USD'::"text",
  "p_owner_paid" numeric DEFAULT NULL::numeric,
  "p_paid_now" numeric DEFAULT NULL::numeric,
  "p_remaining" numeric DEFAULT NULL::numeric,
  "p_due_date" "date" DEFAULT NULL::"date"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_asset_id uuid;
  v_entry_id uuid;
  v_first_entry_id uuid;
  v_recognition_id uuid;
  v_payable_id uuid;
  v_credit_account text;
  v_rate numeric(14,4);
  v_value_usd numeric(14,2);
  v_balance numeric(14,2);
  v_split boolean := (p_owner_paid IS NOT NULL OR p_paid_now IS NOT NULL OR p_remaining IS NOT NULL);
  v_owner numeric(14,2) := 0;
  v_now numeric(14,2);
  v_rem numeric(14,2) := 0;
BEGIN
  IF p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  IF p_currency NOT IN ('USD', 'SDG') THEN
    RAISE EXCEPTION 'عملة الدفع غير صالحة';
  END IF;

  IF p_purchase_value IS NULL OR p_purchase_value <= 0 THEN
    RAISE EXCEPTION 'قيمة الأصل يجب أن تكون أكبر من صفر';
  END IF;

  IF v_split THEN
    v_owner := COALESCE(p_owner_paid, 0);
    v_now := COALESCE(p_paid_now, 0);
    v_rem := COALESCE(p_remaining, 0);

    IF v_owner < 0 OR v_now < 0 OR v_rem < 0
       OR round(v_owner, 2) <> v_owner OR round(v_now, 2) <> v_now OR round(v_rem, 2) <> v_rem
       OR round(p_purchase_value, 2) <> p_purchase_value THEN
      RAISE EXCEPTION 'أجزاء الدفع يجب أن تكون أرقامًا موجبة بمنزلتين عشريتين كحد أقصى';
    END IF;

    IF round(v_owner + v_now + v_rem, 2) <> p_purchase_value THEN
      RAISE EXCEPTION 'مجموع أجزاء الدفع (دفعه المالك + المدفوع الآن + المتبقي) يجب أن يساوي قيمة الأصل';
    END IF;
  ELSE
    v_now := p_purchase_value;
  END IF;

  v_credit_account := p_payment_method;

  IF p_currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
    v_value_usd := round(p_purchase_value / v_rate, 2);
  ELSE
    v_rate := NULL;
    v_value_usd := round(p_purchase_value, 2);
  END IF;

  IF v_now > 0 THEN
    v_balance := public.get_account_balance(p_branch_id, v_credit_account, p_currency);

    IF v_now > v_balance THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ في % (%). الرصيد الحالي: %',
        CASE WHEN v_credit_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
        CASE WHEN p_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END,
        v_balance;
    END IF;
  END IF;

  INSERT INTO public.assets (
    branch_id, created_by, name, category, purchase_value, purchase_date,
    payment_method, reference, notes, currency, exchange_rate_used, purchase_value_usd
  ) VALUES (
    p_branch_id, p_created_by, p_name, p_category, p_purchase_value, p_purchase_date::date,
    p_payment_method, p_reference, p_notes, p_currency, v_rate, v_value_usd
  )
  RETURNING id INTO v_asset_id;

  -- دفعه المالك من ماله: ASSETS / CAPITAL
  IF v_owner > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by, p_entry_number || '-C', 'ASSET', v_owner,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_owner / v_rate ELSE v_owner END, 2),
      'ASSETS', 'CAPITAL', p_reference, 'شراء أصل: ' || p_name || ' — دفعه المالك من ماله'
    )
    RETURNING id INTO v_entry_id;

    v_first_entry_id := COALESCE(v_first_entry_id, v_entry_id);
  END IF;

  -- المدفوع الآن: ASSETS / CASH|BANK (بدون تجزئة: القيد الوحيد وبرقمه الأصلي)
  IF v_now > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by,
      CASE WHEN v_split THEN p_entry_number || '-P' ELSE p_entry_number END,
      'ASSET', v_now,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_now / v_rate ELSE v_now END, 2),
      'ASSETS', v_credit_account, p_reference, 'شراء أصل: ' || p_name
    )
    RETURNING id INTO v_entry_id;

    v_first_entry_id := COALESCE(v_first_entry_id, v_entry_id);
  END IF;

  -- المتبقي: ASSETS / OTHER_PAYABLES + سجل المستحق
  IF v_rem > 0 THEN
    INSERT INTO public.journal_entries (
      branch_id, created_by, entry_number, entry_type, amount,
      currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, reference, description
    ) VALUES (
      p_branch_id, p_created_by, p_entry_number || '-R', 'ASSET', v_rem,
      p_currency, v_rate, round(CASE WHEN p_currency = 'SDG' THEN v_rem / v_rate ELSE v_rem END, 2),
      'ASSETS', 'OTHER_PAYABLES', p_reference, 'شراء أصل: ' || p_name || ' — مستحق على المحل'
    )
    RETURNING id INTO v_recognition_id;

    v_first_entry_id := COALESCE(v_first_entry_id, v_recognition_id);

    INSERT INTO public.payables (
      source_type, source_id, description, currency, total_amount, owner_paid,
      paid_amount, remaining_amount, due_date, status, recognition_entry_id,
      branch_id, created_by
    ) VALUES (
      'ASSET', v_asset_id, 'أصل: ' || p_name, p_currency, p_purchase_value, v_owner,
      v_now, v_rem, p_due_date, 'OPEN', v_recognition_id,
      p_branch_id, p_created_by
    )
    RETURNING id INTO v_payable_id;
  END IF;

  RETURN jsonb_build_object(
    'asset_id', v_asset_id,
    'entry_id', v_first_entry_id,
    'purchase_value_usd', v_value_usd,
    'exchange_rate_used', v_rate,
    'payable_id', v_payable_id
  );
END;
$$;

/* ---------------------------------------------------------------------
   4) record_expense_with_payable — مصروف مجزأ (ذرّي)
--------------------------------------------------------------------- */

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
  IF p_account IS NULL OR p_account NOT IN ('UTILITIES', 'RENTS', 'MAINTENANCE', 'OTHER_EXPENSE') THEN
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

/* ---------------------------------------------------------------------
   5) pay_payable — دفعة على مستحق (ذرّية)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.pay_payable(
  p_payable_id uuid,
  p_amount     numeric,
  p_method     text,
  p_user_id    uuid,
  p_branch_id  uuid,
  p_notes      text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user       record;
  v_payable    record;
  v_amount     numeric(14,2);
  v_rate       numeric(14,4);
  v_balance    numeric(14,2);
  v_entry_id   uuid;
  v_entry_usd  numeric(14,2);
  v_after      numeric(14,2);
  v_payment_id uuid;
  v_recognized_usd numeric(14,2);
  v_paid_usd   numeric(14,2);
  v_net        numeric(14,2);
  v_fx_id      uuid;
BEGIN
  IF p_payable_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
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
    RAISE EXCEPTION 'دفع المستحقات متاح للكاشير أو المدير أو المالك فقط';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  v_amount := round(p_amount, 2);

  SELECT * INTO v_payable
  FROM public.payables
  WHERE id = p_payable_id
  FOR UPDATE;

  IF NOT FOUND OR v_payable.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستحق غير موجود';
  END IF;

  IF v_payable.status <> 'OPEN' OR v_payable.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'المستحق مسدَّد بالكامل';
  END IF;

  IF v_amount > v_payable.remaining_amount THEN
    RAISE EXCEPTION 'المبلغ أكبر من المتبقي على المستحق (%)', v_payable.remaining_amount;
  END IF;

  v_balance := public.get_account_balance(p_branch_id, p_method, v_payable.currency);

  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (%). الرصيد الحالي: %',
      CASE WHEN p_method = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      CASE WHEN v_payable.currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END,
      v_balance;
  END IF;

  IF v_payable.currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
  END IF;

  INSERT INTO public.journal_entries (
    branch_id, created_by, entry_number, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    p_branch_id, p_user_id,
    'JE-PAY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
    'PAYABLE_PAYMENT', v_amount,
    v_payable.currency, v_rate,
    round(CASE WHEN v_payable.currency = 'SDG' THEN v_amount / v_rate ELSE v_amount END, 2),
    'OTHER_PAYABLES', p_method, NULL,
    'دفعة على مستحق: ' || v_payable.description
  )
  RETURNING id, amount_usd INTO v_entry_id, v_entry_usd;

  INSERT INTO public.payable_payments (
    payable_id, amount, amount_usd, exchange_rate_used, method, journal_entry_id, notes, created_by
  ) VALUES (
    p_payable_id, v_amount, v_entry_usd, v_rate, p_method, v_entry_id,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), p_user_id
  )
  RETURNING id INTO v_payment_id;

  v_after := round(v_payable.remaining_amount - v_amount, 2);

  UPDATE public.payables
  SET paid_amount = round(paid_amount + v_amount, 2),
      remaining_amount = v_after,
      status = CASE WHEN v_after = 0 THEN 'PAID' ELSE 'OPEN' END,
      updated_at = now()
  WHERE id = p_payable_id;

  -- اكتمال السداد بالجنيه: إغلاق فرق رصيد OTHER_PAYABLES بالدولار لهذا الالتزام على CURRENCY_EXCHANGE
  IF v_after = 0 AND v_payable.currency = 'SDG' THEN
    SELECT amount_usd INTO v_recognized_usd
    FROM public.journal_entries
    WHERE id = v_payable.recognition_entry_id;

    SELECT COALESCE(sum(je.amount_usd), 0) INTO v_paid_usd
    FROM public.payable_payments pp
    JOIN public.journal_entries je ON je.id = pp.journal_entry_id
    WHERE pp.payable_id = p_payable_id;

    v_net := round(COALESCE(v_recognized_usd, 0) - v_paid_usd, 2);

    IF abs(v_net) >= 0.01 THEN
      INSERT INTO public.journal_entries (
        branch_id, created_by, entry_number, entry_type, amount,
        currency, amount_usd, debit_account, credit_account, reference, description
      ) VALUES (
        p_branch_id, p_user_id,
        'JE-PAY-FX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
        'CURRENCY_EXCHANGE', abs(v_net),
        'USD', abs(v_net),
        CASE WHEN v_net > 0 THEN 'OTHER_PAYABLES' ELSE 'CURRENCY_EXCHANGE' END,
        CASE WHEN v_net > 0 THEN 'CURRENCY_EXCHANGE' ELSE 'OTHER_PAYABLES' END,
        NULL,
        CASE WHEN v_net > 0
          THEN 'ربح فرق صرف على مستحق: ' || v_payable.description
          ELSE 'خسارة فرق صرف على مستحق: ' || v_payable.description
        END
      )
      RETURNING id INTO v_fx_id;

      UPDATE public.payables SET fx_entry_id = v_fx_id WHERE id = p_payable_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'journal_entry_id', v_entry_id,
    'amount', v_amount,
    'amount_usd', v_entry_usd,
    'remaining_amount', v_after,
    'status', CASE WHEN v_after = 0 THEN 'PAID' ELSE 'OPEN' END,
    'fx_entry_id', v_fx_id,
    'fx_usd', v_net
  );
END;
$$;

/* ---------------------------------------------------------------------
   6) get_payables_summary — المستحقات المفتوحة حسب النوع
      book_usd = رصيد OTHER_PAYABLES الدفتري بالدولار لهذه المستحقات
      (قيد الالتزام − دولار الدفعات)، remaining_sdg / remaining_usd = المتبقي بعملته الأصلية.
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_payables_summary()
RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  WITH open_payables AS (
    SELECT
      p.id,
      p.source_type,
      p.currency,
      p.remaining_amount,
      (p.due_date IS NOT NULL
        AND p.due_date < (now() AT TIME ZONE 'Africa/Khartoum')::date) AS is_overdue,
      CASE
        WHEN p.currency = 'USD' THEN p.remaining_amount
        ELSE round(
          COALESCE((SELECT je.amount_usd FROM public.journal_entries je WHERE je.id = p.recognition_entry_id), 0)
          - COALESCE((
              SELECT sum(pp.amount_usd) FROM public.payable_payments pp WHERE pp.payable_id = p.id
            ), 0),
          2)
      END AS book_usd
    FROM public.payables p
    WHERE p.status = 'OPEN'
  ), b AS (
    SELECT
      k.kind,
      count(o.id) AS cnt,
      count(o.id) FILTER (WHERE o.is_overdue) AS overdue,
      COALESCE(sum(o.remaining_amount) FILTER (WHERE o.currency = 'SDG'), 0) AS rem_sdg,
      COALESCE(sum(o.remaining_amount) FILTER (WHERE o.currency = 'USD'), 0) AS rem_usd,
      COALESCE(sum(o.book_usd), 0) AS book_usd
    FROM (VALUES ('ASSET'), ('EXPENSE'), ('ALL')) AS k(kind)
    LEFT JOIN open_payables o ON k.kind = 'ALL' OR o.source_type = k.kind
    GROUP BY k.kind
  )
  SELECT jsonb_build_object(
    'assets', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem_sdg,
                                'remaining_usd', rem_usd, 'book_usd', book_usd)
      FROM b WHERE kind = 'ASSET'
    ),
    'expenses', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem_sdg,
                                'remaining_usd', rem_usd, 'book_usd', book_usd)
      FROM b WHERE kind = 'EXPENSE'
    ),
    'total', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem_sdg,
                                'remaining_usd', rem_usd, 'book_usd', book_usd)
      FROM b WHERE kind = 'ALL'
    )
  );
$$;

/* ---------------------------------------------------------------------
   7) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.create_asset_with_journal_entry(uuid, uuid, text, text, numeric, text, text, text, text, text, text, numeric, numeric, numeric, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_asset_with_journal_entry(uuid, uuid, text, text, numeric, text, text, text, text, text, text, numeric, numeric, numeric, date) TO service_role;

REVOKE ALL ON FUNCTION public.record_expense_with_payable(uuid, uuid, text, numeric, text, text, numeric, numeric, numeric, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_expense_with_payable(uuid, uuid, text, numeric, text, text, numeric, numeric, numeric, date, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.pay_payable(uuid, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_payable(uuid, numeric, text, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_payables_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_summary() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

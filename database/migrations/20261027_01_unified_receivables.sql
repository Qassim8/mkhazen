/* =====================================================================
   20261027_01 — ذمم موحدة مربوطة بالعميل (كاشير بالتقسيط + طلبات التفصيل)
   =====================================================================
   الربط والعرض فقط؛ لا تغيير في المنطق المحاسبي لأي دالة:

   1) resolve_customer_by_phone(branch, name, phone): يجد العميل بـ phone_normalized
      (الأقدم عند التكرار) وإلا ينشئه. يستدعيه مسار الكاشير عند التقسيط بعميل غير مختار.
   2) complete_sales_checkout: في وضع التقسيط p_customer_id إلزامي (ويجب أن يكون عميلًا في
      الفرع). كل ما عدا ذلك مطابق حرفيًا لتعريف 20261024_01 (credit_customer_name/phone تبقى
      نسخة نصية على الفاتورة).
   3) tailoring_paid_amount(order): المدفوع على طلب التفصيل بنفس معادلة complete_tailoring_pickup
      (دفعات مباشرة + عربون منقول إليه − منقول منه − مسترد، لا أقل من صفر). قراءة فقط.
   4) get_unified_receivables(customer?): مصدر واحد للحقيقة لصفحة الذمم وصفحة العميل:
        POS_CREDIT            فواتير الكاشير بالتقسيط المفتوحة (ديون فعلية)
        TAILORING_IN_PROGRESS طلبات تفصيل العميل غير الملغاة وغير المسلَّمة وعليها متبقٍ
                              (مبالغ متوقعة، ليست ديونًا)
      لا يوجد تصنيف "تفصيل مُسلَّم وعليه متبقٍ": complete_tailoring_pickup تحصّل كامل المتبقي
      عند التسليم وتُغلق الطلب (payment_status = PAID)، ولا مسار آخر للتسليم.
   5) get_receivables_summary: المفاتيح القديمة كما هي (فواتير الكاشير الآجلة) + pos_credit و
      tailoring_in_progress و total (كل واحد: count/overdue_count/remaining_sdg/usd_at_sale/
      usd_now/loss_usd).
   6) adjust_credit_remaining / close_credit_bad_debt: يُضاف 'cashier' إلى الأدوار المسموحة،
      وكل تعديل أو دين معدوم من كاشير ينشئ إشعارًا للمالك فقط (target_roles = {owner}).
      باقي منطق الدالتين بلا تغيير.

   تُطبَّق بعد 20261026_01_customers_hub.sql. قابل لإعادة التشغيل.
   ربط الفواتير الآجلة القديمة: 20261027_02 (معاينة) ثم 20261027_03 (تطبيق).
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) resolve_customer_by_phone
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.resolve_customer_by_phone(
  p_branch_id uuid,
  p_name      text,
  p_phone     text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_name     text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_clean    text;
  v_norm     text;
  v_customer record;
  v_created  boolean := false;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'الفرع مطلوب';
  END IF;

  v_clean := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF left(v_clean, 2) = '00' THEN
    v_clean := substring(v_clean FROM 3);
  END IF;

  v_norm := public.normalize_customer_phone(p_phone);

  IF v_norm = '' OR char_length(v_clean) < 8 OR char_length(v_clean) > 15 THEN
    RAISE EXCEPTION 'رقم هاتف العميل غير صالح';
  END IF;

  SELECT id, name, whatsapp_number
  INTO v_customer
  FROM public.customers
  WHERE branch_id = p_branch_id
    AND phone_normalized = v_norm
  ORDER BY created_at, id
  LIMIT 1;

  IF NOT FOUND THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;

    IF char_length(v_name) > 255 THEN
      RAISE EXCEPTION 'اسم العميل طويل جدًا';
    END IF;

    INSERT INTO public.customers (branch_id, name, whatsapp_number)
    VALUES (p_branch_id, v_name, v_clean)
    ON CONFLICT (branch_id, whatsapp_number) DO NOTHING
    RETURNING id, name, whatsapp_number INTO v_customer;

    IF FOUND THEN
      v_created := true;
    ELSE
      -- سباق: أُنشئ بنفس الرقم للتو
      SELECT id, name, whatsapp_number
      INTO v_customer
      FROM public.customers
      WHERE branch_id = p_branch_id AND whatsapp_number = v_clean;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'customer_id', v_customer.id,
    'name', v_customer.name,
    'whatsapp_number', v_customer.whatsapp_number,
    'created', v_created
  );
END;
$$;

/* ---------------------------------------------------------------------
   3) tailoring_paid_amount — المدفوع على طلب التفصيل (قراءة فقط)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.tailoring_paid_amount(p_order_id uuid)
RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT GREATEST(
    round(
      COALESCE((SELECT sum(amount) FROM public.sales_order_payments WHERE sales_order_id = p_order_id), 0)
      + COALESCE((SELECT sum(amount) FROM public.tailoring_customer_advance_transfers WHERE to_order_id = p_order_id), 0)
      - COALESCE((SELECT sum(amount) FROM public.tailoring_customer_advance_transfers WHERE from_order_id = p_order_id), 0)
      - COALESCE((SELECT sum(amount) FROM public.tailoring_customer_advance_refunds WHERE sales_order_id = p_order_id), 0),
      2
    ),
    0
  );
$$;

/* ---------------------------------------------------------------------
   4) get_unified_receivables — مصدر واحد للذمم (وصفحة العميل)
      remaining_usd_at_sale = المتبقي ÷ سعر صرف يوم البيع/إنشاء الطلب،
      remaining_usd_now = المتبقي ÷ سعر اليوم، loss_usd موجبة = خسارة بانخفاض الجنيه.
      أعمدة الربح/التكلفة (expected_profit_usd, deferred_cost_usd, loss_pct_of_profit)
      تخص فواتير الكاشير الآجلة فقط (NULL للتفصيل)؛ على الـ API إخفاؤها عن غير owner/admin.
--------------------------------------------------------------------- */

DROP FUNCTION IF EXISTS public.get_unified_receivables(uuid);

CREATE FUNCTION public.get_unified_receivables(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE(
  kind text,
  order_id uuid,
  order_number text,
  branch_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  created_at timestamptz,
  due_date date,
  is_overdue boolean,
  payment_status text,
  status_code text,
  can_collect boolean,
  total_amount numeric,
  paid_amount numeric,
  remaining_sdg numeric,
  sale_rate numeric,
  current_rate numeric,
  remaining_usd_at_sale numeric,
  remaining_usd_now numeric,
  loss_usd numeric,
  loss_pct numeric,
  equivalent_sdg_today numeric,
  expected_profit_usd numeric,
  deferred_cost_usd numeric,
  loss_pct_of_profit numeric
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  WITH base AS (
    -- فواتير الكاشير بالتقسيط المفتوحة
    SELECT
      'POS_CREDIT'::text AS kind,
      v.order_id,
      v.order_number,
      v.branch_id,
      o.customer_id,
      COALESCE(c.name, v.credit_customer_name) AS customer_name,
      COALESCE(c.whatsapp_number, v.credit_customer_phone) AS customer_phone,
      v.created_at,
      v.due_date,
      v.is_overdue,
      v.payment_status,
      NULL::text AS status_code,
      true AS can_collect,
      v.total_amount,
      v.paid_amount,
      v.remaining_sdg,
      v.sale_rate,
      v.current_rate,
      v.expected_profit_usd,
      v.deferred_cost_usd
    FROM public.get_credit_valuation(NULL) v
    JOIN public.sales_orders o ON o.id = v.order_id
    LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE p_customer_id IS NULL OR o.customer_id = p_customer_id

    UNION ALL

    -- طلبات تفصيل العميل غير الملغاة وغير المسلَّمة وعليها متبقٍ (مبالغ متوقعة)
    SELECT
      'TAILORING_IN_PROGRESS'::text,
      o.id,
      o.order_number::text,
      o.branch_id,
      o.customer_id,
      c.name,
      c.whatsapp_number,
      o.created_at,
      o.expected_delivery_date,
      (o.expected_delivery_date IS NOT NULL
        AND o.expected_delivery_date < (now() AT TIME ZONE 'Africa/Khartoum')::date),
      o.payment_status::text,
      o.tailoring_status::text,
      (o.tailoring_status = 'READY_FOR_PICKUP'),
      o.total_amount,
      p.paid,
      round(o.total_amount - p.paid, 2),
      o.exchange_rate_used,
      public.get_current_exchange_rate(o.branch_id),
      NULL::numeric,
      NULL::numeric
    FROM public.sales_orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
    CROSS JOIN LATERAL (SELECT public.tailoring_paid_amount(o.id) AS paid) p
    WHERE o.order_type = 'TAILORING'
      AND o.tailoring_purpose = 'CUSTOMER'
      AND COALESCE(o.tailoring_status, '') NOT IN ('CANCELLED', 'RECEIVED')
      AND o.total_amount - p.paid > 0
      AND (p_customer_id IS NULL OR o.customer_id = p_customer_id)
  ), calc AS (
    SELECT
      b.*,
      CASE WHEN b.sale_rate > 0 THEN b.remaining_sdg / b.sale_rate END AS usd_at_sale,
      CASE WHEN b.current_rate > 0 THEN b.remaining_sdg / b.current_rate END AS usd_now
    FROM base b
  )
  SELECT
    c.kind,
    c.order_id,
    c.order_number,
    c.branch_id,
    c.customer_id,
    c.customer_name,
    c.customer_phone,
    c.created_at,
    c.due_date,
    c.is_overdue,
    c.payment_status,
    c.status_code,
    c.can_collect,
    c.total_amount,
    c.paid_amount,
    c.remaining_sdg,
    c.sale_rate,
    c.current_rate,
    round(c.usd_at_sale, 2),
    round(c.usd_now, 2),
    round(c.usd_at_sale - c.usd_now, 2),
    CASE WHEN c.usd_at_sale > 0
      THEN round((c.usd_at_sale - c.usd_now) / c.usd_at_sale * 100, 2) END,
    CASE WHEN c.usd_at_sale IS NOT NULL AND c.current_rate > 0
      THEN round(c.usd_at_sale * c.current_rate, 2) END,
    c.expected_profit_usd,
    c.deferred_cost_usd,
    CASE WHEN c.kind = 'POS_CREDIT' AND c.expected_profit_usd > 0
      THEN round((c.usd_at_sale - c.usd_now) / c.expected_profit_usd * 100, 2) END
  FROM calc c
  ORDER BY c.due_date NULLS LAST, c.created_at;
$$;

/* ---------------------------------------------------------------------
   5) get_receivables_summary — القديم كما هو + التصنيفات والإجمالي
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_receivables_summary()
RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  WITH u AS (
    SELECT * FROM public.get_unified_receivables(NULL)
  ), b AS (
    SELECT
      k.kind,
      count(u.order_id) AS cnt,
      count(u.order_id) FILTER (WHERE u.is_overdue) AS overdue,
      COALESCE(sum(u.remaining_sdg), 0) AS rem,
      COALESCE(sum(u.remaining_usd_at_sale), 0) AS usd_at_sale,
      COALESCE(sum(u.remaining_usd_now), 0) AS usd_now,
      COALESCE(sum(u.loss_usd), 0) AS loss,
      COALESCE(sum(u.deferred_cost_usd), 0) AS deferred
    FROM (VALUES ('POS_CREDIT'), ('TAILORING_IN_PROGRESS'), ('ALL')) AS k(kind)
    LEFT JOIN u ON k.kind = 'ALL' OR u.kind = k.kind
    GROUP BY k.kind
  )
  SELECT jsonb_build_object(
    -- المفاتيح القديمة: فواتير الكاشير الآجلة
    'invoices_count',         (SELECT cnt FROM b WHERE kind = 'POS_CREDIT'),
    'overdue_count',          (SELECT overdue FROM b WHERE kind = 'POS_CREDIT'),
    'total_remaining_sdg',    (SELECT rem FROM b WHERE kind = 'POS_CREDIT'),
    'total_usd_at_sale',      (SELECT usd_at_sale FROM b WHERE kind = 'POS_CREDIT'),
    'total_usd_now',          (SELECT usd_now FROM b WHERE kind = 'POS_CREDIT'),
    'total_loss_usd',         (SELECT loss FROM b WHERE kind = 'POS_CREDIT'),
    'deferred_cost_usd_open', (SELECT deferred FROM b WHERE kind = 'POS_CREDIT'),
    'deferred_cogs_usd', (
      SELECT round(COALESCE(sum(
        CASE
          WHEN j.debit_account = 'DEFERRED_COGS' THEN j.amount_usd
          WHEN j.credit_account = 'DEFERRED_COGS' THEN -j.amount_usd
          ELSE 0
        END
      ), 0), 2)
      FROM public.journal_entries j
      WHERE j.debit_account = 'DEFERRED_COGS' OR j.credit_account = 'DEFERRED_COGS'
    ),
    -- التصنيفات والإجمالي
    'pos_credit', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem,
                                'usd_at_sale', usd_at_sale, 'usd_now', usd_now, 'loss_usd', loss)
      FROM b WHERE kind = 'POS_CREDIT'
    ),
    'tailoring_in_progress', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem,
                                'usd_at_sale', usd_at_sale, 'usd_now', usd_now, 'loss_usd', loss)
      FROM b WHERE kind = 'TAILORING_IN_PROGRESS'
    ),
    'total', (
      SELECT jsonb_build_object('count', cnt, 'overdue_count', overdue, 'remaining_sdg', rem,
                                'usd_at_sale', usd_at_sale, 'usd_now', usd_now, 'loss_usd', loss)
      FROM b WHERE kind = 'ALL'
    )
  );
$$;

/* ---------------------------------------------------------------------
   2) complete_sales_checkout — نفس 20261024_01 + customer_id إلزامي عند التقسيط
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric DEFAULT NULL::numeric, "p_is_credit" boolean DEFAULT false, "p_credit_name" "text" DEFAULT NULL::"text", "p_credit_phone" "text" DEFAULT NULL::"text", "p_due_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_order_id uuid;
  v_order_number varchar(50);
  v_year text;
  v_sequence integer;

  v_rate numeric(14,4);

  v_subtotal numeric(14,2) := 0;          -- جنيه
  v_subtotal_usd numeric(14,2) := 0;      -- دولار
  v_discount numeric(14,2) := 0;          -- جنيه
  v_tax numeric(14,2) := 0;               -- جنيه
  v_total_amount numeric(14,2) := 0;      -- جنيه
  v_total_amount_usd numeric(14,2) := 0;  -- دولار
  v_sales_cost numeric(14,2) := 0;        -- دولار (تكلفة المباع)
  v_gift_cost numeric(14,2) := 0;         -- دولار (تكلفة الهدايا)
  v_paid_amount numeric(14,2) := 0;

  v_item jsonb;
  v_variant_id uuid;
  v_template_id uuid;
  v_quantity numeric(12,2);
  v_is_gift boolean;
  v_gift_note text;
  v_selling_price numeric(14,2);          -- دولار
  v_average_cost numeric(14,2);           -- دولار
  v_stock_quantity numeric(12,2);
  v_line_cost numeric(14,2);
  v_unit_price_sdg numeric(14,2);
  v_item_total numeric(14,2);             -- جنيه
  v_item_total_usd numeric(14,2);         -- دولار
  v_list_price_sdg numeric(14,2);         -- جنيه (السعر المحسوب وقت البيع)
  v_override_raw text;
  v_override_sdg numeric(14,2);
  v_overridden boolean;

  v_payment jsonb;
  v_payment_method varchar(30);
  v_payment_amount numeric(14,2);
  v_payment_reference varchar(100);
  v_payment_notes text;
  v_payment_account varchar(30);
  v_payment_id uuid;

  v_first_revenue_entry_id uuid;
  v_entry_id uuid;
  v_payment_index integer := 0;

  v_items jsonb;
  v_splits jsonb;

  -- البيع بالتقسيط
  v_is_credit boolean := COALESCE(p_is_credit, false);
  v_credit_name text;
  v_credit_phone text;
  v_stored_method varchar(30);
  v_multi_payments boolean := false;
  v_cogs_part numeric(14,2) := 0;           -- دولار (تكلفة المدفوع)
  v_deferred_cost numeric(14,2) := 0;       -- دولار (تكلفة المتبقي المؤجلة)
  v_remaining numeric(14,2) := 0;           -- جنيه
  v_expected_profit numeric(14,2);          -- دولار
BEGIN
  v_items := COALESCE(p_items, '[]'::jsonb);
  v_splits := COALESCE(p_payment_splits, '[]'::jsonb);

  IF p_cashier_id IS NULL THEN RAISE EXCEPTION 'معرف الكاشير مطلوب'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'معرف الفرع مطلوب'; END IF;

  /* ---------------- سعر الصرف ---------------- */

  v_rate := public.require_exchange_rate(p_branch_id);

  IF p_expected_exchange_rate IS NOT NULL
     AND abs(p_expected_exchange_rate - v_rate) > 0.0001
  THEN
    RAISE EXCEPTION
      'تغيّر سعر الصرف إلى % ج.س للدولار. حدّث صفحة الكاشير وأعد المحاولة',
      round(v_rate, 2);
  END IF;

  /* ---------------- تحقق المدخلات ---------------- */

  IF p_order_type IS NULL OR p_order_type NOT IN ('POS', 'TAILORING') THEN
    RAISE EXCEPTION 'نوع الطلب غير صالح';
  END IF;

  IF p_order_type = 'POS' AND p_tailor_id IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد خياط لطلب بيع عادي';
  END IF;

  IF p_payment_method IS NULL
     OR p_payment_method NOT IN ('CASH', 'CARD', 'BANK_TRANSFER', 'MIXED') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  IF p_discount_amount IS NULL OR p_discount_amount < 0
     OR round(p_discount_amount, 2) <> p_discount_amount THEN
    RAISE EXCEPTION 'قيمة الخصم غير صالحة';
  END IF;

  IF p_tax_amount IS NULL OR p_tax_amount < 0
     OR round(p_tax_amount, 2) <> p_tax_amount THEN
    RAISE EXCEPTION 'قيمة الضريبة غير صالحة';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'يجب إضافة منتج واحد على الأقل';
  END IF;

  IF jsonb_typeof(v_splits) <> 'array' THEN
    RAISE EXCEPTION 'بيانات تقسيم الدفعات غير صالحة';
  END IF;

  -- نفس المتغير مسموح مرتين فقط لو مرة بيع ومرة هدية
  IF (SELECT COUNT(*) FROM jsonb_array_elements(v_items)) <>
     (SELECT COUNT(DISTINCT (value ->> 'variantId') || ':' ||
        COALESCE((value ->> 'isGift')::boolean, false)::text)
      FROM jsonb_array_elements(v_items))
  THEN
    RAISE EXCEPTION 'لا يجوز تكرار نفس المتغير بنفس النوع (بيع/هدية) في الفاتورة';
  END IF;

  -- فاتورة هدايا فقط (مثل هدايا الافتتاح): إجماليها صفر وبدون دفع أو خصم
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items)
    WHERE NOT COALESCE((value ->> 'isGift')::boolean, false)
  ) THEN
    IF p_payment_method = 'MIXED' OR COALESCE(p_discount_amount, 0) <> 0 OR COALESCE(p_tax_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'فاتورة الهدايا لا تحتوي على دفع مختلط أو خصم أو ضريبة';
    END IF;
  END IF;

  IF v_is_credit THEN
    -- البيع بالتقسيط: الدفعة المقدمة (إن وُجدت) تأتي في p_payment_splits (0 إلى 3 طرق دفع)
    IF p_order_type <> 'POS' THEN
      RAISE EXCEPTION 'البيع بالتقسيط متاح لفواتير الكاشير فقط';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items)
      WHERE NOT COALESCE((value ->> 'isGift')::boolean, false)
    ) THEN
      RAISE EXCEPTION 'فاتورة الهدايا لا تُباع بالتقسيط';
    END IF;

    v_credit_name := NULLIF(btrim(COALESCE(p_credit_name, '')), '');
    v_credit_phone := NULLIF(btrim(COALESCE(p_credit_phone, '')), '');

    IF v_credit_name IS NULL THEN
      RAISE EXCEPTION 'اسم العميل مطلوب للبيع بالتقسيط';
    END IF;

    IF v_credit_phone IS NULL THEN
      RAISE EXCEPTION 'رقم هاتف العميل مطلوب للبيع بالتقسيط';
    END IF;

    IF char_length(v_credit_name) > 255 THEN
      RAISE EXCEPTION 'اسم العميل طويل جدًا';
    END IF;

    IF char_length(v_credit_phone) > 30 THEN
      RAISE EXCEPTION 'رقم الهاتف طويل جدًا';
    END IF;

    -- ربط الدين بالعميل إلزامي (الاسم والهاتف أعلاه يبقيان نسخة نصية على الفاتورة)
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'اختيار العميل مطلوب للبيع بالتقسيط';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.customers WHERE id = p_customer_id AND branch_id = p_branch_id
    ) THEN
      RAISE EXCEPTION 'العميل غير موجود';
    END IF;

    IF p_due_date IS NOT NULL
       AND p_due_date < (now() AT TIME ZONE 'Africa/Khartoum')::date THEN
      RAISE EXCEPTION 'تاريخ الاستحقاق لا يمكن أن يكون في الماضي';
    END IF;

    IF jsonb_array_length(v_splits) > 3 THEN
      RAISE EXCEPTION 'الدفعة المقدمة تقبل ثلاث طرق دفع كحد أقصى';
    END IF;

    IF (SELECT COUNT(DISTINCT value ->> 'method') FROM jsonb_array_elements(v_splits))
       <> jsonb_array_length(v_splits) THEN
      RAISE EXCEPTION 'لا يجوز تكرار طريقة الدفع داخل الدفعة المقدمة';
    END IF;

    FOR v_payment IN SELECT value FROM jsonb_array_elements(v_splits) LOOP
      IF (v_payment ->> 'method') NOT IN ('CASH', 'CARD', 'BANK_TRANSFER') THEN
        RAISE EXCEPTION 'طريقة الدفع داخل التقسيم غير صالحة';
      END IF;

      BEGIN
        v_payment_amount := round((v_payment ->> 'amount')::numeric, 2);
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'مبلغ إحدى الدفعات غير صالح';
      END;

      IF v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
        RAISE EXCEPTION 'قيمة الدفعة يجب أن تكون أكبر من صفر';
      END IF;
    END LOOP;

    v_multi_payments := jsonb_array_length(v_splits) > 1;
    v_stored_method := CASE jsonb_array_length(v_splits)
      WHEN 0 THEN CASE WHEN p_payment_method = 'MIXED' THEN 'CASH' ELSE p_payment_method END
      WHEN 1 THEN v_splits -> 0 ->> 'method'
      ELSE 'MIXED'
    END;
  ELSIF p_payment_method = 'MIXED' THEN
    v_multi_payments := true;

    IF jsonb_array_length(v_splits) NOT BETWEEN 2 AND 3 THEN
      RAISE EXCEPTION 'الدفع المختلط يحتاج طريقتي دفع على الأقل وبحد أقصى ثلاث طرق';
    END IF;

    IF (SELECT COUNT(DISTINCT value ->> 'method') FROM jsonb_array_elements(v_splits))
       <> jsonb_array_length(v_splits) THEN
      RAISE EXCEPTION 'لا يجوز تكرار طريقة الدفع داخل الدفع المختلط';
    END IF;

    FOR v_payment IN SELECT value FROM jsonb_array_elements(v_splits) LOOP
      IF (v_payment ->> 'method') NOT IN ('CASH', 'CARD', 'BANK_TRANSFER') THEN
        RAISE EXCEPTION 'طريقة الدفع داخل التقسيم غير صالحة';
      END IF;

      BEGIN
        v_payment_amount := round((v_payment ->> 'amount')::numeric, 2);
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'مبلغ إحدى الدفعات غير صالح';
      END;

      IF v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
        RAISE EXCEPTION 'قيمة الدفعة يجب أن تكون أكبر من صفر';
      END IF;
    END LOOP;
  ELSIF jsonb_array_length(v_splits) > 0 THEN
    RAISE EXCEPTION 'لا ترسل تقسيم دفعات عند استخدام طريقة دفع واحدة';
  END IF;

  v_discount := round(p_discount_amount, 2);
  v_tax := round(p_tax_amount, 2);

  /* ---------------- رقم الفاتورة ---------------- */

  v_year := EXTRACT(YEAR FROM now())::text;
  PERFORM pg_advisory_xact_lock(hashtext('sales-invoice-' || v_year));

  SELECT COALESCE(MAX(
    CASE WHEN substring(order_number FROM 10) ~ '^[0-9]+$'
      THEN substring(order_number FROM 10)::integer ELSE 0 END
  ), 0) + 1
  INTO v_sequence
  FROM public.sales_orders
  WHERE order_number LIKE 'INV-' || v_year || '-%';

  v_order_number := 'INV-' || v_year || '-' || lpad(v_sequence::text, 6, '0');

  INSERT INTO public.sales_orders (
    order_number, branch_id, cashier_id, order_type,
    customer_id, tailor_id, subtotal, discount_amount,
    tax_amount, total_amount, payment_method,
    payment_status, status, notes, exchange_rate_used
  ) VALUES (
    v_order_number, p_branch_id, p_cashier_id, p_order_type,
    p_customer_id, p_tailor_id, 0, 0, 0, 0,
    COALESCE(v_stored_method, p_payment_method), 'UNPAID', 'PENDING', p_notes, v_rate
  )
  RETURNING id INTO v_order_id;

  /* ---------------- البنود ---------------- */

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(v_items)
    ORDER BY value ->> 'variantId', COALESCE((value ->> 'isGift')::boolean, false)
  LOOP
    BEGIN
      v_variant_id := (v_item ->> 'variantId')::uuid;
      v_quantity := (v_item ->> 'quantity')::numeric;
      -- سعر وحدة بالجنيه يحدده الكاشير (اختياري، لغير الهدايا فقط)
      v_override_raw := NULLIF(trim(COALESCE(v_item ->> 'unitPriceSdg', '')), '');
      v_override_sdg := CASE WHEN v_override_raw IS NULL THEN NULL ELSE round(v_override_raw::numeric, 2) END;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'بيانات أحد المنتجات غير صالحة';
    END;

    v_is_gift := COALESCE((v_item ->> 'isGift')::boolean, false);
    v_gift_note := CASE WHEN v_is_gift
      THEN NULLIF(trim(v_item ->> 'giftNote'), '') ELSE NULL END;

    IF v_quantity IS NULL OR v_quantity <= 0 OR round(v_quantity, 2) <> v_quantity THEN
      RAISE EXCEPTION 'كمية أحد المنتجات غير صالحة';
    END IF;

    SELECT
      v.id,
      v."templateId",
      COALESCE(v."sellingPrice", 0),
      COALESCE(
        NULLIF(v."averageCost", 0),
        round(COALESCE(v."purchasePrice", 0) / COALESCE(NULLIF(pt."conversionFactor", 0), 1), 2),
        0
      ),
      COALESCE(v."stockQuantity", 0)
    INTO v_variant_id, v_template_id, v_selling_price, v_average_cost, v_stock_quantity
    FROM public.product_variants v
    JOIN public.product_templates pt ON pt.id = v."templateId"
    WHERE v.id = v_variant_id
      AND v."isActive" = true
      AND pt."isActive" = true
    FOR UPDATE OF v;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'أحد المنتجات غير موجود أو غير نشط';
    END IF;

    IF v_stock_quantity < v_quantity THEN
      RAISE EXCEPTION 'المخزون غير كافٍ. المتاح: %، المطلوب: %', v_stock_quantity, v_quantity;
    END IF;

    v_line_cost := round(v_quantity * v_average_cost, 2);

    -- السعر الأصلي بالجنيه وقت البيع (يُحفظ لكل سطر)
    v_list_price_sdg := round(v_selling_price * v_rate, 2);
    v_overridden := false;

    IF v_is_gift THEN
      v_unit_price_sdg := 0;
      v_item_total := 0;
      v_item_total_usd := 0;
      v_gift_cost := round(v_gift_cost + v_line_cost, 2);
    ELSIF v_override_sdg IS NOT NULL THEN
      -- سعر مرن بطلب العميل: الشرط الوحيد أن يكون أكبر من صفر
      IF v_override_sdg <= 0 THEN
        RAISE EXCEPTION 'سعر الوحدة يجب أن يكون أكبر من صفر';
      END IF;
      v_unit_price_sdg := v_override_sdg;
      v_overridden := v_override_sdg <> v_list_price_sdg;
      v_item_total := round(v_quantity * v_unit_price_sdg, 2);
      -- القيمة الدولارية = المحصّل بالجنيه ÷ سعر الصرف
      v_item_total_usd := round(v_item_total / v_rate, 2);
      v_sales_cost := round(v_sales_cost + v_line_cost, 2);
    ELSE
      -- سعر الوحدة بالجنيه يتقرّب أولًا (هو اللي بيظهر للزبون)، والإجمالي
      -- = الكمية × سعر الوحدة بالجنيه (نفس حساب شاشة الكاشير بالظبط)
      v_unit_price_sdg := v_list_price_sdg;
      v_item_total := round(v_quantity * v_unit_price_sdg, 2);
      v_item_total_usd := round(v_quantity * v_selling_price, 2);
      v_sales_cost := round(v_sales_cost + v_line_cost, 2);
    END IF;

    v_subtotal := round(v_subtotal + v_item_total, 2);
    v_subtotal_usd := round(v_subtotal_usd + v_item_total_usd, 2);

    INSERT INTO public.sales_order_items (
      sales_order_id, template_id, variant_id, quantity,
      unit_price, unit_cost, total_price,
      unit_price_usd, total_price_usd,
      is_gift, gift_note,
      list_unit_price, price_overridden
    ) VALUES (
      v_order_id, v_template_id, v_variant_id, v_quantity,
      v_unit_price_sdg, v_average_cost, v_item_total,
      CASE
        WHEN v_is_gift THEN 0
        WHEN v_overridden THEN round(v_unit_price_sdg / v_rate, 2)
        ELSE v_selling_price
      END,
      v_item_total_usd,
      v_is_gift, v_gift_note,
      v_list_price_sdg, v_overridden
    );

    UPDATE public.product_variants
    SET "stockQuantity" = round("stockQuantity" - v_quantity, 2),
        "updatedAt" = now()
    WHERE id = v_variant_id;

    INSERT INTO public.inventory_movements (
      template_id, variant_id, sales_order_id, movement_type,
      quantity, unit_cost, reference, notes, created_by
    ) VALUES (
      v_template_id, v_variant_id, v_order_id,
      CASE WHEN v_is_gift THEN 'GIFT' ELSE 'SALE' END,
      v_quantity, v_average_cost, v_order_number,
      CASE WHEN v_is_gift
        THEN 'هدية من نقطة البيع' || COALESCE(' - ' || v_gift_note, '')
        ELSE 'بيع من نقطة البيع' END,
      p_cashier_id
    );
  END LOOP;

  /* ---------------- الإجماليات ---------------- */

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'الخصم لا يمكن أن يتجاوز المجموع الفرعي';
  END IF;

  v_total_amount := round(v_subtotal - v_discount + v_tax, 2);

  IF v_total_amount < 0 OR (v_total_amount = 0 AND NOT (NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items)
      WHERE NOT COALESCE((value ->> 'isGift')::boolean, false)
    ))) THEN
    RAISE EXCEPTION 'إجمالي الفاتورة يجب أن يكون أكبر من صفر';
  END IF;

  -- القيمة الدولارية الفعلية = اللي اتحصّل بالجنيه ÷ سعر الصرف
  v_total_amount_usd := round(v_total_amount / v_rate, 2);

  IF v_is_credit THEN
    SELECT round(COALESCE(SUM((value ->> 'amount')::numeric), 0), 2)
    INTO v_paid_amount
    FROM jsonb_array_elements(v_splits);

    IF v_total_amount <= 0 THEN
      RAISE EXCEPTION 'إجمالي الفاتورة الآجلة يجب أن يكون أكبر من صفر';
    END IF;

    IF v_paid_amount < 0 OR v_paid_amount >= v_total_amount THEN
      RAISE EXCEPTION 'المدفوع (%) يجب أن يكون أقل من إجمالي الفاتورة (%) ج.س في البيع بالتقسيط', v_paid_amount, v_total_amount;
    END IF;

    -- الإيراد يُسجَّل عند التحصيل فقط: التكلفة تنقسم بنسبة المدفوع من الإجمالي،
    -- والباقي تكلفة مؤجلة (DEFERRED_COGS) تُحرَّر مع كل دفعة
    v_remaining := round(v_total_amount - v_paid_amount, 2);
    v_cogs_part := round(v_sales_cost * v_paid_amount / v_total_amount, 2);
    v_deferred_cost := round(v_sales_cost - v_cogs_part, 2);
    v_expected_profit := round(v_total_amount_usd - v_sales_cost - v_gift_cost, 2);
  ELSE
    IF p_payment_method = 'MIXED' THEN
      SELECT round(COALESCE(SUM((value ->> 'amount')::numeric), 0), 2)
      INTO v_paid_amount
      FROM jsonb_array_elements(v_splits);
    ELSE
      v_paid_amount := v_total_amount;
    END IF;

    IF v_paid_amount <> v_total_amount THEN
      RAISE EXCEPTION 'مجموع الدفعات (%) لا يساوي إجمالي الفاتورة (%) ج.س', v_paid_amount, v_total_amount;
    END IF;
  END IF;

  UPDATE public.sales_orders
  SET subtotal = v_subtotal,
      subtotal_usd = v_subtotal_usd,
      discount_amount = v_discount,
      tax_amount = v_tax,
      total_amount = v_total_amount,
      total_amount_usd = v_total_amount_usd,
      payment_status = CASE
        WHEN v_is_credit THEN CASE WHEN v_paid_amount > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
        ELSE 'PAID'
      END,
      status = 'COMPLETED',
      completed_at = now(),
      updated_at = now(),
      is_credit = v_is_credit,
      credit_customer_name = v_credit_name,
      credit_customer_phone = v_credit_phone,
      due_date = CASE WHEN v_is_credit THEN p_due_date END,
      paid_amount = CASE WHEN v_is_credit THEN v_paid_amount END,
      remaining_amount = CASE WHEN v_is_credit THEN v_remaining END,
      deferred_cost_usd = v_deferred_cost,
      expected_profit_usd = v_expected_profit
  WHERE id = v_order_id;

  /* ---------------- الدفعات + قيود الإيراد (جنيه) ---------------- */

  IF NOT v_is_credit AND p_payment_method <> 'MIXED' THEN
    v_splits := jsonb_build_array(jsonb_build_object(
      'method', p_payment_method,
      'amount', v_total_amount
    ));
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_splits) WHERE v_total_amount > 0 LOOP
    v_payment_method := v_payment ->> 'method';
    v_payment_amount := round((v_payment ->> 'amount')::numeric, 2);
    v_payment_reference := NULLIF(trim(v_payment ->> 'reference'), '');
    v_payment_notes := NULLIF(trim(v_payment ->> 'notes'), '');
    v_payment_index := v_payment_index + 1;
    v_payment_account := CASE WHEN v_payment_method = 'CASH' THEN 'CASH' ELSE 'BANK' END;

    INSERT INTO public.sales_order_payments (
      sales_order_id, amount, payment_date, payment_method,
      reference, notes, created_by
    ) VALUES (
      v_order_id, v_payment_amount, now(), v_payment_method,
      v_payment_reference, v_payment_notes, p_cashier_id
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.journal_entries (
      entry_number, sales_order_id, branch_id, created_by,
      entry_type, amount, currency, exchange_rate_used, amount_usd,
      debit_account, credit_account, description, reference
    ) VALUES (
      'JE-REV-' || v_order_number ||
        CASE WHEN v_multi_payments
          THEN '-' || lpad(v_payment_index::text, 2, '0') ELSE '' END,
      v_order_id, p_branch_id, p_cashier_id,
      'SALE', v_payment_amount, 'SDG', v_rate, round(v_payment_amount / v_rate, 2),
      v_payment_account, 'SALES',
      'مبيعات نقطة البيع ' || v_order_number || ' - ' || v_payment_method,
      v_order_number
    )
    RETURNING id INTO v_entry_id;

    UPDATE public.sales_order_payments SET journal_entry_id = v_entry_id WHERE id = v_payment_id;

    IF v_first_revenue_entry_id IS NULL THEN
      v_first_revenue_entry_id := v_entry_id;
    END IF;
  END LOOP;

  UPDATE public.sales_orders
  SET sales_journal_entry_id = v_first_revenue_entry_id
  WHERE id = v_order_id;

  /* ---------------- تكلفة المبيعات (دولار) ---------------- */

  IF v_is_credit THEN
    -- المدفوع الآن: COGS / INVENTORY بنسبة المدفوع من الإجمالي
    IF v_cogs_part > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, sales_order_id, branch_id, created_by,
        entry_type, amount, currency, amount_usd,
        debit_account, credit_account, description, reference
      ) VALUES (
        'JE-COGS-' || v_order_number, v_order_id, p_branch_id, p_cashier_id,
        'COGS', v_cogs_part, 'USD', v_cogs_part,
        'COGS', 'INVENTORY',
        'تكلفة المبيعات (المدفوع) للفاتورة الآجلة ' || v_order_number, v_order_number
      )
      RETURNING id INTO v_entry_id;

      UPDATE public.sales_orders SET cogs_journal_entry_id = v_entry_id WHERE id = v_order_id;
    END IF;

    -- المتبقي: DEFERRED_COGS / INVENTORY (تُحرَّر عند كل تحصيل)
    IF v_deferred_cost > 0 THEN
      INSERT INTO public.journal_entries (
        entry_number, sales_order_id, branch_id, created_by,
        entry_type, amount, currency, amount_usd,
        debit_account, credit_account, description, reference
      ) VALUES (
        'JE-DCOGS-' || v_order_number, v_order_id, p_branch_id, p_cashier_id,
        'COGS', v_deferred_cost, 'USD', v_deferred_cost,
        'DEFERRED_COGS', 'INVENTORY',
        'تكلفة بضاعة مباعة بالآجل للفاتورة ' || v_order_number, v_order_number
      );
    END IF;
  ELSIF v_sales_cost > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, sales_order_id, branch_id, created_by,
      entry_type, amount, currency, amount_usd,
      debit_account, credit_account, description, reference
    ) VALUES (
      'JE-COGS-' || v_order_number, v_order_id, p_branch_id, p_cashier_id,
      'COGS', v_sales_cost, 'USD', v_sales_cost,
      'COGS', 'INVENTORY',
      'تكلفة المبيعات للفاتورة ' || v_order_number, v_order_number
    )
    RETURNING id INTO v_entry_id;

    UPDATE public.sales_orders SET cogs_journal_entry_id = v_entry_id WHERE id = v_order_id;
  END IF;

  /* ---------------- تكلفة الهدايا (دولار، مصروف) ---------------- */

  IF v_gift_cost > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, sales_order_id, branch_id, created_by,
      entry_type, amount, currency, amount_usd,
      debit_account, credit_account, description, reference
    ) VALUES (
      'JE-GIFT-' || v_order_number, v_order_id, p_branch_id, p_cashier_id,
      'GIFT', v_gift_cost, 'USD', v_gift_cost,
      'GIFTS', 'INVENTORY',
      'تكلفة هدايا مع الفاتورة ' || v_order_number, v_order_number
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'subtotal_usd', v_subtotal_usd,
    'discount_amount', v_discount,
    'tax_amount', v_tax,
    'total_amount', v_total_amount,
    'total_amount_usd', v_total_amount_usd,
    'exchange_rate_used', v_rate,
    'paid_amount', v_paid_amount,
    'payment_status', CASE
      WHEN v_is_credit THEN CASE WHEN v_paid_amount > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
      ELSE 'PAID'
    END,
    'status', 'COMPLETED',
    'payment_method', COALESCE(v_stored_method, p_payment_method),
    'is_credit', v_is_credit,
    'remaining_amount', CASE WHEN v_is_credit THEN v_remaining ELSE 0 END,
    'deferred_cost_usd', v_deferred_cost,
    'expected_profit_usd', v_expected_profit,
    'created_at', now()
  );
END;
$_$;

/* ---------------------------------------------------------------------
   6) adjust_credit_remaining — نفس 20261024_01 + السماح للكاشير + إشعار للمالك
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.adjust_credit_remaining(
  p_order_id      uuid,
  p_new_remaining numeric,
  p_reason        text,
  p_user_id       uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user   record;
  v_order  record;
  v_new    numeric(14,2);
  v_reason text;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'بيانات التعديل غير مكتملة';
  END IF;

  SELECT id, name, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'تعديل المتبقي متاح للكاشير أو المدير أو المالك فقط';
  END IF;

  IF p_new_remaining IS NULL OR p_new_remaining <= 0 OR round(p_new_remaining, 2) <> p_new_remaining THEN
    RAISE EXCEPTION 'المتبقي الجديد يجب أن يكون أكبر من صفر. لإغلاق الدين استخدم الإغلاق كدين معدوم';
  END IF;

  v_new := round(p_new_remaining, 2);
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'سبب التعديل مطلوب';
  END IF;

  SELECT id, order_number, branch_id, is_credit, credit_closed_reason, remaining_amount
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.branch_id IS DISTINCT FROM v_user.branch_id THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;

  IF NOT v_order.is_credit THEN
    RAISE EXCEPTION 'هذه الفاتورة ليست فاتورة بيع بالتقسيط';
  END IF;

  IF v_order.credit_closed_reason IS NOT NULL OR COALESCE(v_order.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'الفاتورة مغلقة ولا يمكن تعديل متبقيها';
  END IF;

  IF v_new = v_order.remaining_amount THEN
    RAISE EXCEPTION 'المتبقي الجديد يساوي الحالي';
  END IF;

  INSERT INTO public.credit_adjustments (
    order_id, adjustment_type, old_remaining, new_remaining, reason, created_by
  ) VALUES (
    p_order_id, 'ADJUST', v_order.remaining_amount, v_new, v_reason, p_user_id
  );

  UPDATE public.sales_orders
  SET remaining_amount = v_new,
      updated_at = now()
  WHERE id = p_order_id;

  -- تعديل من كاشير: إشعار للمالك فقط
  IF lower(v_user.role::text) = 'cashier' THEN
    INSERT INTO public.notifications (title, message, type, link, metadata, target_roles)
    VALUES (
      'تعديل متبقي فاتورة آجلة بواسطة الكاشير',
      'عدّل ' || COALESCE(v_user.name, 'الكاشير') || ' متبقي الفاتورة ' || v_order.order_number
        || ' من ' || trim_scale(round(v_order.remaining_amount, 2)) || ' إلى ' || trim_scale(v_new)
        || ' ج.س — السبب: ' || v_reason,
      'CREDIT_ADJUSTED',
      '/dashboard/receivables',
      jsonb_build_object('sales_order_id', p_order_id, 'actor_id', p_user_id,
                         'old_remaining', v_order.remaining_amount, 'new_remaining', v_new),
      ARRAY['owner']
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'old_remaining', v_order.remaining_amount,
    'new_remaining', v_new
  );
END;
$$;

/* ---------------------------------------------------------------------
   7) close_credit_bad_debt — نفس 20261024_01 + السماح للكاشير + إشعار للمالك
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.close_credit_bad_debt(
  p_order_id  uuid,
  p_user_id   uuid,
  p_branch_id uuid,
  p_notes     text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user     record;
  v_order    record;
  v_notes    text;
  v_deferred numeric(14,2);
  v_entry_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الإغلاق غير مكتملة';
  END IF;

  SELECT id, name, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'إغلاق الدين المعدوم متاح للكاشير أو المدير أو المالك فقط';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');

  SELECT id, order_number, branch_id, is_credit, credit_closed_reason,
         remaining_amount, deferred_cost_usd
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;

  IF NOT v_order.is_credit THEN
    RAISE EXCEPTION 'هذه الفاتورة ليست فاتورة بيع بالتقسيط';
  END IF;

  IF v_order.credit_closed_reason IS NOT NULL OR COALESCE(v_order.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'الفاتورة مغلقة بالفعل';
  END IF;

  v_deferred := COALESCE(v_order.deferred_cost_usd, 0);

  IF v_deferred > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, sales_order_id, branch_id, created_by,
      entry_type, amount, currency, amount_usd,
      debit_account, credit_account, description, reference
    ) VALUES (
      'JE-CBD-' || v_order.order_number || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
      p_order_id, p_branch_id, p_user_id,
      'EXPENSE', v_deferred, 'USD', v_deferred,
      'OTHER_EXPENSE', 'DEFERRED_COGS',
      'دين معدوم: تكلفة الجزء غير المحصَّل من الفاتورة ' || v_order.order_number
        || COALESCE(' — ' || v_notes, ''),
      v_order.order_number
    )
    RETURNING id INTO v_entry_id;
  END IF;

  INSERT INTO public.credit_adjustments (
    order_id, adjustment_type, old_remaining, new_remaining, reason, created_by
  ) VALUES (
    p_order_id, 'BAD_DEBT', v_order.remaining_amount, 0,
    COALESCE(v_notes, 'دين معدوم'), p_user_id
  );

  UPDATE public.sales_orders
  SET remaining_amount = 0,
      deferred_cost_usd = 0,
      credit_closed_reason = 'BAD_DEBT',
      updated_at = now()
  WHERE id = p_order_id;

  -- إغلاق من كاشير: إشعار للمالك فقط
  IF lower(v_user.role::text) = 'cashier' THEN
    INSERT INTO public.notifications (title, message, type, link, metadata, target_roles)
    VALUES (
      'دين معدوم أغلقه الكاشير',
      'أغلق ' || COALESCE(v_user.name, 'الكاشير') || ' الفاتورة ' || v_order.order_number
        || ' كدين معدوم وشُطب منها ' || trim_scale(round(v_order.remaining_amount, 2)) || ' ج.س'
        || COALESCE(' — ' || v_notes, ''),
      'CREDIT_BAD_DEBT',
      '/dashboard/receivables',
      jsonb_build_object('sales_order_id', p_order_id, 'actor_id', p_user_id,
                         'written_off_sdg', v_order.remaining_amount),
      ARRAY['owner']
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'written_off_sdg', v_order.remaining_amount,
    'expensed_cost_usd', v_deferred,
    'journal_entry_id', v_entry_id
  );
END;
$$;

/* ---------------------------------------------------------------------
   8) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.resolve_customer_by_phone(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_customer_by_phone(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.tailoring_paid_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tailoring_paid_amount(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_unified_receivables(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_receivables(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_receivables_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_receivables_summary() TO service_role;

REVOKE ALL ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric, boolean, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric, boolean, text, text, date) TO service_role;

REVOKE ALL ON FUNCTION public.adjust_credit_remaining(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_credit_remaining(uuid, numeric, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.close_credit_bad_debt(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_bad_debt(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

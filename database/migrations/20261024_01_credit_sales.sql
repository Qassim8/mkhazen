/* =====================================================================
   20261024_01 — البيع بالتقسيط من الكاشير (دين مربوط بالفاتورة، بلا حساب عميل)
   =====================================================================
   قرارات العميل (لا تتغيّر):
   • الدين بالجنيه فقط.
   • الإيراد يُسجَّل عند استلام كل دفعة فقط، بسعر صرف لحظتها. المتبقي ليس إيرادًا.
   • يُسمح بدفع أكثر من المتبقي (تعويض فرق الصرف): الزيادة إيراد عادي والفاتورة تُغلق.
   • owner/admin يعدّل المتبقي (زيادة/نقصان) أو يغلقه كدين معدوم.

   المحاسبة:
   • حساب جديد DEFERRED_COGS (تكلفة بضاعة مباعة بالآجل، أصل، USD). لا يوجد CHECK
     على أسماء الحسابات في journal_entries، فلا تغيير في القيود؛ الإضافة في
     TypeScript (enum + ACCOUNT_LABELS) وحسابات الأرصدة.
   • البيع: مدفوع الآن CASH/BANK ← SALES (جنيه)، COGS ← INVENTORY بنسبة المدفوع،
     والباقي DEFERRED_COGS ← INVENTORY. المتبقي لا يُقيَّد (remaining_amount).
   • كل دفعة: CASH/BANK ← SALES (جنيه، amount_usd بسعر اللحظة)، و
     COGS ← DEFERRED_COGS = التكلفة المؤجلة المتبقية × min(1، الدفعة ÷ المتبقي قبلها).
     عند وصول المتبقي إلى صفر: PAID وتُحرَّر كل التكلفة المؤجلة المتبقية.
   • تعديل المتبقي: بدون قيد، مع سجل (credit_adjustments).
   • دين معدوم: remaining_amount = 0 و OTHER_EXPENSE ← DEFERRED_COGS بالتكلفة المؤجلة المتبقية.

   ملاحظات على الأعمدة:
   • sale_exchange_rate: غير مضاف — sales_orders.exchange_rate_used يحفظ سعر الصرف
     لحظة البيع أصلًا (يُثبَّته trigger sales_orders_currency_snapshot).
   • paid_amount / remaining_amount لم يكونا موجودين فعليًا في sales_orders (كانا
     مجرد مفاتيح في ردود الدوال)، فأُضيفا هنا. يُملآن للفواتير الآجلة فقط؛ NULL
     للفواتير العادية (تُحسب دفعاتها من sales_order_payments كالسابق).
   • deferred_cost_usd = التكلفة المؤجلة المتبقية (تنقص مع كل تحرير).

   مبني على آخر تعريف لـ complete_sales_checkout في 20261017_01_pos_flexible_price.sql.
   قابل لإعادة التشغيل. يُطبَّق بعد 20261017_01 ثم يُعاد تشغيل 20261010_06_reassert_api_acl.sql.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) الأعمدة والجدول
--------------------------------------------------------------------- */

ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS credit_customer_name text;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS credit_customer_phone text;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS remaining_amount numeric(14,2);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS expected_profit_usd numeric(14,2);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS deferred_cost_usd numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS credit_closed_reason text;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_credit_closed_reason_check;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_credit_closed_reason_check
  CHECK (credit_closed_reason IS NULL OR credit_closed_reason IN ('PAID', 'BAD_DEBT'));

CREATE INDEX IF NOT EXISTS idx_sales_orders_open_credit
  ON public.sales_orders (due_date)
  WHERE is_credit = true AND credit_closed_reason IS NULL;

COMMENT ON COLUMN public.sales_orders.is_credit IS 'فاتورة بيع بالتقسيط (دين مربوط بالفاتورة)';
COMMENT ON COLUMN public.sales_orders.remaining_amount IS 'المتبقي بالجنيه للفواتير الآجلة فقط (NULL للفواتير العادية)';
COMMENT ON COLUMN public.sales_orders.deferred_cost_usd IS 'التكلفة المؤجلة المتبقية بالدولار (رصيد DEFERRED_COGS لهذه الفاتورة)';
COMMENT ON COLUMN public.sales_orders.expected_profit_usd IS 'إجمالي الفاتورة بالدولار بسعر البيع − تكلفة المباع − تكلفة الهدايا';

CREATE TABLE IF NOT EXISTS public.credit_adjustments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.sales_orders(id),
  adjustment_type text NOT NULL DEFAULT 'ADJUST' CHECK (adjustment_type IN ('ADJUST', 'BAD_DEBT')),
  old_remaining  numeric(14,2) NOT NULL,
  new_remaining  numeric(14,2) NOT NULL CHECK (new_remaining >= 0),
  reason         text,
  created_by     uuid REFERENCES public.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_adjustments_order ON public.credit_adjustments (order_id, created_at);

ALTER TABLE public.credit_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_adjustments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.credit_adjustments TO service_role;

/* ---------------------------------------------------------------------
   2) complete_sales_checkout — إضافة البيع بالتقسيط
      (مبنية على آخر تعريف في 20261017_01_pos_flexible_price.sql؛ السلوك العادي بلا تغيير)
--------------------------------------------------------------------- */

-- التوقيع القديم (12 معاملًا) يُحذف حتى لا يبقى تحميلان متعارضان لنفس الاسم
DROP FUNCTION IF EXISTS public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric);

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
   3) record_credit_payment — تحصيل دفعة على فاتورة آجلة (ذرّية)
      • تقبل مبلغًا أكبر من المتبقي (تعويض فرق الصرف): الزيادة إيراد عادي والفاتورة تُغلق.
      • ترفض فاتورة مغلقة أو غير آجلة.
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.record_credit_payment(
  p_order_id   uuid,
  p_amount_sdg numeric,
  p_method     text,
  p_user_id    uuid,
  p_branch_id  uuid,
  p_notes      text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user            record;
  v_order           record;
  v_rate            numeric(14,4);
  v_rate_id         uuid;
  v_amount          numeric(14,2);
  v_amount_usd      numeric(14,2);
  v_account         text;
  v_before          numeric(14,2);
  v_after           numeric(14,2);
  v_deferred_before numeric(14,2);
  v_release         numeric(14,2) := 0;
  v_payment_id      uuid;
  v_entry_id        uuid;
  v_release_entry   uuid;
  v_suffix          text;
  v_notes           text;
  v_now             timestamptz := now();
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
    RAISE EXCEPTION 'تحصيل دفعات الفواتير الآجلة متاح للكاشير أو المدير أو المالك فقط';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('CASH', 'CARD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  IF p_amount_sdg IS NULL OR p_amount_sdg <= 0 OR round(p_amount_sdg, 2) <> p_amount_sdg THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  v_amount := round(p_amount_sdg, 2);
  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');

  SELECT id, order_number, branch_id, status, is_credit, credit_closed_reason,
         remaining_amount, deferred_cost_usd, paid_amount
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

  IF v_order.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'الفاتورة غير مكتملة';
  END IF;

  IF v_order.credit_closed_reason IS NOT NULL OR COALESCE(v_order.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'الفاتورة مغلقة ولا يوجد متبقٍ عليها';
  END IF;

  v_rate := public.require_exchange_rate(p_branch_id);

  SELECT id INTO v_rate_id
  FROM public.exchange_rates
  WHERE branch_id = p_branch_id AND effective_at <= v_now
  ORDER BY effective_at DESC, created_at DESC
  LIMIT 1;

  v_before := v_order.remaining_amount;
  v_deferred_before := COALESCE(v_order.deferred_cost_usd, 0);
  v_after := GREATEST(0, round(v_before - v_amount, 2));
  v_amount_usd := round(v_amount / v_rate, 2);
  v_account := CASE WHEN p_method = 'CASH' THEN 'CASH' ELSE 'BANK' END;
  v_suffix := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- تحرير التكلفة المؤجلة: المتبقي × min(1، الدفعة ÷ المتبقي قبلها)، وكلها لو أُغلقت الفاتورة
  IF v_after = 0 THEN
    v_release := v_deferred_before;
  ELSE
    v_release := round(v_deferred_before * LEAST(1, v_amount / v_before), 2);
  END IF;

  INSERT INTO public.sales_order_payments (
    sales_order_id, amount, payment_date, payment_method, notes, created_by
  ) VALUES (
    p_order_id, v_amount, v_now, p_method, v_notes, p_user_id
  )
  RETURNING id INTO v_payment_id;

  -- trigger الدفعات يثبّت سعر صرف الفاتورة؛ هنا سعر لحظة التحصيل
  UPDATE public.sales_order_payments
  SET exchange_rate_id = v_rate_id,
      exchange_rate_sdg_per_usd = v_rate,
      amount_sdg = v_amount,
      amount_usd = v_amount_usd
  WHERE id = v_payment_id;

  INSERT INTO public.journal_entries (
    entry_number, sales_order_id, branch_id, created_by,
    entry_type, amount, currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, description, reference
  ) VALUES (
    'JE-CRP-' || v_order.order_number || '-' || v_suffix,
    p_order_id, p_branch_id, p_user_id,
    'SALE_PAYMENT', v_amount, 'SDG', v_rate, v_amount_usd,
    v_account, 'SALES',
    'تحصيل دفعة على الفاتورة الآجلة ' || v_order.order_number || ' - ' || p_method,
    v_order.order_number
  )
  RETURNING id INTO v_entry_id;

  UPDATE public.sales_order_payments SET journal_entry_id = v_entry_id WHERE id = v_payment_id;

  IF v_release > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, sales_order_id, branch_id, created_by,
      entry_type, amount, currency, amount_usd,
      debit_account, credit_account, description, reference
    ) VALUES (
      'JE-CRC-' || v_order.order_number || '-' || v_suffix,
      p_order_id, p_branch_id, p_user_id,
      'COGS', v_release, 'USD', v_release,
      'COGS', 'DEFERRED_COGS',
      'تحرير التكلفة المؤجلة للفاتورة الآجلة ' || v_order.order_number, v_order.order_number
    )
    RETURNING id INTO v_release_entry;
  END IF;

  UPDATE public.sales_orders
  SET paid_amount = round(COALESCE(paid_amount, 0) + v_amount, 2),
      remaining_amount = v_after,
      deferred_cost_usd = round(v_deferred_before - v_release, 2),
      payment_status = CASE WHEN v_after = 0 THEN 'PAID' ELSE 'PARTIAL' END,
      credit_closed_reason = CASE WHEN v_after = 0 THEN 'PAID' ELSE NULL END,
      updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'payment_id', v_payment_id,
    'journal_entry_id', v_entry_id,
    'release_entry_id', v_release_entry,
    'amount', v_amount,
    'amount_usd', v_amount_usd,
    'exchange_rate_used', v_rate,
    'remaining_before', v_before,
    'remaining_amount', v_after,
    'overpaid_amount', GREATEST(0, round(v_amount - v_before, 2)),
    'released_cost_usd', v_release,
    'deferred_cost_usd', round(v_deferred_before - v_release, 2),
    'payment_status', CASE WHEN v_after = 0 THEN 'PAID' ELSE 'PARTIAL' END,
    'closed', v_after = 0
  );
END;
$$;

/* ---------------------------------------------------------------------
   4) adjust_credit_remaining — تعديل المتبقي (تفاوض): بدون قيد، مع سجل. owner/admin فقط.
      لإغلاق الدين كليًا استخدم close_credit_bad_debt (حتى لا تبقى تكلفة مؤجلة بلا تحرير).
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

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تعديل المتبقي متاح للمالك أو المدير فقط';
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

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'old_remaining', v_order.remaining_amount,
    'new_remaining', v_new
  );
END;
$$;

/* ---------------------------------------------------------------------
   4b) close_credit_bad_debt — إغلاق الدين كمعدوم: remaining_amount = 0 و
       OTHER_EXPENSE ← DEFERRED_COGS بالتكلفة المؤجلة المتبقية. owner/admin فقط.
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

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'إغلاق الدين المعدوم متاح للمالك أو المدير فقط';
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
   5) get_credit_valuation — تقييم المتبقي بسعر البيع وسعر اليوم
      p_order_id = NULL → كل الفواتير الآجلة المفتوحة؛ وإلا فاتورة واحدة (حتى لو مغلقة).
      loss_usd موجبة = خسارة بسبب انخفاض الجنيه؛ loss_pct و loss_pct_of_profit نسب مئوية.
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_credit_valuation(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  branch_id uuid,
  credit_customer_name text,
  credit_customer_phone text,
  created_at timestamptz,
  due_date date,
  is_overdue boolean,
  payment_status text,
  credit_closed_reason text,
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
    SELECT
      o.id,
      o.order_number::text AS order_number,
      o.branch_id,
      o.credit_customer_name,
      o.credit_customer_phone,
      o.created_at,
      o.due_date,
      o.payment_status::text AS payment_status,
      o.credit_closed_reason,
      o.total_amount,
      COALESCE(o.paid_amount, 0) AS paid_amount,
      COALESCE(o.remaining_amount, 0) AS remaining_sdg,
      o.exchange_rate_used AS sale_rate,
      public.get_current_exchange_rate(o.branch_id) AS current_rate,
      o.expected_profit_usd,
      o.deferred_cost_usd
    FROM public.sales_orders o
    WHERE o.is_credit = true
      AND (
        (p_order_id IS NULL AND o.credit_closed_reason IS NULL AND COALESCE(o.remaining_amount, 0) > 0)
        OR o.id = p_order_id
      )
  ), calc AS (
    SELECT
      b.*,
      CASE WHEN b.sale_rate > 0 THEN b.remaining_sdg / b.sale_rate END AS usd_at_sale,
      CASE WHEN b.current_rate > 0 THEN b.remaining_sdg / b.current_rate END AS usd_now
    FROM base b
  )
  SELECT
    c.id,
    c.order_number,
    c.branch_id,
    c.credit_customer_name,
    c.credit_customer_phone,
    c.created_at,
    c.due_date,
    (c.due_date IS NOT NULL
       AND c.credit_closed_reason IS NULL
       AND c.remaining_sdg > 0
       AND c.due_date < (now() AT TIME ZONE 'Africa/Khartoum')::date) AS is_overdue,
    c.payment_status,
    c.credit_closed_reason,
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
    CASE WHEN c.expected_profit_usd > 0
      THEN round((c.usd_at_sale - c.usd_now) / c.expected_profit_usd * 100, 2) END
  FROM calc c
  ORDER BY c.due_date NULLS LAST, c.created_at;
$$;

/* ---------------------------------------------------------------------
   5b) get_receivables_summary — ملخص الديون المفتوحة (كل الفروع)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_receivables_summary()
RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT jsonb_build_object(
    'invoices_count',        COALESCE(count(*), 0),
    'overdue_count',         COALESCE(count(*) FILTER (WHERE v.is_overdue), 0),
    'total_remaining_sdg',   COALESCE(sum(v.remaining_sdg), 0),
    'total_usd_at_sale',     COALESCE(sum(v.remaining_usd_at_sale), 0),
    'total_usd_now',         COALESCE(sum(v.remaining_usd_now), 0),
    'total_loss_usd',        COALESCE(sum(v.loss_usd), 0),
    'deferred_cost_usd_open', COALESCE(sum(v.deferred_cost_usd), 0),
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
    )
  )
  FROM public.get_credit_valuation(NULL) v;
$$;


/* ---------------------------------------------------------------------
   6) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric, boolean, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric, boolean, text, text, date) TO service_role;

REVOKE ALL ON FUNCTION public.record_credit_payment(uuid, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_payment(uuid, numeric, text, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.adjust_credit_remaining(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_credit_remaining(uuid, numeric, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.close_credit_bad_debt(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_bad_debt(uuid, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_credit_valuation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_valuation(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_receivables_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_receivables_summary() TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

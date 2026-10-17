/* =====================================================================
   20261017_01 — سعر بيع مرن في الكاشير
   =====================================================================
   • p_items: كل سطر غير هدية يقبل unitPriceSdg اختياريًا؛ لو أُرسل يُستخدم
     سعرًا للوحدة بالجنيه. الشرط الوحيد: أكبر من صفر.
   • sales_order_items:
       list_unit_price  — السعر الأصلي بالجنيه المحسوب وقت البيع (لكل سطر)
       price_overridden — true لو السعر الفعلي ≠ الأصلي
   • أُلغي حد خصم الفاتورة 50%. يبقى: الخصم ≥ 0 و ≤ المجموع الفرعي، والإجمالي > 0
     (عدا فاتورة الهدايا فقط كما هي).
   • لا تغيير في: الهدايا، التكلفة، القيود، سعر الصرف.

   مبني على آخر تعريف للدالة في 20261014_01_deposit_gifts_opening_payroll.sql.
   قابل لإعادة التشغيل. يُطبَّق بعد 20261015_01 ثم يُعاد تشغيل
   20261010_06_reassert_api_acl.sql.
   ===================================================================== */

BEGIN;

ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS list_unit_price numeric(14,2);
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS price_overridden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_order_items.list_unit_price IS 'السعر الأصلي للوحدة بالجنيه وقت البيع (sellingPrice × سعر الصرف)';
COMMENT ON COLUMN public.sales_order_items.price_overridden IS 'السعر الفعلي عدّله الكاشير يدويًا';

CREATE OR REPLACE FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
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

  IF p_payment_method = 'MIXED' THEN
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
    p_payment_method, 'UNPAID', 'PENDING', p_notes, v_rate
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

  UPDATE public.sales_orders
  SET subtotal = v_subtotal,
      subtotal_usd = v_subtotal_usd,
      discount_amount = v_discount,
      tax_amount = v_tax,
      total_amount = v_total_amount,
      total_amount_usd = v_total_amount_usd,
      payment_status = 'PAID',
      status = 'COMPLETED',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_order_id;

  /* ---------------- الدفعات + قيود الإيراد (جنيه) ---------------- */

  IF p_payment_method <> 'MIXED' THEN
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
        CASE WHEN p_payment_method = 'MIXED'
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

  IF v_sales_cost > 0 THEN
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
    'payment_status', 'PAID',
    'status', 'COMPLETED',
    'payment_method', p_payment_method,
    'created_at', now()
  );
END;
$_$;


REVOKE ALL ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

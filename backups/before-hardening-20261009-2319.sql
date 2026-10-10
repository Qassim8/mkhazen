--
-- PostgreSQL database dump
--

\restrict wkd5K1gYZh9JVUP7SeAYVaRDRlEzjgm2ctM5zv9xftUNwG2xyerxe4hSusR0Itg

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'ACCOUNTANT',
    'CASHIER',
    'TAILOR',
    'tailor',
    'cashier',
    'system_manager',
    'admin',
    'owner'
);


--
-- Name: system_manager; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.system_manager AS ENUM (
    'manager'
);


--
-- Name: calculate_tailoring_measurement_meters(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_tailoring_measurement_meters(p_measurements jsonb) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_item jsonb;
  v_value numeric;
  v_unit text;
  v_total numeric(12,2) := 0;
BEGIN
  IF p_measurements IS NULL
     OR jsonb_typeof(p_measurements) <> 'array'
     OR jsonb_array_length(p_measurements) = 0
  THEN
    RAISE EXCEPTION 'يجب إدخال مقاس واحد على الأقل';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_measurements)
  LOOP
    IF COALESCE(trim(v_item ->> 'label'), '') = '' THEN
      RAISE EXCEPTION 'اسم أحد المقاسات مفقود';
    END IF;

    BEGIN
      v_value := (v_item ->> 'value')::numeric;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'قيمة أحد المقاسات غير صالحة';
    END;

    IF v_value IS NULL OR v_value <= 0 THEN
      RAISE EXCEPTION 'قيم المقاسات يجب أن تكون أكبر من صفر';
    END IF;

    v_unit := upper(trim(COALESCE(v_item ->> 'unit', '')));

    IF v_unit = 'CM' THEN
      v_total := v_total + (v_value / 100);
    ELSIF v_unit = 'M' THEN
      v_total := v_total + v_value;
    ELSE
      RAISE EXCEPTION 'وحدة قياس غير صالحة. استخدم CM أو M';
    END IF;
  END LOOP;

  RETURN round(v_total, 2);
END;
$$;


--
-- Name: cancel_tailoring_order(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'إلغاء الطلبات متاح للكاشير أو المدير فقط';
  END IF;

  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF v_order.tailoring_status <> 'NEW' THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الطلب بعد بدء التفصيل. استخدم تحويل الطلب إلى منتج للمخزون عند رفض العميل بعد بدء التنفيذ.';
  END IF;

  IF v_order.tailoring_material_journal_entry_id IS NOT NULL
     OR v_order.tailoring_labor_journal_entry_id IS NOT NULL
     OR v_order.tailoring_cogs_journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'الطلب يحتوي على حركة تنفيذ أو تكلفة ولا يمكن إلغاؤه بهذه الطريقة';
  END IF;

  UPDATE public.sales_orders
  SET
    tailoring_status = 'CANCELLED',
    status = 'CANCELLED',
    cancellation_reason = trim(p_reason),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order.order_number,
    'tailoring_status', 'CANCELLED',
    'cancellation_reason', trim(p_reason)
  );
END;
$$;


--
-- Name: check_overdue_tailoring_orders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_overdue_tailoring_orders(p_branch_id uuid) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.generate_overdue_tailoring_notifications(p_branch_id);
$$;


--
-- Name: complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_sales_checkout(p_branch_id uuid, p_cashier_id uuid, p_order_type text, p_customer_id uuid, p_tailor_id uuid, p_discount_amount numeric, p_tax_amount numeric, p_payment_method text, p_payment_splits jsonb, p_notes text, p_items jsonb, p_expected_exchange_rate numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  c_max_discount_ratio constant numeric := 0.50;

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

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items)
    WHERE NOT COALESCE((value ->> 'isGift')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'لا يمكن إصدار فاتورة تحتوي على هدايا فقط';
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

    IF v_is_gift THEN
      v_unit_price_sdg := 0;
      v_item_total := 0;
      v_item_total_usd := 0;
      v_gift_cost := round(v_gift_cost + v_line_cost, 2);
    ELSE
      -- سعر الوحدة بالجنيه يتقرّب أولًا (هو اللي بيظهر للزبون)، والإجمالي
      -- = الكمية × سعر الوحدة بالجنيه (نفس حساب شاشة الكاشير بالظبط)
      v_unit_price_sdg := round(v_selling_price * v_rate, 2);
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
      is_gift, gift_note
    ) VALUES (
      v_order_id, v_template_id, v_variant_id, v_quantity,
      v_unit_price_sdg, v_average_cost, v_item_total,
      CASE WHEN v_is_gift THEN 0 ELSE v_selling_price END, v_item_total_usd,
      v_is_gift, v_gift_note
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

  IF v_discount > trunc(v_subtotal * c_max_discount_ratio, 2) THEN
    RAISE EXCEPTION 'الخصم يتجاوز الحد المسموح (50%% من الإجمالي قبل الخصم)';
  END IF;

  v_total_amount := round(v_subtotal - v_discount + v_tax, 2);

  IF v_total_amount <= 0 THEN
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

  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_splits) LOOP
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


--
-- Name: complete_tailoring_pickup(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_direct_paid_amount numeric(12,2) := 0;
  v_transfer_in_amount numeric(12,2) := 0;
  v_transfer_out_amount numeric(12,2) := 0;
  v_refunded_amount numeric(12,2) := 0;
  v_paid_amount numeric(12,2) := 0;
  v_remaining numeric(12,2) := 0;
  v_customer_advance numeric(12,2) := 0;
  v_tailor_advance numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_payment_account text;
  v_entry_number text;
  v_entry_id uuid;
  v_customer_advance_sale_entry_id uuid;
  v_final_sale_entry_id uuid;
  v_labor_entry_id uuid;
  v_advance_apply_entry_id uuid;
  v_cogs_entry_id uuid;
  v_final_payment_method text;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'تسليم طلب العميل متاح للكاشير أو المدير فقط';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF v_order.tailoring_purpose <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'هذا طلب تصنيع للمخزون؛ استخدم استلام الإنتاج وإنشاء المنتج';
  END IF;

  IF v_order.tailoring_status <> 'READY_FOR_PICKUP' THEN
    RAISE EXCEPTION 'لا يمكن تسليم الطلب إلا عندما تكون حالته جاهزاً للتسليم';
  END IF;

  IF v_order.tailoring_cogs_journal_entry_id IS NOT NULL
     OR v_order.tailoring_labor_journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'تم إقفال التكلفة المحاسبية لهذا الطلب بالفعل';
  END IF;

  /*
     The amount credited to this order can come from: 
       1) direct customer payments on this order;
       2) customer advance transferred from a cancelled order;
       3) less any transfer/refund already made from this order.
     Transfers are an allocation of an existing liability; they do not touch
     CASH/BANK because the money was already received on the source order.
  */
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_direct_paid_amount
  FROM public.sales_order_payments
  WHERE sales_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_transfer_in_amount
  FROM public.tailoring_customer_advance_transfers
  WHERE to_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_transfer_out_amount
  FROM public.tailoring_customer_advance_transfers
  WHERE from_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_refunded_amount
  FROM public.tailoring_customer_advance_refunds
  WHERE sales_order_id = p_order_id;

  v_paid_amount := round(
    v_direct_paid_amount +
    v_transfer_in_amount -
    v_transfer_out_amount -
    v_refunded_amount,
    2
  );

  IF v_paid_amount < 0 THEN
    RAISE EXCEPTION 'رصيد العميل المحتسب على الطلب أصبح سالباً، تحقق من حركات العربون';
  END IF;

  v_remaining := round(v_order.total_amount - v_paid_amount, 2);

  IF v_remaining < 0 THEN
    RAISE EXCEPTION 'إجمالي المبالغ المحتسبة على الطلب يتجاوز قيمة الطلب';
  END IF;

  v_customer_advance := round(v_paid_amount, 2);
  v_total_cost := round(
    COALESCE(v_order.tailoring_fabric_cost, 0) +
    COALESCE(v_order.tailoring_cost, 0),
    2
  );

  /* ------------------------------------------------------------
     Recognize labor cost once.
  ------------------------------------------------------------ */
  IF COALESCE(v_order.tailoring_cost, 0) > 0 THEN
    v_entry_number :=
      'JE-TLR-LABOR-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_COST',
      round(v_order.tailoring_cost, 2),
      'إثبات تكلفة خياطة طلب تفصيل ' || v_order.order_number,
      'WORK_IN_PROGRESS',
      'TAILORS_PAYABLE',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_labor_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Apply any tailor advances already paid for this order.
  ------------------------------------------------------------ */
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_tailor_advance
  FROM public.tailor_commission_payments
  WHERE sales_order_id = p_order_id
    AND payment_type = 'ADVANCE';

  -- المقارنة بالجنيه (الدفعات المقدمة والأجرة كلاهما بالجنيه)
  IF public.tailor_advances_exceed_cost(p_order_id) THEN
    RAISE EXCEPTION 'إجمالي دفعات الخياط المقدمة يتجاوز تكلفة الخياطة للطلب';
  END IF;

  IF v_tailor_advance > 0 THEN
    v_entry_number :=
      'JE-TLR-ADV-APPLY-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_ADVANCE_APPLICATION',
      v_tailor_advance,
      'تسوية الدفعات المقدمة للخياط مقابل تكلفة خياطة الطلب ' || v_order.order_number,
      'TAILORS_PAYABLE',
      'TAILOR_ADVANCES',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_advance_apply_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Move total work-in-progress to COGS.
  ------------------------------------------------------------ */
  IF v_total_cost > 0 THEN
    v_entry_number :=
      'JE-TLR-COGS-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'COGS',
      v_total_cost,
      'إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه ' || v_order.order_number,
      'COGS',
      'WORK_IN_PROGRESS',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_cogs_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Revenue is recognized ONCE for the full order.
     Deposit: CUSTOMER_ADVANCES -> SALES
     Remaining cash/bank: CASH/BANK -> SALES
  ------------------------------------------------------------ */
  IF v_customer_advance > 0 THEN
    v_entry_number :=
      'JE-TLR-REV-ADV-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'SALE',
      v_customer_advance,
      'تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل ' || v_order.order_number,
      'CUSTOMER_ADVANCES',
      'SALES',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_customer_advance_sale_entry_id;
  END IF;

  IF v_remaining > 0 THEN
    v_payment_account := CASE
      WHEN p_payment_method = 'CASH' THEN 'CASH'
      ELSE 'BANK'
    END;

    v_entry_number :=
      'JE-TLR-REV-FINAL-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'SALE',
      v_remaining,
      'تحصيل باقي قيمة طلب التفصيل ' || v_order.order_number,
      v_payment_account,
      'SALES',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_final_sale_entry_id;

    INSERT INTO public.sales_order_payments (
      sales_order_id,
      amount,
      payment_date,
      payment_method,
      created_by,
      journal_entry_id
    )
    VALUES (
      p_order_id,
      v_remaining,
      now(),
      p_payment_method,
      p_user_id,
      v_final_sale_entry_id
    );
  END IF;

  v_final_payment_method := CASE
    WHEN v_remaining <= 0 THEN COALESCE(v_order.payment_method, p_payment_method)
    WHEN v_order.payment_method = p_payment_method THEN p_payment_method
    ELSE 'MIXED'
  END;

  UPDATE public.sales_orders
  SET
    tailoring_status = 'RECEIVED',
    status = 'COMPLETED',
    payment_status = 'PAID',
    payment_method = v_final_payment_method,
    tailoring_labor_journal_entry_id = v_labor_entry_id,
    tailoring_cogs_journal_entry_id = v_cogs_entry_id,
    customer_advance_recognition_journal_entry_id = v_customer_advance_sale_entry_id,
    cogs_journal_entry_id = v_cogs_entry_id,
    sales_journal_entry_id = COALESCE(v_final_sale_entry_id, v_customer_advance_sale_entry_id),
    completed_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order.order_number,
    'paid_amount', CASE
      WHEN v_remaining > 0 THEN v_remaining
      ELSE 0
    END,
    'total_paid_amount', round(v_paid_amount + v_remaining, 2),
    'remaining_amount', 0,
    'tailoring_cost', round(v_order.tailoring_cost, 2),
    'fabric_cost', round(COALESCE(v_order.tailoring_fabric_cost, 0), 2),
    'total_cost', v_total_cost,
    'tailoring_labor_journal_entry_id', v_labor_entry_id,
    'tailoring_cogs_journal_entry_id', v_cogs_entry_id,
    'customer_advance_sale_journal_entry_id', v_customer_advance_sale_entry_id,
    'tailor_advance_apply_journal_entry_id', v_advance_apply_entry_id,
    'tailoring_status', 'RECEIVED'
  );
END;
$$;


--
-- Name: complete_tailoring_production(uuid, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_category record;
  v_product_template_id uuid;
  v_product_variant_id uuid;
  v_product_name text;
  v_product_description text;
  v_category_id uuid;
  v_sku text;
  v_barcode text;
  v_pack_barcode text;
  v_color_name text;
  v_color_code text;
  v_size text;
  v_produced_quantity numeric(12,2);
  v_selling_price numeric(12,2);
  v_min_selling_price numeric(12,2);
  v_min_stock_level numeric(12,2);
  v_material_cost numeric(12,2);
  v_labor_cost numeric(12,2);
  v_total_cost numeric(12,2);
  v_unit_cost numeric(12,2);
  v_tailor_advance numeric(12,2) := 0;
  v_entry_number text;
  v_labor_entry_id uuid;
  v_advance_apply_entry_id uuid;
  v_inventory_entry_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'استلام الإنتاج وإنشاء المنتج متاح للكاشير أو المدير فقط';
  END IF;

  IF p_product_payload IS NULL OR jsonb_typeof(p_product_payload) <> 'object' THEN
    RAISE EXCEPTION 'بيانات المنتج غير صالحة';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التصنيع غير موجود';
  END IF;

  IF v_order.tailoring_purpose <> 'PRODUCTION' THEN
    RAISE EXCEPTION 'هذا ليس طلب تصنيع للمخزون';
  END IF;

  IF v_order.tailoring_status <> 'READY_FOR_PICKUP' THEN
    RAISE EXCEPTION 'لا يمكن استلام الإنتاج إلا بعد أن يصبح جاهزاً';
  END IF;

  IF v_order.produced_product_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'تم تحويل هذا الطلب إلى منتج بالفعل';
  END IF;

  v_product_name := trim(COALESCE(p_product_payload ->> 'name', ''));
  v_product_description := NULLIF(trim(COALESCE(p_product_payload ->> 'description', '')), '');
  v_sku := NULLIF(trim(COALESCE(p_product_payload ->> 'sku', '')), '');
  v_barcode := NULLIF(trim(COALESCE(p_product_payload ->> 'barcode', '')), '');
  v_pack_barcode := NULLIF(trim(COALESCE(p_product_payload ->> 'packBarcode', '')), '');
  v_color_name := NULLIF(trim(COALESCE(p_product_payload ->> 'colorName', '')), '');
  v_color_code := NULLIF(trim(COALESCE(p_product_payload ->> 'colorCode', '')), '');
  v_size := NULLIF(trim(COALESCE(p_product_payload ->> 'size', '')), '');

  BEGIN
    v_category_id := NULLIF(p_product_payload ->> 'categoryId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'معرف التصنيف غير صالح';
  END;

  BEGIN
    v_produced_quantity := (p_product_payload ->> 'producedQuantity')::numeric;
    v_selling_price := (p_product_payload ->> 'sellingPrice')::numeric;
    v_min_selling_price := NULLIF(p_product_payload ->> 'minSellingPrice', '')::numeric;
    v_min_stock_level := COALESCE(NULLIF(p_product_payload ->> 'minStockLevel', '')::numeric, 5);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'أحد أرقام المنتج غير صالح';
  END;

  IF v_product_name = '' THEN
    RAISE EXCEPTION 'اسم المنتج مطلوب';
  END IF;

  IF v_produced_quantity IS NULL OR v_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'كمية الإنتاج يجب أن تكون أكبر من صفر';
  END IF;

  IF round(v_produced_quantity, 0) <> v_produced_quantity THEN
    RAISE EXCEPTION 'كمية الإنتاج يجب أن تكون عدداً صحيحاً';
  END IF;

  IF v_selling_price IS NULL OR v_selling_price <= 0 THEN
    RAISE EXCEPTION 'سعر البيع يجب أن يكون أكبر من صفر';
  END IF;

  IF v_min_selling_price IS NOT NULL AND v_min_selling_price < 0 THEN
    RAISE EXCEPTION 'الحد الأدنى لسعر البيع غير صالح';
  END IF;

  IF v_min_selling_price IS NOT NULL AND v_min_selling_price > v_selling_price THEN
    RAISE EXCEPTION 'الحد الأدنى لسعر البيع لا يمكن أن يتجاوز سعر البيع';
  END IF;

  IF v_min_stock_level IS NULL OR v_min_stock_level < 0 THEN
    RAISE EXCEPTION 'الحد الأدنى للمخزون غير صالح';
  END IF;

  IF v_category_id IS NOT NULL THEN
    SELECT id, name
    INTO v_category
    FROM public.categories
    WHERE id = v_category_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'التصنيف المحدد غير موجود';
    END IF;
  END IF;

  v_material_cost := round(COALESCE(v_order.tailoring_fabric_cost, 0), 2);
  v_labor_cost := round(COALESCE(v_order.tailoring_cost, 0), 2);
  v_total_cost := round(v_material_cost + v_labor_cost, 2);

  IF v_total_cost <= 0 THEN
    RAISE EXCEPTION 'لا توجد تكلفة إنتاج قابلة للترحيل';
  END IF;

  v_unit_cost := round(v_total_cost / v_produced_quantity, 2);

  /* ------------------------------------------------------------
     Product is created inside the same transaction as everything else.
  ------------------------------------------------------------ */
  INSERT INTO public.product_templates (
    name,
    description,
    "categoryId",
    "supplierId",
    "hasVariants",
    "purchaseUnit",
    "sellingUnit",
    "conversionFactor",
    images,
    "isActive",
    "isVisible",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    v_product_name,
    v_product_description,
    v_category_id,
    NULL,
    false,
    'قطعة',
    'قطعة',
    1,
    '{}',
    true,
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_product_template_id;

  INSERT INTO public.product_variants (
    "templateId",
    sku,
    barcode,
    "packBarcode",
    "colorName",
    "colorCode",
    size,
    length,
    width,
    "purchasePrice",
    "sellingPrice",
    "minSellingPrice",
    "stockQuantity",
    "minStockLevel",
    images,
    "isDefault",
    "isActive",
    "createdAt",
    "updatedAt",
    "averageCost"
  )
  VALUES (
    v_product_template_id,
    v_sku,
    v_barcode,
    v_pack_barcode,
    v_color_name,
    v_color_code,
    v_size,
    NULL,
    NULL,
    v_unit_cost,
    round(v_selling_price, 2),
    v_min_selling_price,
    round(v_produced_quantity, 2),
    round(v_min_stock_level, 2),
    '{}',
    true,
    true,
    v_now,
    v_now,
    v_unit_cost
  )
  RETURNING id INTO v_product_variant_id;

  /* ------------------------------------------------------------
     Recognize tailor labor.
  ------------------------------------------------------------ */
  IF v_labor_cost > 0 THEN
    v_entry_number :=
      'JE-TLR-PROD-LABOR-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_COST',
      v_labor_cost,
      'إثبات تكلفة خياطة إنتاج ' || v_order.order_number,
      'WORK_IN_PROGRESS',
      'TAILORS_PAYABLE',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_labor_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Apply previous tailor advances.
  ------------------------------------------------------------ */
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_tailor_advance
  FROM public.tailor_commission_payments
  WHERE sales_order_id = p_order_id
    AND payment_type = 'ADVANCE';

  -- المقارنة بالجنيه (الدفعات المقدمة والأجرة كلاهما بالجنيه)
  IF public.tailor_advances_exceed_cost(p_order_id) THEN
    RAISE EXCEPTION 'إجمالي دفعات الخياط المقدمة يتجاوز تكلفة الخياطة للطلب';
  END IF;

  IF v_tailor_advance > 0 THEN
    v_entry_number :=
      'JE-TLR-PROD-ADV-APPLY-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_ADVANCE_APPLICATION',
      v_tailor_advance,
      'تسوية الدفعات المقدمة للخياط مقابل تكلفة إنتاج ' || v_order.order_number,
      'TAILORS_PAYABLE',
      'TAILOR_ADVANCES',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_advance_apply_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Finished product receives full manufacturing cost.
  ------------------------------------------------------------ */
  INSERT INTO public.inventory_movements (
    template_id,
    variant_id,
    sales_order_id,
    movement_type,
    quantity,
    unit_cost,
    reference,
    notes,
    created_by
  )
  VALUES (
    v_product_template_id,
    v_product_variant_id,
    p_order_id,
    'PRODUCTION_RECEIPT',
    round(v_produced_quantity, 2),
    v_unit_cost,
    v_order.order_number,
    'إدخال المنتج النهائي المصنع إلى المخزون',
    p_user_id
  );

  v_entry_number :=
    'JE-TLR-PROD-FINISH-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number,
    entry_type,
    amount,
    description,
    debit_account,
    credit_account,
    branch_id,
    created_by,
    reference,
    sales_order_id
  )
  VALUES (
    v_entry_number,
    'PRODUCTION',
    v_total_cost,
    'إدخال المنتج المصنع إلى المخزون بتكلفة الإنتاج ' || v_order.order_number,
    'INVENTORY',
    'WORK_IN_PROGRESS',
    p_branch_id,
    p_user_id,
    v_order.order_number,
    p_order_id
  )
  RETURNING id INTO v_inventory_entry_id;

  UPDATE public.sales_orders
  SET
    produced_product_template_id = v_product_template_id,
    produced_product_variant_id = v_product_variant_id,
    produced_quantity = round(v_produced_quantity, 2),
    production_total_cost = v_total_cost,
    production_labor_journal_entry_id = v_labor_entry_id,
    production_inventory_journal_entry_id = v_inventory_entry_id,
    tailoring_labor_journal_entry_id = v_labor_entry_id,
    tailoring_status = 'RECEIVED',
    status = 'COMPLETED',
    payment_status = 'UNPAID',
    completed_at = v_now,
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order.order_number,
    'product_template_id', v_product_template_id,
    'product_variant_id', v_product_variant_id,
    'product_name', v_product_name,
    'produced_quantity', v_produced_quantity,
    'production_total_cost', v_total_cost,
    'unit_cost', v_unit_cost,
    'tailoring_cost', v_labor_cost,
    'fabric_cost', v_material_cost,
    'production_labor_journal_entry_id', v_labor_entry_id,
    'tailor_advance_apply_journal_entry_id', v_advance_apply_entry_id,
    'production_inventory_journal_entry_id', v_inventory_entry_id,
    'tailoring_status', 'RECEIVED'
  );
END;
$$;


--
-- Name: convert_tailoring_to_product(uuid, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_category record;
  v_product_template_id uuid;
  v_product_variant_id uuid;
  v_product_name text;
  v_product_description text;
  v_category_id uuid;
  v_sku text;
  v_barcode text;
  v_pack_barcode text;
  v_color_name text;
  v_color_code text;
  v_size text;
  v_produced_quantity numeric(12,2);
  v_selling_price numeric(12,2);
  v_min_selling_price numeric(12,2);
  v_min_stock_level numeric(12,2);
  v_material_cost numeric(12,2);
  v_labor_cost numeric(12,2);
  v_total_cost numeric(12,2);
  v_unit_cost numeric(12,2);
  v_tailor_advance numeric(12,2) := 0;
  v_entry_number text;
  v_labor_entry_id uuid;
  v_advance_apply_entry_id uuid;
  v_inventory_entry_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'تحويل طلب العميل إلى منتج للمخزون متاح للكاشير أو المدير فقط';
  END IF;

  IF p_product_payload IS NULL OR jsonb_typeof(p_product_payload) <> 'object' THEN
    RAISE EXCEPTION 'بيانات المنتج غير صالحة';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF v_order.tailoring_purpose <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'تحويل هذا الطلب متاح فقط لطلبات العملاء';
  END IF;

  IF v_order.tailoring_status NOT IN ('UNDER_TAILORING', 'READY_FOR_PICKUP') THEN
    RAISE EXCEPTION 'لا يمكن تحويل الطلب إلى منتج من الحالة الحالية. يجب أن يكون تحت التفصيل أو جاهزاً';
  END IF;

  IF v_order.produced_product_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'تم تحويل هذا الطلب إلى منتج بالفعل';
  END IF;

  /* Customer rejection after work started is handled by conversion, not by refunding/reversing production. */
  v_product_name := trim(COALESCE(p_product_payload ->> 'name', ''));
  v_product_description := NULLIF(trim(COALESCE(p_product_payload ->> 'description', '')), '');
  v_sku := NULLIF(trim(COALESCE(p_product_payload ->> 'sku', '')), '');
  v_barcode := NULLIF(trim(COALESCE(p_product_payload ->> 'barcode', '')), '');
  v_pack_barcode := NULLIF(trim(COALESCE(p_product_payload ->> 'packBarcode', '')), '');
  v_color_name := NULLIF(trim(COALESCE(p_product_payload ->> 'colorName', '')), '');
  v_color_code := NULLIF(trim(COALESCE(p_product_payload ->> 'colorCode', '')), '');
  v_size := NULLIF(trim(COALESCE(p_product_payload ->> 'size', '')), '');

  BEGIN
    v_category_id := NULLIF(p_product_payload ->> 'categoryId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'معرف التصنيف غير صالح';
  END;

  BEGIN
    v_produced_quantity := (p_product_payload ->> 'producedQuantity')::numeric;
    v_selling_price := (p_product_payload ->> 'sellingPrice')::numeric;
    v_min_selling_price := NULLIF(p_product_payload ->> 'minSellingPrice', '')::numeric;
    v_min_stock_level := COALESCE(NULLIF(p_product_payload ->> 'minStockLevel', '')::numeric, 5);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'أحد أرقام المنتج غير صالح';
  END;

  IF v_product_name = '' THEN
    RAISE EXCEPTION 'اسم المنتج مطلوب';
  END IF;

  IF v_produced_quantity IS NULL OR v_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'كمية الإنتاج يجب أن تكون أكبر من صفر';
  END IF;

  IF round(v_produced_quantity, 0) <> v_produced_quantity THEN
    RAISE EXCEPTION 'كمية الإنتاج يجب أن تكون عدداً صحيحاً';
  END IF;

  IF v_selling_price IS NULL OR v_selling_price <= 0 THEN
    RAISE EXCEPTION 'سعر البيع يجب أن يكون أكبر من صفر';
  END IF;

  IF v_min_selling_price IS NOT NULL AND v_min_selling_price < 0 THEN
    RAISE EXCEPTION 'الحد الأدنى لسعر البيع غير صالح';
  END IF;

  IF v_min_selling_price IS NOT NULL AND v_min_selling_price > v_selling_price THEN
    RAISE EXCEPTION 'الحد الأدنى لسعر البيع لا يمكن أن يتجاوز سعر البيع';
  END IF;

  IF v_min_stock_level IS NULL OR v_min_stock_level < 0 THEN
    RAISE EXCEPTION 'الحد الأدنى للمخزون غير صالح';
  END IF;

  IF v_category_id IS NOT NULL THEN
    SELECT id, name
    INTO v_category
    FROM public.categories
    WHERE id = v_category_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'التصنيف المحدد غير موجود';
    END IF;
  END IF;

  v_material_cost := round(COALESCE(v_order.tailoring_fabric_cost, 0), 2);
  v_labor_cost := round(COALESCE(v_order.tailoring_cost, 0), 2);
  v_total_cost := round(v_material_cost + v_labor_cost, 2);

  IF v_total_cost <= 0 THEN
    RAISE EXCEPTION 'لا توجد تكلفة إنتاج قابلة للترحيل';
  END IF;

  v_unit_cost := round(v_total_cost / v_produced_quantity, 2);

  /* ------------------------------------------------------------
     Product is created inside the same transaction as everything else.
  ------------------------------------------------------------ */
  INSERT INTO public.product_templates (
    name,
    description,
    "categoryId",
    "supplierId",
    "hasVariants",
    "purchaseUnit",
    "sellingUnit",
    "conversionFactor",
    images,
    "isActive",
    "isVisible",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    v_product_name,
    v_product_description,
    v_category_id,
    NULL,
    false,
    'قطعة',
    'قطعة',
    1,
    '{}',
    true,
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_product_template_id;

  INSERT INTO public.product_variants (
    "templateId",
    sku,
    barcode,
    "packBarcode",
    "colorName",
    "colorCode",
    size,
    length,
    width,
    "purchasePrice",
    "sellingPrice",
    "minSellingPrice",
    "stockQuantity",
    "minStockLevel",
    images,
    "isDefault",
    "isActive",
    "createdAt",
    "updatedAt",
    "averageCost"
  )
  VALUES (
    v_product_template_id,
    v_sku,
    v_barcode,
    v_pack_barcode,
    v_color_name,
    v_color_code,
    v_size,
    NULL,
    NULL,
    v_unit_cost,
    round(v_selling_price, 2),
    v_min_selling_price,
    round(v_produced_quantity, 2),
    round(v_min_stock_level, 2),
    '{}',
    true,
    true,
    v_now,
    v_now,
    v_unit_cost
  )
  RETURNING id INTO v_product_variant_id;

  /* ------------------------------------------------------------
     Recognize tailor labor.
  ------------------------------------------------------------ */
  IF v_labor_cost > 0 THEN
    v_entry_number :=
      'JE-TLR-CONVERT-LABOR-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_COST',
      v_labor_cost,
      'إثبات تكلفة خياطة الطلب المحول إلى منتج ' || v_order.order_number,
      'WORK_IN_PROGRESS',
      'TAILORS_PAYABLE',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_labor_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Apply previous tailor advances.
  ------------------------------------------------------------ */
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_tailor_advance
  FROM public.tailor_commission_payments
  WHERE sales_order_id = p_order_id
    AND payment_type = 'ADVANCE';

  -- المقارنة بالجنيه (الدفعات المقدمة والأجرة كلاهما بالجنيه)
  IF public.tailor_advances_exceed_cost(p_order_id) THEN
    RAISE EXCEPTION 'إجمالي دفعات الخياط المقدمة يتجاوز تكلفة الخياطة للطلب';
  END IF;

  IF v_tailor_advance > 0 THEN
    v_entry_number :=
      'JE-TLR-CONVERT-ADV-APPLY-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.journal_entries (
      entry_number,
      entry_type,
      amount,
      description,
      debit_account,
      credit_account,
      branch_id,
      created_by,
      reference,
      sales_order_id
    )
    VALUES (
      v_entry_number,
      'TAILOR_ADVANCE_APPLICATION',
      v_tailor_advance,
      'تسوية الدفعات المقدمة للخياط مقابل تكلفة الطلب المحول إلى منتج ' || v_order.order_number,
      'TAILORS_PAYABLE',
      'TAILOR_ADVANCES',
      p_branch_id,
      p_user_id,
      v_order.order_number,
      p_order_id
    )
    RETURNING id INTO v_advance_apply_entry_id;
  END IF;

  /* ------------------------------------------------------------
     Finished product receives full manufacturing cost.
  ------------------------------------------------------------ */
  INSERT INTO public.inventory_movements (
    template_id,
    variant_id,
    sales_order_id,
    movement_type,
    quantity,
    unit_cost,
    reference,
    notes,
    created_by
  )
  VALUES (
    v_product_template_id,
    v_product_variant_id,
    p_order_id,
    'PRODUCTION_RECEIPT',
    round(v_produced_quantity, 2),
    v_unit_cost,
    v_order.order_number,
    'إدخال المنتج الناتج من تحويل طلب العميل إلى المخزون',
    p_user_id
  );

  v_entry_number :=
    'JE-TLR-CONVERT-FINISH-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number,
    entry_type,
    amount,
    description,
    debit_account,
    credit_account,
    branch_id,
    created_by,
    reference,
    sales_order_id
  )
  VALUES (
    v_entry_number,
    'PRODUCTION',
    v_total_cost,
    'إدخال المنتج الناتج من تحويل الطلب إلى المخزون بتكلفة التصنيع ' || v_order.order_number,
    'INVENTORY',
    'WORK_IN_PROGRESS',
    p_branch_id,
    p_user_id,
    v_order.order_number,
    p_order_id
  )
  RETURNING id INTO v_inventory_entry_id;

  UPDATE public.sales_orders
  SET
    produced_product_template_id = v_product_template_id,
    produced_product_variant_id = v_product_variant_id,
    produced_quantity = round(v_produced_quantity, 2),
    production_total_cost = v_total_cost,
    production_labor_journal_entry_id = v_labor_entry_id,
    production_inventory_journal_entry_id = v_inventory_entry_id,
    tailoring_labor_journal_entry_id = v_labor_entry_id,
    tailoring_status = 'CANCELLED',
    status = 'CANCELLED',
    cancellation_reason = 'تم تحويل الطلب إلى منتج للمخزون بعد رفض العميل',
    converted_to_product_at = v_now,
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order.order_number,
    'product_template_id', v_product_template_id,
    'product_variant_id', v_product_variant_id,
    'product_name', v_product_name,
    'produced_quantity', v_produced_quantity,
    'production_total_cost', v_total_cost,
    'unit_cost', v_unit_cost,
    'tailoring_cost', v_labor_cost,
    'fabric_cost', v_material_cost,
    'production_labor_journal_entry_id', v_labor_entry_id,
    'tailoring_labor_journal_entry_id', v_labor_entry_id,
    'tailor_advance_apply_journal_entry_id', v_advance_apply_entry_id,
    'production_inventory_journal_entry_id', v_inventory_entry_id,
    'converted_to_product_at', v_now,
    'tailoring_status', 'CANCELLED',
    'cancellation_reason', 'تم تحويل الطلب إلى منتج للمخزون بعد رفض العميل'
  );
END;
$$;


--
-- Name: create_asset_with_journal_entry(uuid, uuid, text, text, numeric, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_asset_with_journal_entry(p_branch_id uuid, p_created_by uuid, p_name text, p_category text, p_purchase_value numeric, p_purchase_date text, p_payment_method text, p_reference text, p_notes text, p_entry_number text, p_currency text DEFAULT 'USD'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_asset_id uuid;
  v_entry_id uuid;
  v_credit_account text;
  v_rate numeric(14,4);
  v_value_usd numeric(14,2);
  v_balance numeric(14,2);
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

  v_credit_account := p_payment_method;

  IF p_currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
    v_value_usd := round(p_purchase_value / v_rate, 2);
  ELSE
    v_rate := NULL;
    v_value_usd := round(p_purchase_value, 2);
  END IF;

  v_balance := public.get_account_balance(p_branch_id, v_credit_account, p_currency);

  IF p_purchase_value > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (%). الرصيد الحالي: %',
      CASE WHEN v_credit_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      CASE WHEN p_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END,
      v_balance;
  END IF;

  INSERT INTO public.assets (
    branch_id, created_by, name, category, purchase_value, purchase_date,
    payment_method, reference, notes, currency, exchange_rate_used, purchase_value_usd
  ) VALUES (
    p_branch_id, p_created_by, p_name, p_category, p_purchase_value, p_purchase_date::date,
    p_payment_method, p_reference, p_notes, p_currency, v_rate, v_value_usd
  )
  RETURNING id INTO v_asset_id;

  INSERT INTO public.journal_entries (
    branch_id, created_by, entry_number, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    p_branch_id, p_created_by, p_entry_number, 'ASSET', p_purchase_value,
    p_currency, v_rate, v_value_usd,
    'ASSETS', v_credit_account, p_reference, 'شراء أصل: ' || p_name
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'asset_id', v_asset_id,
    'entry_id', v_entry_id,
    'purchase_value_usd', v_value_usd,
    'exchange_rate_used', v_rate
  );
END;
$$;


--
-- Name: create_product(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product(p_payload jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  template_id uuid;
  variants_json jsonb;
  variant jsonb;
  variant_count integer;
  default_count integer;

  generated_sku text;
  generated_barcode text;
begin
  variants_json := p_payload -> 'variants';

  if variants_json is null
     or jsonb_typeof(variants_json) <> 'array' then
    raise exception
      using
        errcode = '22023',
        message = 'يجب إدخال Variants صحيحة';
  end if;

  variant_count := jsonb_array_length(variants_json);

  if variant_count < 1 then
    raise exception
      using
        errcode = '22023',
        message = 'يجب أن يحتوي المنتج على Variant واحد على الأقل';
  end if;

  -- أكثر من Variant:
  -- يجب أن يوجد Default واحد فقط.
  if variant_count > 1 then

    default_count := (
      select count(*)
      from jsonb_array_elements(variants_json) as v
      where coalesce((v ->> 'isDefault')::boolean, false) = true
    );

    if default_count <> 1 then
      raise exception
        using
          errcode = '22023',
          message = 'يجب تحديد Variant افتراضي واحد فقط';
    end if;
  end if;


  -- hasVariants مشتق من عدد الـ Variants
  -- وليس من payload.
  insert into public.product_templates (
    name,
    description,
    "categoryId",
    "supplierId",
    "hasVariants",
    "purchaseUnit",
    "sellingUnit",
    "conversionFactor",
    images,
    "isActive",
    "isVisible"
  )
  values (
    p_payload ->> 'name',
    p_payload ->> 'description',
    (p_payload ->> 'categoryId')::uuid,
    (p_payload ->> 'supplierId')::uuid,
    variant_count > 1,
    p_payload ->> 'purchaseUnit',
    p_payload ->> 'sellingUnit',
    coalesce((p_payload ->> 'conversionFactor')::numeric, 1),
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(p_payload -> 'images', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    coalesce((p_payload ->> 'isActive')::boolean, true),
    coalesce((p_payload ->> 'isVisible')::boolean, true)
  )
  returning id into template_id;


  -- إدخال الـ Variants
  for variant in
    select value
    from jsonb_array_elements(variants_json)
  loop

    generated_sku :=
      nullif(trim(variant ->> 'sku'), '');

    if generated_sku is null then
      generated_sku := public.generate_product_sku();
    end if;


    generated_barcode :=
      nullif(trim(variant ->> 'barcode'), '');

    if generated_barcode is null then
      generated_barcode := public.generate_product_barcode();
    end if;


    insert into public.product_variants (
      "templateId",
      sku,
      barcode,
      "packBarcode",
      "colorName",
      "colorCode",
      size,
      length,
      width,
      "purchasePrice",
      "sellingPrice",
      "minSellingPrice",
      "stockQuantity",
      "minStockLevel",
      images,
      "isDefault",
      "isActive"
    )
    values (
      template_id,

      generated_sku,
      generated_barcode,

      nullif(trim(variant ->> 'packBarcode'), ''),
      nullif(trim(variant ->> 'colorName'), ''),
      nullif(trim(variant ->> 'colorCode'), ''),
      nullif(trim(variant ->> 'size'), ''),

      (variant ->> 'length')::numeric,
      (variant ->> 'width')::numeric,

      (variant ->> 'purchasePrice')::numeric,
      (variant ->> 'sellingPrice')::numeric,
      (variant ->> 'minSellingPrice')::numeric,

      -- لا نستقبل stockQuantity من المستخدم.
      0,

      coalesce(
        (variant ->> 'minStockLevel')::numeric,
        5
      ),

      coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(variant -> 'images', '[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),

      -- المنتج الفردي:
      -- الـ Variant الوحيد Default تلقائيًا.
      case
        when variant_count = 1 then true
        else coalesce(
          (variant ->> 'isDefault')::boolean,
          false
        )
      end,

      coalesce(
        (variant ->> 'isActive')::boolean,
        true
      )
    );

  end loop;


  return template_id;

exception
  when others then
    raise;
end;
$$;


--
-- Name: create_tailoring_order(uuid, uuid, uuid, text, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, numeric, text, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tailoring_order(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_tailoring_purpose text, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_deposit_amount numeric, p_tailoring_cost numeric, p_payment_method text, p_customer_advance_source_order_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_notes text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_now timestamptz := now();
  v_user record;
  v_tailor record;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_year text;
  v_sequence integer;
  v_measurement_meters numeric(12,2);
  v_max_fabric_quantity numeric(12,2);
  v_fabric record;
  v_fabric_unit_cost numeric(12,2) := 0;
  v_fabric_cost numeric(12,2) := 0;
  v_entry_number text;
  v_payment_account text;
  v_customer_advance_entry_id uuid;
  v_clean_whatsapp text;
  v_tlr_rate numeric(14,4);
  v_source_order_customer_id uuid;
  v_source_order_purpose text;
  v_source_order_status text;
  v_source_available_advance numeric(12,2) := 0;
  v_source_direct_advance numeric(12,2) := 0;
  v_source_transfer_in numeric(12,2) := 0;
  v_source_transfer_out numeric(12,2) := 0;
  v_source_refunded numeric(12,2) := 0;
  v_transfer_amount numeric(12,2) := 0;
  v_source_payment_method text;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'إنشاء طلبات التفصيل متاح للكاشير أو المدير فقط';
  END IF;

  IF p_tailor_id IS NULL THEN
    RAISE EXCEPTION 'الخياط المسؤول عن الطلب مطلوب';
  END IF;

  SELECT id, name, phone, role, "branchId" AS branch_id
  INTO v_tailor
  FROM public.users
  WHERE id = p_tailor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخياط المحدد غير موجود';
  END IF;

  IF v_tailor.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الخياط لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_tailor.role::text, '')) <> 'tailor' THEN
    RAISE EXCEPTION 'المستخدم المحدد ليس حساب خياط';
  END IF;

  IF p_tailoring_purpose NOT IN ('CUSTOMER', 'PRODUCTION') THEN
    RAISE EXCEPTION 'غرض طلب التفصيل غير صالح';
  END IF;

  IF COALESCE(trim(p_tailoring_item_name), '') = '' THEN
    RAISE EXCEPTION 'اسم العمل أو الطلب مطلوب';
  END IF;

  IF char_length(trim(p_tailoring_item_name)) > 255 THEN
    RAISE EXCEPTION 'اسم العمل أو الطلب طويل جدًا';
  END IF;

  IF p_tailoring_item_description IS NOT NULL AND char_length(trim(p_tailoring_item_description)) > 2000 THEN
    RAISE EXCEPTION 'وصف العمل طويل جدًا';
  END IF;

  IF p_intake_date IS NULL THEN
    RAISE EXCEPTION 'تاريخ استلام الطلب مطلوب';
  END IF;

  IF p_expected_delivery_date IS NULL THEN
    RAISE EXCEPTION 'تاريخ التسليم المتوقع مطلوب';
  END IF;

  IF p_expected_delivery_date < p_intake_date THEN
    RAISE EXCEPTION 'تاريخ التسليم لا يمكن أن يسبق تاريخ الاستلام';
  END IF;

  IF p_tailoring_cost IS NULL OR p_tailoring_cost <= 0 THEN
    RAISE EXCEPTION 'تكلفة الخياطة مطلوبة ويجب أن تكون أكبر من صفر';
  END IF;

  IF round(p_tailoring_cost, 2) <> p_tailoring_cost THEN
    RAISE EXCEPTION 'تكلفة الخياطة يجب ألا تتجاوز منزلتين عشريتين';
  END IF;

  -- أجرة الخياط مدخلة بالجنيه؛ تتحول لدولار بسعر يوم إنشاء الطلب
  v_tlr_rate := public.require_exchange_rate(p_branch_id);

  v_measurement_meters := public.calculate_tailoring_measurement_meters(p_measurements);
  v_max_fabric_quantity := round(v_measurement_meters + 1, 2);

  /* ------------------------------------------------------------
     Customer-only values
  ------------------------------------------------------------ */
  IF p_tailoring_purpose = 'CUSTOMER' THEN
    IF p_customer_advance_source_order_id IS NOT NULL THEN
      SELECT customer_id, tailoring_purpose, tailoring_status
      INTO v_source_order_customer_id, v_source_order_purpose, v_source_order_status
      FROM public.sales_orders
      WHERE id = p_customer_advance_source_order_id
        AND branch_id = p_branch_id
        AND order_type = 'TAILORING'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب المصدر المستخدم لنقل العربون غير موجود';
      END IF;

      IF v_source_order_purpose <> 'CUSTOMER' THEN
        RAISE EXCEPTION 'لا يمكن نقل عربون من طلب تصنيع للمخزون';
      END IF;

      IF v_source_order_status NOT IN ('CANCELLED', 'CONVERTED_TO_PRODUCT') THEN
        RAISE EXCEPTION 'لا يمكن نقل العربون إلا من طلب عميل ملغي أو محوّل إلى منتج';
      END IF;

      SELECT round(COALESCE(sum(amount), 0), 2)
      INTO v_source_direct_advance
      FROM public.sales_order_payments
      WHERE sales_order_id = p_customer_advance_source_order_id;

      SELECT round(COALESCE(sum(amount), 0), 2)
      INTO v_source_transfer_in
      FROM public.tailoring_customer_advance_transfers
      WHERE to_order_id = p_customer_advance_source_order_id;

      SELECT round(COALESCE(sum(amount), 0), 2)
      INTO v_source_transfer_out
      FROM public.tailoring_customer_advance_transfers
      WHERE from_order_id = p_customer_advance_source_order_id;

      SELECT round(COALESCE(sum(amount), 0), 2)
      INTO v_source_refunded
      FROM public.tailoring_customer_advance_refunds
      WHERE sales_order_id = p_customer_advance_source_order_id;

      v_source_available_advance := round(
        v_source_direct_advance +
        v_source_transfer_in -
        v_source_transfer_out -
        v_source_refunded,
        2
      );

      IF v_source_available_advance <= 0 THEN
        RAISE EXCEPTION 'لا يوجد عربون متاح للنقل من الطلب المصدر';
      END IF;

      SELECT payment_method
      INTO v_source_payment_method
      FROM public.sales_order_payments
      WHERE sales_order_id = p_customer_advance_source_order_id
      ORDER BY payment_date ASC
      LIMIT 1;

      v_transfer_amount := round(p_total_amount * 0.50, 2);

      IF v_source_available_advance < v_transfer_amount THEN
        RAISE EXCEPTION
          'عربون الطلب المصدر غير كافٍ لتغطية عربون الطلب الجديد. المتاح: % ر.س، المطلوب: % ر.س',
          v_source_available_advance,
          v_transfer_amount;
      END IF;
    END IF;
    IF COALESCE(trim(p_customer_name), '') = '' THEN
      RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;

    IF COALESCE(trim(p_customer_whatsapp), '') = '' THEN
      RAISE EXCEPTION 'رقم واتساب العميل مطلوب';
    END IF;

    v_clean_whatsapp := public.normalize_whatsapp_number(p_customer_whatsapp);

    IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
      RAISE EXCEPTION 'المبلغ الإجمالي يجب أن يكون أكبر من صفر';
    END IF;

    IF round(p_total_amount, 2) <> p_total_amount THEN
      RAISE EXCEPTION 'المبلغ الإجمالي يجب ألا يتجاوز منزلتين عشريتين';
    END IF;

    IF p_customer_advance_source_order_id IS NULL THEN
      IF p_deposit_amount IS NULL OR p_deposit_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ العربون يجب أن يكون أكبر من صفر';
      END IF;

      IF round(p_deposit_amount, 2) <> round(p_total_amount * 0.50, 2) THEN
        RAISE EXCEPTION 'عربون طلب التفصيل يجب أن يساوي 50%% من المبلغ الإجمالي';
      END IF;

      IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER') THEN
        RAISE EXCEPTION 'طريقة دفع العربون غير صالحة';
      END IF;
    ELSE
      IF p_payment_method IS NOT NULL THEN
        RAISE EXCEPTION 'الطلب البديل لا يحصّل دفعة جديدة عند الإنشاء';
      END IF;

      p_deposit_amount := v_transfer_amount;
    END IF;

    INSERT INTO public.customers (
      branch_id,
      name,
      whatsapp_number,
      measurements,
      updated_at
    )
    VALUES (
      p_branch_id,
      trim(p_customer_name),
      v_clean_whatsapp,
      p_measurements,
      v_now
    )
    ON CONFLICT (branch_id, whatsapp_number)
    DO UPDATE SET
      name = EXCLUDED.name,
      measurements = EXCLUDED.measurements,
      updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_customer_id;

    IF p_customer_advance_source_order_id IS NOT NULL
       THEN
      IF v_source_order_customer_id IS DISTINCT FROM v_customer_id THEN
        RAISE EXCEPTION 'الطلب الجديد يجب أن يكون لنفس العميل الموجود في الطلب المصدر';
      END IF;
    END IF;
  ELSE
    IF COALESCE(trim(p_customer_name), '') <> ''
       OR COALESCE(trim(p_customer_whatsapp), '') <> '' THEN
      RAISE EXCEPTION 'طلب تصنيع المخزون لا يحتوي على بيانات عميل';
    END IF;

    IF COALESCE(p_total_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'التصنيع للمخزون لا يحتوي على سعر بيع للعميل';
    END IF;

    IF COALESCE(p_deposit_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'التصنيع للمخزون لا يحتوي على عربون';
    END IF;

    IF p_payment_method IS NOT NULL AND trim(p_payment_method) <> '' THEN
      RAISE EXCEPTION 'التصنيع للمخزون لا يحتوي على دفعة من عميل';
    END IF;

    IF p_fabric_variant_id IS NULL THEN
      RAISE EXCEPTION 'طلب تصنيع المنتج للمخزون يجب أن يستخدم قماشًا من مخزون المحل';
    END IF;
  END IF;

  /* ------------------------------------------------------------
     Snapshot fabric cost NOW, but DO NOT touch inventory yet.
  ------------------------------------------------------------ */
  IF p_fabric_variant_id IS NOT NULL THEN
    IF p_fabric_quantity IS NULL OR p_fabric_quantity <= 0 THEN
      RAISE EXCEPTION 'كمية القماش يجب أن تكون أكبر من صفر';
    END IF;

    IF round(p_fabric_quantity, 2) <> p_fabric_quantity THEN
      RAISE EXCEPTION 'كمية القماش يجب ألا تتجاوز منزلتين عشريتين';
    END IF;

    IF p_fabric_quantity < v_measurement_meters THEN
      RAISE EXCEPTION
        'كمية القماش لا تقل عن مجموع المقاسات: % متر',
        v_measurement_meters;
    END IF;

    IF p_fabric_quantity > v_max_fabric_quantity THEN
      RAISE EXCEPTION
        'كمية القماش تتجاوز الحد المسموح. مجموع المقاسات: % متر، والحد الأقصى: % متر',
        v_measurement_meters,
        v_max_fabric_quantity;
    END IF;

    SELECT
      v.id,
      v."templateId",
      v."averageCost",
      v."purchasePrice",
      v."stockQuantity",
      v."isActive" AS variant_active,
      pt."isActive" AS template_active,
      pt."conversionFactor"
    INTO v_fabric
    FROM public.product_variants v
    INNER JOIN public.product_templates pt
      ON pt.id = v."templateId"
    WHERE v.id = p_fabric_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'القماش المحدد غير موجود';
    END IF;

    IF NOT v_fabric.variant_active OR NOT v_fabric.template_active THEN
      RAISE EXCEPTION 'القماش المحدد غير نشط';
    END IF;

    IF COALESCE(v_fabric."stockQuantity", 0) < p_fabric_quantity THEN
      RAISE EXCEPTION
        'كمية القماش الحالية غير كافية. المتاح الآن: %',
        COALESCE(v_fabric."stockQuantity", 0);
    END IF;

    v_fabric_unit_cost := COALESCE(
      NULLIF(v_fabric."averageCost", 0),
      round(
        COALESCE(v_fabric."purchasePrice", 0) /
        COALESCE(NULLIF(v_fabric."conversionFactor", 0), 1),
        2
      ),
      0
    );

    v_fabric_cost := round(p_fabric_quantity * v_fabric_unit_cost, 2);
  END IF;

  v_year := extract(year from v_now)::text;

  PERFORM pg_advisory_xact_lock(
    hashtext('tailoring-invoice-' || v_year)
  );

  SELECT
    COALESCE(
      MAX(
        CASE
          WHEN substring(order_number FROM 10) ~ '^[0-9]+$'
          THEN substring(order_number FROM 10)::integer
          ELSE 0
        END
      ),
      0
    ) + 1
  INTO v_sequence
  FROM public.sales_orders
  WHERE order_number LIKE 'TLR-' || v_year || '-%';

  v_order_number :=
    'TLR-' || v_year || '-' || lpad(v_sequence::text, 6, '0');

  INSERT INTO public.sales_orders (
    order_number,
    branch_id,
    cashier_id,
    tailoring_item_name,
    tailoring_item_description,
    order_type,
    tailoring_purpose,
    customer_id,
    tailor_id,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    payment_method,
    payment_status,
    status,
    notes,
    tailoring_status,
    intake_date,
    expected_delivery_date,
    measurements,
    fabric_variant_id,
    fabric_quantity,
    tailoring_cost,
    tailoring_cost_sdg,
    exchange_rate_used,
    tailoring_fabric_cost,
    updated_at
  )
  VALUES (
    v_order_number,
    p_branch_id,
    p_user_id,
    trim(p_tailoring_item_name),
    NULLIF(trim(p_tailoring_item_description), ''),
    'TAILORING',
    p_tailoring_purpose,
    v_customer_id,
    p_tailor_id,
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(p_total_amount, 2) ELSE 0 END,
    0,
    0,
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(p_total_amount, 2) ELSE 0 END,
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN COALESCE(CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_source_payment_method ELSE p_payment_method END, 'CASH') ELSE 'CASH' END,
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN CASE WHEN (p_customer_advance_source_order_id IS NOT NULL AND v_transfer_amount >= round(p_total_amount, 2)) THEN 'PAID' ELSE 'PARTIAL' END ELSE 'UNPAID' END,
    'PENDING',
    NULLIF(trim(p_notes), ''),
    'NEW',
    p_intake_date,
    p_expected_delivery_date,
    p_measurements,
    p_fabric_variant_id,
    CASE WHEN p_fabric_variant_id IS NULL THEN NULL ELSE round(p_fabric_quantity, 2) END,
    round(p_tailoring_cost / v_tlr_rate, 2),
    round(p_tailoring_cost, 2),
    v_tlr_rate,
    round(v_fabric_cost, 2),
    v_now
  )
  RETURNING id INTO v_order_id;

  /* ------------------------------------------------------------
     Customer deposit = liability, not revenue.
     A replacement order receives an internal advance allocation
     instead of another cash/bank payment. The source balance must
     cover the full 50%% deposit of the new order.
  ------------------------------------------------------------ */
  IF p_tailoring_purpose = 'CUSTOMER' THEN
    IF p_customer_advance_source_order_id IS NOT NULL THEN
      INSERT INTO public.tailoring_customer_advance_transfers (
        from_order_id,
        to_order_id,
        amount,
        created_by,
        created_at,
        notes
      )
      VALUES (
        p_customer_advance_source_order_id,
        v_order_id,
        v_transfer_amount,
        p_user_id,
        v_now,
        'نقل رصيد عربون من الطلب الملغي إلى طلب بديل'
      );
    ELSE
      v_payment_account := CASE
        WHEN p_payment_method = 'CASH' THEN 'CASH'
        ELSE 'BANK'
      END;

      v_entry_number :=
        'JE-TLR-CUST-ADV-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

      INSERT INTO public.journal_entries (
        entry_number,
        entry_type,
        amount,
        description,
        debit_account,
        credit_account,
        branch_id,
        created_by,
        reference,
        sales_order_id
      )
      VALUES (
        v_entry_number,
        'CUSTOMER_ADVANCE',
        round(p_deposit_amount, 2),
        'استلام عربون من العميل لطلب تفصيل ' || v_order_number,
        v_payment_account,
        'CUSTOMER_ADVANCES',
        p_branch_id,
        p_user_id,
        v_order_number,
        v_order_id
      )
      RETURNING id INTO v_customer_advance_entry_id;

      INSERT INTO public.sales_order_payments (
        sales_order_id,
        amount,
        payment_date,
        payment_method,
        created_by,
        journal_entry_id
      )
      VALUES (
        v_order_id,
        round(p_deposit_amount, 2),
        v_now,
        p_payment_method,
        p_user_id,
        v_customer_advance_entry_id
      );

      UPDATE public.sales_orders
      SET
        customer_advance_journal_entry_id = v_customer_advance_entry_id,
        updated_at = v_now
      WHERE id = v_order_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'tailoring_purpose', p_tailoring_purpose,
    'customer_id', v_customer_id,
    'cashier_id', p_user_id,
    'tailor_id', p_tailor_id,
    'total_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(p_total_amount, 2) ELSE 0 END,
    'deposit_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_transfer_amount ELSE p_deposit_amount END, 2) ELSE 0 END,
    'remaining_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(p_total_amount - CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_transfer_amount ELSE p_deposit_amount END, 2) ELSE 0 END,
    'tailoring_cost', round(p_tailoring_cost / v_tlr_rate, 2),
    'tailoring_cost_sdg', round(p_tailoring_cost, 2),
    'exchange_rate_used', v_tlr_rate,
    'tailoring_fabric_cost', round(v_fabric_cost, 2),
    'payment_method', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN COALESCE(CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_source_payment_method ELSE p_payment_method END, 'CASH') ELSE NULL END,
    'customer_advance_source_order_id', p_customer_advance_source_order_id,
    'customer_advance_transferred_amount', CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_transfer_amount ELSE 0 END,
    'tailoring_status', 'NEW',
    'measurement_meters', v_measurement_meters,
    'max_fabric_quantity', v_max_fabric_quantity
  );
END;
$_$;


--
-- Name: create_tailoring_overdue_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tailoring_overdue_notifications(p_branch_id uuid) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.generate_overdue_tailoring_notifications(p_branch_id);
$$;


--
-- Name: exchange_currency(uuid, uuid, text, text, numeric, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exchange_currency(p_branch_id uuid, p_user_id uuid, p_from_currency text, p_from_account text, p_from_amount numeric, p_to_account text, p_to_amount numeric, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_user record;
  v_to_currency text;
  v_system_rate numeric(14,4);
  v_actual_rate numeric(14,4);
  v_from_usd numeric(14,2);
  v_to_usd numeric(14,2);
  v_balance numeric(14,2);
  v_ref text;
  v_out_id uuid;
  v_in_id uuid;
BEGIN
  SELECT id, role, "branchId" AS branch_id INTO v_user
  FROM public.users WHERE id = p_user_id;

  IF NOT FOUND OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تحويل العملة متاح للمدير فقط';
  END IF;

  IF p_from_currency NOT IN ('USD', 'SDG') THEN
    RAISE EXCEPTION 'العملة غير صالحة';
  END IF;

  IF p_from_account NOT IN ('CASH', 'BANK') OR p_to_account NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'الحساب غير صالح';
  END IF;

  IF p_from_amount IS NULL OR p_from_amount <= 0 OR p_to_amount IS NULL OR p_to_amount <= 0 THEN
    RAISE EXCEPTION 'المبالغ يجب أن تكون أكبر من صفر';
  END IF;

  v_to_currency := CASE WHEN p_from_currency = 'SDG' THEN 'USD' ELSE 'SDG' END;
  v_system_rate := public.require_exchange_rate(p_branch_id);

  v_balance := public.get_account_balance(p_branch_id, p_from_account, p_from_currency);

  IF p_from_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ. المتاح: % %', v_balance,
      CASE WHEN p_from_currency = 'SDG' THEN 'ج.س' ELSE '$' END;
  END IF;

  -- السعر الفعلي للعملية (جنيه لكل دولار)
  v_actual_rate := CASE
    WHEN p_from_currency = 'SDG' THEN round(p_from_amount / p_to_amount, 4)
    ELSE round(p_to_amount / p_from_amount, 4)
  END;

  -- الطرف الجنيهي بيتقيّم بالسعر المسجّل في النظام، والطرف الدولاري
  -- بقيمته الحقيقية، والفرق يفضل في CURRENCY_EXCHANGE كربح/خسارة
  IF p_from_currency = 'SDG' THEN
    v_from_usd := round(p_from_amount / v_system_rate, 2);
    v_to_usd := round(p_to_amount, 2);
  ELSE
    v_from_usd := round(p_from_amount, 2);
    v_to_usd := round(p_to_amount / v_system_rate, 2);
  END IF;

  v_ref := 'FX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, branch_id, created_by, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    v_ref || '-OUT', p_branch_id, p_user_id, 'CURRENCY_EXCHANGE', round(p_from_amount, 2),
    p_from_currency, CASE WHEN p_from_currency = 'SDG' THEN v_system_rate END, v_from_usd,
    'CURRENCY_EXCHANGE', p_from_account, v_ref,
    'تحويل عملة (خروج ' || p_from_currency || ') بسعر فعلي ' || v_actual_rate
      || COALESCE(' - ' || NULLIF(trim(p_notes), ''), '')
  )
  RETURNING id INTO v_out_id;

  INSERT INTO public.journal_entries (
    entry_number, branch_id, created_by, entry_type, amount,
    currency, exchange_rate_used, amount_usd,
    debit_account, credit_account, reference, description
  ) VALUES (
    v_ref || '-IN', p_branch_id, p_user_id, 'CURRENCY_EXCHANGE', round(p_to_amount, 2),
    v_to_currency, CASE WHEN v_to_currency = 'SDG' THEN v_system_rate END, v_to_usd,
    p_to_account, 'CURRENCY_EXCHANGE', v_ref,
    'تحويل عملة (دخول ' || v_to_currency || ') بسعر فعلي ' || v_actual_rate
      || COALESCE(' - ' || NULLIF(trim(p_notes), ''), '')
  )
  RETURNING id INTO v_in_id;

  RETURN jsonb_build_object(
    'reference', v_ref,
    'actual_rate', v_actual_rate,
    'system_rate', v_system_rate,
    'fx_result_usd', round(v_to_usd - v_from_usd, 2),
    'out_entry_id', v_out_id,
    'in_entry_id', v_in_id
  );
END;
$_$;


--
-- Name: generate_overdue_tailoring_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_overdue_tailoring_notifications(p_branch_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order record;
  v_count integer := 0;
  v_today date := (now() AT TIME ZONE 'Africa/Khartoum')::date;
BEGIN
  FOR v_order IN
    SELECT so.id, so.order_number, so.expected_delivery_date,
           so.tailoring_status, so.tailoring_purpose,
           c.name AS customer_name
    FROM public.sales_orders so
    LEFT JOIN public.customers c ON c.id = so.customer_id
    WHERE so.branch_id = p_branch_id
      AND so.order_type = 'TAILORING'
      AND so.tailoring_status IN ('NEW', 'UNDER_TAILORING', 'READY_FOR_PICKUP')
      AND so.expected_delivery_date IS NOT NULL
      AND so.expected_delivery_date < v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.metadata ->> 'key' = 'ORDER_DELAY:' || so.id::text
      )
  LOOP
    INSERT INTO public.notifications (title, message, type, link, metadata)
    VALUES (
      CASE WHEN v_order.tailoring_status = 'READY_FOR_PICKUP'
        THEN 'طلب جاهز ولم يُستلم' ELSE 'طلب تفصيل متأخر' END,
      'الطلب ' || v_order.order_number
        || COALESCE(' (' || v_order.customer_name || ')', '')
        || ' كان موعد تسليمه ' || to_char(v_order.expected_delivery_date, 'YYYY-MM-DD')
        || ' — متأخر ' || (v_today - v_order.expected_delivery_date) || ' يوم.',
      'ORDER_DELAY',
      '/dashboard/tailoring/' || v_order.id::text,
      jsonb_build_object('key', 'ORDER_DELAY:' || v_order.id::text, 'sales_order_id', v_order.id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: generate_product_barcode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_product_barcode() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  base_code text;
  candidate text;
  digit_sum integer;
  digit integer;
  check_digit integer;
  i integer;
begin
  loop
    -- 12 digits يبدأ بـ 20 للاستخدام الداخلي.
    base_code :=
      '20' ||
      lpad(
        floor(random() * 10000000000)::bigint::text,
        10,
        '0'
      );

    digit_sum := 0;

    for i in 1..12 loop
      digit := substr(base_code, i, 1)::integer;

      if mod(i, 2) = 1 then
        digit_sum := digit_sum + digit;
      else
        digit_sum := digit_sum + (digit * 3);
      end if;
    end loop;

    check_digit := mod(10 - mod(digit_sum, 10), 10);

    candidate := base_code || check_digit::text;

    exit when not exists (
      select 1
      from public.product_variants
      where barcode = candidate
    );
  end loop;

  return candidate;
end;
$$;


--
-- Name: generate_product_sku(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_product_sku() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  candidate text;
begin
  loop
    candidate :=
      'SKU-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    exit when not exists (
      select 1
      from public.product_variants
      where sku = candidate
    );
  end loop;

  return candidate;
end;
$$;


--
-- Name: get_account_balance(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_account_balance(p_branch_id uuid, p_account text, p_currency text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT round(COALESCE(SUM(
    CASE
      WHEN debit_account = p_account THEN amount
      WHEN credit_account = p_account THEN -amount
      ELSE 0
    END
  ), 0), 2)
  FROM public.journal_entries
  WHERE branch_id = p_branch_id
    AND currency = p_currency
    AND (debit_account = p_account OR credit_account = p_account);
$$;


--
-- Name: get_current_exchange_rate(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone DEFAULT now()) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  select rate
  from public.exchange_rates
  where branch_id = p_branch_id
    and effective_at <= p_as_of
  order by effective_at desc
  limit 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    rate numeric(14,4) NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: TABLE exchange_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exchange_rates IS 'سجل يدوي غير قابل للتعديل لسعر السوق: عدد الجنيهات السودانية مقابل دولار واحد.';


--
-- Name: get_effective_exchange_rate(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_effective_exchange_rate(p_branch_id uuid, p_at timestamp with time zone DEFAULT now()) RETURNS public.exchange_rates
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rate public.exchange_rates;
begin
  select * into v_rate
  from public.exchange_rates
  where branch_id = p_branch_id
    and effective_at <= p_at
  order by effective_at desc, created_at desc
  limit 1;

  if not found then
    raise exception 'لا يوجد سعر صرف فعّال للفرع. أضف سعر السوق أولاً.';
  end if;

  return v_rate;
end;
$$;


--
-- Name: get_order_advance_rate(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_advance_rate(p_order_id uuid, p_branch_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_rate numeric;
BEGIN
  -- 1) العربون المدفوع مباشرة على الطلب
  SELECT SUM(amount) / NULLIF(SUM(amount_usd), 0)
  INTO v_rate
  FROM public.journal_entries
  WHERE sales_order_id = p_order_id
    AND credit_account = 'CUSTOMER_ADVANCES'
    AND currency = 'SDG'
    AND amount_usd > 0;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    RETURN round(v_rate, 4);
  END IF;

  -- 2) عربون منقول من طلب ملغي سابق
  SELECT SUM(je.amount) / NULLIF(SUM(je.amount_usd), 0)
  INTO v_rate
  FROM public.tailoring_customer_advance_transfers t
  JOIN public.journal_entries je
    ON je.sales_order_id = t.from_order_id
   AND je.credit_account = 'CUSTOMER_ADVANCES'
   AND je.currency = 'SDG'
   AND je.amount_usd > 0
  WHERE t.to_order_id = p_order_id;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    RETURN round(v_rate, 4);
  END IF;

  -- 3) سعر الطلب نفسه ثم السعر الحالي
  SELECT exchange_rate_used INTO v_rate
  FROM public.sales_orders WHERE id = p_order_id;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    RETURN v_rate;
  END IF;

  RETURN public.require_exchange_rate(p_branch_id);
END;
$$;


--
-- Name: get_tailor_cost_sdg(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tailor_cost_sdg(p_order_id uuid) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT round(COALESCE(
    tailoring_cost_sdg,
    tailoring_cost * exchange_rate_used,
    0
  ), 2)
  FROM public.sales_orders
  WHERE id = p_order_id;
$$;


--
-- Name: get_tailor_paid_sdg(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tailor_paid_sdg(p_order_id uuid, p_payment_type text DEFAULT NULL::text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT round(COALESCE(SUM(
    CASE
      WHEN p.currency = 'SDG' THEN COALESCE(p.amount_original, 0)
      -- دفعة قديمة بالدولار: نحولها بسعر الطلب
      ELSE p.amount * COALESCE(o.exchange_rate_used, 0)
    END
  ), 0), 2)
  FROM public.tailor_commission_payments p
  JOIN public.sales_orders o ON o.id = p.sales_order_id
  WHERE p.sales_order_id = p_order_id
    AND (p_payment_type IS NULL OR p.payment_type = p_payment_type);
$$;


--
-- Name: journal_entries_apply_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_entries_apply_currency() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_is_money_account_debit boolean;
  v_is_money_account_credit boolean;
BEGIN
  v_is_money_account_debit := NEW.debit_account IN ('CASH', 'BANK');
  v_is_money_account_credit := NEW.credit_account IN ('CASH', 'BANK');

  IF NEW.currency IS NULL THEN
    IF
      -- تحصيل من الزبون: بيع أو عربون
      (v_is_money_account_debit AND NEW.credit_account IN ('SALES', 'CUSTOMER_ADVANCES'))
      -- رد للزبون: استرداد عربون أو مرتجع بيع
      OR (v_is_money_account_credit AND NEW.debit_account IN ('SALES', 'CUSTOMER_ADVANCES'))
      -- تحويل العربون المحجوز لإيراد
      OR (NEW.debit_account = 'CUSTOMER_ADVANCES' AND NEW.credit_account = 'SALES')
    THEN
      NEW.currency := 'SDG';
    ELSE
      NEW.currency := 'USD';
    END IF;
  END IF;

  IF NEW.currency = 'USD' THEN
    NEW.exchange_rate_used := NULL;
    NEW.amount_usd := NEW.amount;
    RETURN NEW;
  END IF;

  -- SDG
  IF NEW.exchange_rate_used IS NULL THEN
    IF NEW.debit_account = 'CUSTOMER_ADVANCES' AND NEW.sales_order_id IS NOT NULL THEN
      -- العربون يُطفأ بنفس سعره التاريخي
      NEW.exchange_rate_used := public.get_order_advance_rate(NEW.sales_order_id, NEW.branch_id);
    ELSE
      NEW.exchange_rate_used := public.require_exchange_rate(NEW.branch_id);
    END IF;
  END IF;

  IF NEW.amount_usd IS NULL THEN
    NEW.amount_usd := round(NEW.amount / NEW.exchange_rate_used, 2);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: list_opening_stock_candidates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_opening_stock_candidates() RETURNS TABLE(id uuid, template_id uuid, product_name text, sku text, barcode text, color_name text, size text, selling_unit text, selling_price numeric, purchase_price numeric, average_cost numeric, min_stock_level numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    v.id,
    v."templateId",
    pt.name,
    v.sku,
    v.barcode,
    v."colorName",
    v.size,
    pt."sellingUnit",
    v."sellingPrice",
    v."purchasePrice",
    v."averageCost",
    v."minStockLevel"
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  WHERE COALESCE(v."isActive", true) = true
    AND COALESCE(v."stockQuantity", 0) = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_movements m WHERE m.variant_id = v.id
    )
  ORDER BY pt.name, v.sku;
$$;


--
-- Name: maintain_notifications(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.maintain_notifications(p_branch_id uuid, p_retention_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_overdue integer;
  v_deleted integer;
BEGIN
  v_overdue := public.generate_overdue_tailoring_notifications(p_branch_id);

  DELETE FROM public.notifications
  WHERE "isRead" = true
    AND created_at < now() - make_interval(days => GREATEST(p_retention_days, 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('overdue_created', v_overdue, 'deleted', v_deleted);
END;
$$;


--
-- Name: normalize_whatsapp_number(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_whatsapp_number(p_number text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(COALESCE(trim(p_number), ''), '[^0-9]', '', 'g');

  IF left(v_digits, 2) = '00' THEN
    v_digits := substring(v_digits FROM 3);
  END IF;

  IF length(v_digits) = 10 AND left(v_digits, 2) = '05' THEN
    v_digits := '966' || substring(v_digits FROM 2);
  ELSIF length(v_digits) = 9 AND left(v_digits, 1) = '5' THEN
    v_digits := '966' || v_digits;
  END IF;

  IF length(v_digits) < 8 OR length(v_digits) > 15 THEN
    RAISE EXCEPTION 'رقم واتساب غير صالح';
  END IF;

  RETURN v_digits;
END;
$$;


--
-- Name: notify_variant_stock(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_variant_stock(p_variant_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key text := 'STOCK:' || p_variant_id::text;
  v_info record;
  v_label text;
BEGIN
  -- أي إشعار مخزون مفتوح للصنف ده يتقفل (الحالة اتغيرت)
  UPDATE public.notifications
  SET "isRead" = true
  WHERE metadata ->> 'key' = v_key
    AND "isRead" = false;

  IF p_status NOT IN ('LOW', 'OUT') THEN
    RETURN;
  END IF;

  SELECT
    v.id, v.sku, v."colorName", v.size, v."stockQuantity", v."minStockLevel",
    pt.name AS product_name, pt."sellingUnit"
  INTO v_info
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  WHERE v.id = p_variant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_label := v_info.product_name
    || COALESCE(' - ' || NULLIF(concat_ws(' ', v_info."colorName",
         CASE WHEN v_info.size IS NOT NULL THEN 'مقاس ' || v_info.size END), ''), '')
    || COALESCE(' (' || v_info.sku || ')', '');

  INSERT INTO public.notifications (title, message, type, link, metadata)
  VALUES (
    CASE WHEN p_status = 'OUT' THEN 'نفد من المخزون' ELSE 'مخزون منخفض' END,
    CASE
      WHEN p_status = 'OUT' THEN v_label || ' نفد بالكامل من المخزون.'
      ELSE v_label || ' — الرصيد ' || trim_scale(round(v_info."stockQuantity", 2))
        || COALESCE(' ' || v_info."sellingUnit", '')
        || ' (حد الطلب ' || trim_scale(round(COALESCE(v_info."minStockLevel", 0), 2)) || ').'
    END,
    CASE WHEN p_status = 'OUT' THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END,
    '/dashboard/reports?tab=inventory',
    jsonb_build_object('key', v_key, 'variant_id', p_variant_id, 'status', p_status)
  );
END;
$$;


--
-- Name: pay_tailor_commission(uuid, uuid, uuid, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_tailor_commission(p_branch_id uuid, p_tailor_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_sales_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
declare
  v_now           timestamptz := now();
  v_entry_number  text;
  v_entry_id      uuid;
  v_payment_id    uuid;
  v_order_number  text := null;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'مبلغ العمولة يجب أن يكون أكبر من صفر';
  end if;
 
  if p_payment_method not in ('CASH', 'BANK') then
    raise exception 'طريقة الدفع غير صالحة';
  end if;
 
  if p_sales_order_id is not null then
    select order_number into v_order_number
    from public.sales_orders
    where id = p_sales_order_id;
  end if;
 
  v_entry_number := 'JE-' || extract(year from v_now) || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
 
  insert into public.journal_entries (
    entry_number, entry_type, amount, description,
    debit_account, credit_account,
    branch_id, created_by, reference
  ) values (
    v_entry_number, 'EXPENSE', p_amount,
    'عمولة ترزي' || coalesce(' - طلب ' || v_order_number, '') ||
      coalesce(' - ' || p_notes, ''),
    'TAILOR_COMMISSION',
    case when p_payment_method = 'CASH' then 'CASH' else 'BANK' end,
    p_branch_id, p_user_id,
    coalesce(v_order_number, 'عمولة-' || p_tailor_id::text)
  )
  returning id into v_entry_id;
 
  insert into public.tailor_commission_payments (
    branch_id, tailor_id, sales_order_id, amount, payment_method,
    notes, journal_entry_id, created_by
  ) values (
    p_branch_id, p_tailor_id, p_sales_order_id, p_amount, p_payment_method,
    p_notes, v_entry_id, p_user_id
  )
  returning id into v_payment_id;
 
  return jsonb_build_object(
    'id', v_payment_id,
    'amount', p_amount,
    'journalEntryId', v_entry_id
  );
end;
$$;


--
-- Name: pay_tailor_payment(uuid, uuid, uuid, uuid, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_tailor_payment(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_sales_order_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_currency text DEFAULT 'SDG'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_tailor record;
  v_order record;
  v_rate numeric(14,4);
  v_cost_sdg numeric(14,2);
  v_paid_sdg numeric(14,2);
  v_remaining_sdg numeric(14,2);
  v_amount_usd numeric(14,2);
  v_available_balance numeric(14,2);
  v_payment_account text;
  v_payment_type text;
  v_debit_account text;
  v_labor_recognized boolean;
  v_entry_number text;
  v_entry_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id, role, "branchId" AS branch_id INTO v_user
  FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'المستخدم الحالي غير موجود'; END IF;
  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;
  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'دفع مستحقات الخياط متاح للكاشير أو المدير فقط';
  END IF;

  SELECT id, name, "branchId" AS branch_id, role INTO v_tailor
  FROM public.users WHERE id = p_tailor_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'الخياط غير موجود'; END IF;
  IF v_tailor.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الخياط لا ينتمي إلى الفرع المحدد';
  END IF;
  IF lower(COALESCE(v_tailor.role::text, '')) <> 'tailor' THEN
    RAISE EXCEPTION 'المستخدم المحدد ليس حساب خياط';
  END IF;

  IF p_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'يجب ربط دفعة الخياط بطلب تفصيل محدد';
  END IF;

  IF COALESCE(p_currency, 'SDG') <> 'SDG' THEN
    RAISE EXCEPTION 'دفعات الخياط تتم بالجنيه السوداني';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'مبلغ دفعة الخياط غير صالح';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة دفع الخياط غير صالحة';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'طلب التفصيل المرتبط بالدفعة غير موجود'; END IF;
  IF v_order.branch_id IS DISTINCT FROM p_branch_id OR v_order.order_type <> 'TAILORING' THEN
    RAISE EXCEPTION 'الطلب المرتبط بالدفعة غير صالح';
  END IF;
  IF v_order.tailor_id IS DISTINCT FROM p_tailor_id THEN
    RAISE EXCEPTION 'الطلب غير مسند إلى الخياط المحدد';
  END IF;
  IF v_order.tailoring_status = 'CANCELLED'
     AND v_order.converted_to_product_at IS NULL
     AND v_order.produced_product_variant_id IS NULL THEN
    RAISE EXCEPTION 'لا يمكن دفع مستحقات طلب تفصيل ملغي قبل بدء التنفيذ';
  END IF;

  v_cost_sdg := public.get_tailor_cost_sdg(p_sales_order_id);
  v_paid_sdg := public.get_tailor_paid_sdg(p_sales_order_id);
  v_remaining_sdg := round(v_cost_sdg - v_paid_sdg, 2);

  IF v_remaining_sdg <= 0 THEN
    RAISE EXCEPTION 'تم سداد أجرة الخياط لهذا الطلب بالكامل';
  END IF;

  IF p_amount > v_remaining_sdg THEN
    RAISE EXCEPTION 'مبلغ الدفعة يتجاوز المتبقي للخياط. المتبقي: % ج.س', v_remaining_sdg;
  END IF;

  v_rate := public.require_exchange_rate(p_branch_id);
  v_amount_usd := round(p_amount / v_rate, 2);

  v_payment_account := CASE WHEN p_payment_method = 'CASH' THEN 'CASH' ELSE 'BANK' END;
  v_available_balance := public.get_account_balance(p_branch_id, v_payment_account, 'SDG');

  IF p_amount > v_available_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
      CASE WHEN v_payment_account = 'CASH' THEN 'الخزينة' ELSE 'البنك' END,
      v_available_balance;
  END IF;

  v_labor_recognized :=
    (v_order.tailoring_labor_journal_entry_id IS NOT NULL)
    OR (v_order.production_labor_journal_entry_id IS NOT NULL)
    OR (v_order.tailoring_cogs_journal_entry_id IS NOT NULL);

  IF v_labor_recognized THEN
    v_payment_type := 'SETTLEMENT';
    v_debit_account := 'TAILORS_PAYABLE';
  ELSE
    v_payment_type := 'ADVANCE';
    v_debit_account := 'TAILOR_ADVANCES';
  END IF;

  v_entry_number :=
    CASE WHEN v_payment_type = 'ADVANCE' THEN 'JE-TLR-ADV-PAY-' ELSE 'JE-TLR-SETTLE-' END
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
    description, debit_account, credit_account,
    branch_id, created_by, reference, sales_order_id
  ) VALUES (
    v_entry_number,
    CASE WHEN v_payment_type = 'ADVANCE' THEN 'TAILOR_ADVANCE' ELSE 'TAILOR_PAYMENT' END,
    round(p_amount, 2), 'SDG', v_rate, v_amount_usd,
    CASE WHEN v_payment_type = 'ADVANCE'
      THEN 'دفعة مقدمة للخياط عن طلب التفصيل ' || v_order.order_number
      ELSE 'سداد أجرة الخياط عن طلب التفصيل ' || v_order.order_number
    END || COALESCE(' - ' || NULLIF(trim(p_notes), ''), ''),
    v_debit_account, v_payment_account,
    p_branch_id, p_user_id, v_order.order_number, p_sales_order_id
  )
  RETURNING id INTO v_entry_id;

  -- (الـ trigger على الجدول ده بيسوّي فرق الصرف تلقائيًا لما الأجرة تتسدد بالكامل)
  INSERT INTO public.tailor_commission_payments (
    branch_id, tailor_id, sales_order_id, amount, payment_method, payment_type,
    notes, journal_entry_id, created_by, currency, amount_original, exchange_rate_used
  ) VALUES (
    p_branch_id, p_tailor_id, p_sales_order_id, v_amount_usd, p_payment_method, v_payment_type,
    NULLIF(trim(p_notes), ''), v_entry_id, p_user_id, 'SDG', round(p_amount, 2), v_rate
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'amount', round(p_amount, 2),
    'currency', 'SDG',
    'amount_usd', v_amount_usd,
    'exchange_rate_used', v_rate,
    'payment_type', v_payment_type,
    'journal_entry_id', v_entry_id,
    'tailor_id', p_tailor_id,
    'sales_order_id', p_sales_order_id,
    'remaining_amount', round(v_remaining_sdg - p_amount, 2),
    'account', v_debit_account
  );
END;
$$;


--
-- Name: prevent_exchange_rate_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_exchange_rate_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'لا يمكن تعديل أو حذف سعر صرف مسجل. أضف سعراً جديداً بتاريخ سريان صحيح.';
end;
$$;


--
-- Name: process_inventory_adjustment(uuid, uuid, text, numeric, text, text, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_inventory_adjustment(p_variant_id uuid, p_user_id uuid, p_adjustment_type text, p_quantity numeric, p_notes text, p_entry_number text, p_amount numeric, p_payment_method text, p_branch_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

DECLARE
  v_template_id UUID;
  v_product_name TEXT;

  v_current_stock NUMERIC(12,2);
  v_new_stock NUMERIC(12,2);

  v_purchase_price NUMERIC(12,2);
  v_average_cost NUMERIC(12,2);
  v_conversion_factor NUMERIC(12,4);
  v_unit_cost NUMERIC(12,2);

  v_abs_qty NUMERIC(12,2);
  v_total_cost NUMERIC(12,2);

  v_amount NUMERIC(12,2);

  v_movement_type TEXT;
  v_movement_id UUID;

  v_entry_id UUID;
  v_secondary_entry_id UUID;

  v_debit_account TEXT;
  v_credit_account TEXT;

  v_payment_account TEXT;
  v_available_balance NUMERIC(12,2);

  v_description TEXT;

BEGIN

  /* =====================================================
     VALIDATION
  ===================================================== */

  IF p_adjustment_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'نوع التسوية غير صالح';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
  END IF;

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'معرف الفرع مطلوب';
  END IF;


  /* =====================================================
     LOAD VARIANT
  ===================================================== */

  SELECT
    pv."templateId",
    COALESCE(pv."stockQuantity", 0),
    COALESCE(pv."purchasePrice", 0),
    COALESCE(pv."averageCost", 0),
    COALESCE(NULLIF(pt."conversionFactor", 0), 1),
    pt.name

  INTO
    v_template_id,
    v_current_stock,
    v_purchase_price,
    v_average_cost,
    v_conversion_factor,
    v_product_name

  FROM public.product_variants pv

  LEFT JOIN public.product_templates pt
    ON pt.id = pv."templateId"

  WHERE pv.id = p_variant_id

  FOR UPDATE OF pv;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'المتغير غير موجود';
  END IF;


  /* =====================================================
     NORMALIZE QUANTITY
     
     المخزون دائمًا بوحدة البيع
  ===================================================== */

  v_abs_qty :=
    ROUND(ABS(p_quantity), 2);


  /* =====================================================
     COST PER SELLING UNIT
     
     averageCost عندك أصبح أصلًا بوحدة البيع.

     fallback:
     purchasePrice / conversionFactor
  ===================================================== */

  v_unit_cost :=
    ROUND(
      COALESCE(
        NULLIF(v_average_cost, 0),
        CASE
          WHEN v_conversion_factor > 0
            THEN v_purchase_price / v_conversion_factor
          ELSE 0
        END
      ),
      2
    );


  v_total_cost :=
    ROUND(
      v_abs_qty * v_unit_cost,
      2
    );


  v_amount :=
    ROUND(
      COALESCE(p_amount, 0),
      2
    );


  /* =====================================================
     FINANCIAL DIRECTION VALIDATION

     IN:
       0      = no financial transaction
       < 0    = customer refund

     OUT:
       0      = no financial transaction
       > 0    = supplier refund
  ===================================================== */

  IF p_adjustment_type = 'IN'
     AND v_amount > 0
  THEN
    RAISE EXCEPTION
      'مبلغ الإدخال يجب أن يكون صفراً أو سالباً';
  END IF;


  IF p_adjustment_type = 'OUT'
     AND v_amount < 0
  THEN
    RAISE EXCEPTION
      'مبلغ الإخراج يجب أن يكون صفراً أو موجباً';
  END IF;


  IF v_amount <> 0
     AND (
       p_payment_method IS NULL
       OR p_payment_method NOT IN ('CASH', 'BANK')
     )
  THEN
    RAISE EXCEPTION
      'يجب تحديد طريقة الدفع عند وجود مبلغ مالي';
  END IF;


  /* =====================================================
     STOCK
  ===================================================== */

  IF p_adjustment_type = 'IN' THEN

    v_new_stock :=
      ROUND(
        v_current_stock + v_abs_qty,
        2
      );

    v_movement_type := 'ADJUSTMENT_IN';

  ELSE

    v_new_stock :=
      ROUND(
        v_current_stock - v_abs_qty,
        2
      );

    IF v_new_stock < 0 THEN
      RAISE EXCEPTION
        'الكمية المراد خصمها أكبر من المخزون الحالي';
    END IF;

    v_movement_type := 'ADJUSTMENT_OUT';

  END IF;


  /* =====================================================
     UPDATE STOCK
  ===================================================== */

  UPDATE public.product_variants

  SET
    "stockQuantity" = v_new_stock,
    "updatedAt" = NOW()

  WHERE id = p_variant_id;


  /* =====================================================
     INVENTORY MOVEMENT
  ===================================================== */

  INSERT INTO public.inventory_movements (
    template_id,
    variant_id,
    movement_type,
    quantity,
    unit_cost,
    reference,
    notes,
    created_by
  )

  VALUES (
    v_template_id,
    p_variant_id,
    v_movement_type,
    v_abs_qty,
    v_unit_cost,
    p_entry_number,
    p_notes,
    p_user_id
  )

  RETURNING id
  INTO v_movement_id;


  /* =====================================================
     1) NO FINANCIAL AMOUNT
     
     IN:
       DR INVENTORY
       CR OTHER_INCOME

     OUT:
       DR OTHER_EXPENSE
       CR INVENTORY
  ===================================================== */

  IF v_amount = 0
     AND v_total_cost > 0
  THEN

    IF p_adjustment_type = 'IN' THEN

      v_debit_account := 'INVENTORY';
      v_credit_account := 'OTHER_INCOME';

      v_description :=
        'تسوية مخزنية زيادة - '
        || COALESCE(v_product_name, 'منتج');

    ELSE

      v_debit_account := 'OTHER_EXPENSE';
      v_credit_account := 'INVENTORY';

      v_description :=
        'تسوية مخزنية نقص - '
        || COALESCE(v_product_name, 'منتج');

    END IF;


    INSERT INTO public.journal_entries (
      branch_id,
      created_by,
      entry_number,
      entry_type,
      amount,
      debit_account,
      credit_account,
      reference,
      description
    )

    VALUES (
      p_branch_id,
      p_user_id,
      p_entry_number,
      CASE
        WHEN p_adjustment_type = 'IN'
          THEN 'OTHER'
        ELSE 'EXPENSE'
      END,
      v_total_cost,
      v_debit_account,
      v_credit_account,
      p_entry_number,
      v_description
    )

    RETURNING id
    INTO v_entry_id;

  END IF;


  /* =====================================================
     2) CUSTOMER RETURN
     
     IN + NEGATIVE AMOUNT

     Financial:
       DR SALES
       CR CASH / BANK

     Inventory cost reversal:
       DR INVENTORY
       CR COGS
  ===================================================== */

  IF p_adjustment_type = 'IN'
     AND v_amount < 0
  THEN

    v_payment_account :=
      CASE
        WHEN p_payment_method = 'BANK'
          THEN 'BANK'
        ELSE 'CASH'
      END;


    /* -------------------------------------------------
       CHECK CASH / BANK BALANCE
    ------------------------------------------------- */

    SELECT
      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN debit_account = v_payment_account
                THEN amount
              WHEN credit_account = v_payment_account
                THEN -amount
              ELSE 0
            END
          ),
          0
        ),
        2
      )

    INTO v_available_balance

    FROM public.journal_entries

    WHERE branch_id = p_branch_id
      AND currency = 'SDG';


    IF ABS(v_amount) > v_available_balance THEN

      RAISE EXCEPTION
        'الرصيد غير كافٍ في % (جنيه) لإرجاع مبلغ % ج.س. الرصيد الحالي % ج.س',
        CASE
          WHEN v_payment_account = 'BANK'
            THEN 'البنك'
          ELSE 'الخزينة'
        END,
        ABS(v_amount),
        v_available_balance;

    END IF;


    /* -------------------------------------------------
       CUSTOMER REFUND
    ------------------------------------------------- */

    INSERT INTO public.journal_entries (
      branch_id,
      created_by,
      entry_number,
      entry_type,
      amount,
      debit_account,
      credit_account,
      reference,
      description
    )

    VALUES (
      p_branch_id,
      p_user_id,
      p_entry_number || '-RETURN',
      'SALE',
      ABS(v_amount),
      'SALES',
      v_payment_account,
      p_entry_number,
      'مرتجع من عميل - '
        || COALESCE(v_product_name, 'منتج')
    )

    RETURNING id
    INTO v_entry_id;


    /* -------------------------------------------------
       REVERSE COGS
    ------------------------------------------------- */

    IF v_total_cost > 0 THEN

      INSERT INTO public.journal_entries (
        branch_id,
        created_by,
        entry_number,
        entry_type,
        amount,
        debit_account,
        credit_account,
        reference,
        description
      )

      VALUES (
        p_branch_id,
        p_user_id,
        p_entry_number || '-COGS',
        'COGS',
        v_total_cost,
        'INVENTORY',
        'COGS',
        p_entry_number,
        'عكس تكلفة المبيعات للمرتجع - '
          || COALESCE(v_product_name, 'منتج')
      )

      RETURNING id
      INTO v_secondary_entry_id;

    END IF;

  END IF;


  /* =====================================================
     3) SUPPLIER RETURN
     
     OUT + POSITIVE AMOUNT

       DR CASH / BANK
       CR INVENTORY
  ===================================================== */

  IF p_adjustment_type = 'OUT'
     AND v_amount > 0
  THEN

    v_payment_account :=
      CASE
        WHEN p_payment_method = 'BANK'
          THEN 'BANK'
        ELSE 'CASH'
      END;


    INSERT INTO public.journal_entries (
      branch_id,
      created_by,
      entry_number,
      entry_type,
      amount,
      debit_account,
      credit_account,
      reference,
      description
    )

    VALUES (
      p_branch_id,
      p_user_id,
      p_entry_number || '-RETURN',
      'PURCHASE',
      v_amount,
      v_payment_account,
      'INVENTORY',
      p_entry_number,
      'مرتجع إلى المورد - '
        || COALESCE(v_product_name, 'منتج')
    )

    RETURNING id
    INTO v_entry_id;

  END IF;


  /* =====================================================
     RETURN RESULT
  ===================================================== */

  RETURN jsonb_build_object(

    'variant_id',
    p_variant_id,

    'previous_stock',
    v_current_stock,

    'new_stock',
    v_new_stock,

    'quantity',
    v_abs_qty,

    'amount',
    v_amount,

    'payment_method',
    p_payment_method,

    'unit_cost',
    v_unit_cost,

    'total_cost',
    v_total_cost,

    'movement_type',
    v_movement_type,

    'movement_id',
    v_movement_id,

    'journal_entry_id',
    v_entry_id,

    'secondary_journal_entry_id',
    v_secondary_entry_id

  );


EXCEPTION
  WHEN OTHERS THEN

    RAISE EXCEPTION
      'فشلت عملية التسوية المخزنية: %',
      SQLERRM;

END;

$$;


--
-- Name: process_purchase_order_receipt(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_purchase_order_receipt(po_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  item RECORD;
BEGIN
  -- التكرار على جميع عناصر الطلب لزيادة كميات المنتجات في جدول products
  FOR item IN 
    SELECT product_id, quantity 
    FROM public.purchase_order_items 
    WHERE purchase_order_id = po_id
  LOOP
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + item.quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = item.product_id;
  END LOOP;
END;
$$;


--
-- Name: record_opening_stock(uuid, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_now            timestamptz := now();
  v_user           record;
  v_item           jsonb;
  v_variant        record;
  v_variant_id     uuid;
  v_qty            numeric(20,2);
  v_unit_cost      numeric(20,6);
  v_line_total     numeric(20,2);
  v_total          numeric(20,2) := 0;
  v_count          integer := 0;
  v_seen           uuid[] := ARRAY[]::uuid[];
  v_entry_number   text;
  v_journal_id     uuid;
  v_notes          text;
  v_has_branch     boolean;
  v_has_currency   boolean;
  v_has_amount_usd boolean;
  v_has_legacy     boolean;
  v_rate_id        uuid;
  v_rate_value     numeric(20,6);
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'معرف الفرع مطلوب';
  END IF;

  /* --- الصلاحية: المالك أو المدير --- */
  SELECT id, role INTO v_user FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تسجيل المخزون الافتتاحي متاح للمالك أو المدير فقط';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا توجد أصناف لتسجيلها';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_entry_number := 'JE-OPEN-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements' AND column_name = 'branch_id'
  ) INTO v_has_branch;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'currency'
  ) INTO v_has_currency;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'amount_usd'
  ) INTO v_has_amount_usd;

  /* --- أعمدة نظام العملتين القديم: لو موجودة لازم نملاها بنفسنا،
         عشان الـ trigger القديم ما يحاولش يملاها ويفشل --- */
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'exchange_rate_id'
  ) INTO v_has_legacy;

  IF v_has_legacy THEN
    SELECT id, rate INTO v_rate_id, v_rate_value
    FROM public.exchange_rates
    WHERE branch_id = p_branch_id
      AND effective_at <= v_now
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1;

    IF v_rate_id IS NULL THEN
      RAISE EXCEPTION 'لازم تسجّل سعر الصرف الحالي من الإعدادات قبل تسجيل المخزون الافتتاحي';
    END IF;
  END IF;

  /* --- الأصناف --- */
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := NULLIF(v_item ->> 'variantId', '')::uuid;
    v_qty        := round(COALESCE((v_item ->> 'quantity')::numeric, 0), 2);
    v_unit_cost  := round(COALESCE((v_item ->> 'unitCost')::numeric, 0), 6);

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'معرف الصنف مطلوب';
    END IF;

    IF v_variant_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'الصنف مكرر في نفس العملية';
    END IF;

    v_seen := v_seen || v_variant_id;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;

    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'تكلفة الوحدة يجب أن تكون أكبر من صفر';
    END IF;

    SELECT v.id, v."templateId", v."stockQuantity", v."purchasePrice",
           COALESCE(v."isActive", true) AS is_active, pt.name AS product_name
    INTO v_variant
    FROM public.product_variants v
    JOIN public.product_templates pt ON pt.id = v."templateId"
    WHERE v.id = v_variant_id
    FOR UPDATE OF v;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'الصنف غير موجود';
    END IF;

    IF NOT v_variant.is_active THEN
      RAISE EXCEPTION 'الصنف % غير نشط', v_variant.product_name;
    END IF;

    IF COALESCE(v_variant."stockQuantity", 0) <> 0 THEN
      RAISE EXCEPTION 'الصنف % رصيده ليس صفرًا، فلا يصلح كمخزون افتتاحي', v_variant.product_name;
    END IF;

    IF EXISTS (SELECT 1 FROM public.inventory_movements m WHERE m.variant_id = v_variant.id) THEN
      RAISE EXCEPTION 'الصنف % عليه حركات مخزون سابقة، استخدم تسوية المخزون بدل المخزون الافتتاحي', v_variant.product_name;
    END IF;

    v_line_total := round(v_qty * v_unit_cost, 2);
    v_total := v_total + v_line_total;
    v_count := v_count + 1;

    UPDATE public.product_variants
    SET "stockQuantity" = v_qty,
        "averageCost"   = v_unit_cost,
        "purchasePrice" = CASE
                            WHEN COALESCE("purchasePrice", 0) = 0 THEN v_unit_cost
                            ELSE "purchasePrice"
                          END,
        "updatedAt"     = v_now
    WHERE id = v_variant.id;

    IF v_has_branch THEN
      INSERT INTO public.inventory_movements (
        movement_type, quantity, unit_cost, reference, notes,
        template_id, variant_id, created_by, branch_id, created_at
      ) VALUES (
        'OPENING_STOCK', v_qty, v_unit_cost, v_entry_number,
        COALESCE(v_notes, 'مخزون افتتاحي'),
        v_variant."templateId", v_variant.id, p_user_id, p_branch_id, v_now
      );
    ELSE
      INSERT INTO public.inventory_movements (
        movement_type, quantity, unit_cost, reference, notes,
        template_id, variant_id, created_by, created_at
      ) VALUES (
        'OPENING_STOCK', v_qty, v_unit_cost, v_entry_number,
        COALESCE(v_notes, 'مخزون افتتاحي'),
        v_variant."templateId", v_variant.id, p_user_id, v_now
      );
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'إجمالي قيمة المخزون الافتتاحي يجب أن يكون أكبر من صفر';
  END IF;

  /* --- قيد واحد لكل العملية: مدين المخزون / دائن رأس المال --- */
  IF v_has_legacy THEN
    -- الأعمدة القديمة بتتملا هنا عشان الـ trigger القديم يعدّي من غير ما ينادي
    -- الدالة المكسورة get_effective_exchange_rate
    EXECUTE
      'INSERT INTO public.journal_entries (
         entry_number, branch_id, entry_type, amount, description, reference,
         debit_account, credit_account, created_by, created_at,
         source_currency, exchange_rate_id, exchange_rate_sdg_per_usd
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id'
    INTO v_journal_id
    USING
      v_entry_number, p_branch_id, 'CAPITAL', v_total,
      'مخزون افتتاحي: ' || v_count || ' صنف' || COALESCE(' — ' || v_notes, ''),
      v_entry_number, 'INVENTORY', 'CAPITAL', p_user_id, v_now,
      'USD', v_rate_id, v_rate_value;
  ELSE
    INSERT INTO public.journal_entries (
      entry_number, branch_id, entry_type, amount,
      description, reference, debit_account, credit_account,
      created_by, created_at
    ) VALUES (
      v_entry_number, p_branch_id, 'CAPITAL', v_total,
      'مخزون افتتاحي: ' || v_count || ' صنف' || COALESCE(' — ' || v_notes, ''),
      v_entry_number, 'INVENTORY', 'CAPITAL', p_user_id, v_now
    )
    RETURNING id INTO v_journal_id;
  END IF;

  /* --- شبكة أمان: لو مفيش trigger بيحدد العملة، نحددها هنا (التكلفة بالدولار) --- */
  IF v_has_currency THEN
    EXECUTE format(
      'UPDATE public.journal_entries SET currency = %L WHERE id = %L AND currency IS NULL',
      'USD', v_journal_id
    );
  END IF;

  IF v_has_amount_usd THEN
    EXECUTE format(
      'UPDATE public.journal_entries SET amount_usd = %L WHERE id = %L AND amount_usd IS NULL',
      v_total, v_journal_id
    );
  END IF;

  RETURN jsonb_build_object(
    'journal_entry_id', v_journal_id,
    'entry_number',     v_entry_number,
    'items_count',      v_count,
    'total_cost_usd',   v_total
  );
END;
$_$;


--
-- Name: refund_customer_advance(uuid, uuid, uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_direct_amount numeric(12,2) := 0;
  v_incoming_amount numeric(12,2) := 0;
  v_outgoing_amount numeric(12,2) := 0;
  v_refunded_amount numeric(12,2) := 0;
  v_available_advance numeric(12,2) := 0;
  v_payment_account text;
  v_available_balance numeric(12,2) := 0;
  v_entry_number text;
  v_entry_id uuid;
  v_refund_id uuid;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'استرداد عربون العميل متاح للكاشير أو المدير فقط';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'مبلغ الاسترداد غير صالح';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'طريقة الاسترداد غير صالحة';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND OR v_order.tailoring_purpose <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'طلب العميل المرتبط بالاسترداد غير موجود';
  END IF;

  IF v_order.tailoring_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'استرداد العربون متاح بعد إلغاء الطلب فقط';
  END IF;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_direct_amount
  FROM public.sales_order_payments
  WHERE sales_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_incoming_amount
  FROM public.tailoring_customer_advance_transfers
  WHERE to_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_outgoing_amount
  FROM public.tailoring_customer_advance_transfers
  WHERE from_order_id = p_order_id;

  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO v_refunded_amount
  FROM public.tailoring_customer_advance_refunds
  WHERE sales_order_id = p_order_id;

  v_available_advance := round(
    v_direct_amount + v_incoming_amount - v_outgoing_amount - v_refunded_amount,
    2
  );

  IF p_amount > v_available_advance THEN
    RAISE EXCEPTION 'مبلغ الاسترداد يتجاوز عربون العميل المتاح. المتاح: % ج.س', v_available_advance;
  END IF;

  v_payment_account := CASE WHEN p_payment_method = 'CASH' THEN 'CASH' ELSE 'BANK' END;

  SELECT round(
    COALESCE(
      SUM(
        CASE
          WHEN debit_account = v_payment_account THEN amount
          WHEN credit_account = v_payment_account THEN -amount
          ELSE 0
        END
      ),
      0
    ),
    2
  )
  INTO v_available_balance
  FROM public.journal_entries
  WHERE branch_id = p_branch_id
    AND currency = 'SDG';

  IF p_amount > v_available_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
      CASE WHEN v_payment_account = 'CASH' THEN 'الخزينة' ELSE 'البنك' END,
      v_available_balance;
  END IF;

  v_entry_number :=
    'JE-TLR-CUST-ADV-REFUND-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number,
    entry_type,
    amount,
    description,
    debit_account,
    credit_account,
    branch_id,
    created_by,
    reference,
    sales_order_id
  )
  VALUES (
    v_entry_number,
    'CUSTOMER_ADVANCE_REFUND',
    round(p_amount, 2),
    'استرداد عربون العميل لطلب التفصيل ' || v_order.order_number || COALESCE(' - ' || NULLIF(trim(p_notes), ''), ''),
    'CUSTOMER_ADVANCES',
    v_payment_account,
    p_branch_id,
    p_user_id,
    v_order.order_number,
    p_order_id
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.tailoring_customer_advance_refunds (
    sales_order_id,
    amount,
    payment_method,
    journal_entry_id,
    created_by,
    created_at,
    notes
  )
  VALUES (
    p_order_id,
    round(p_amount, 2),
    p_payment_method,
    v_entry_id,
    p_user_id,
    now(),
    NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_refund_id;

  RETURN jsonb_build_object(
    'id', v_refund_id,
    'sales_order_id', p_order_id,
    'amount', round(p_amount, 2),
    'remaining_advance', round(v_available_advance - p_amount, 2),
    'journal_entry_id', v_entry_id
  );
END;
$$;


--
-- Name: require_exchange_rate(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone DEFAULT now()) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_rate numeric;
BEGIN
  v_rate := public.get_current_exchange_rate(p_branch_id, p_as_of);

  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'لا يوجد سعر صرف مسجّل. سجّل سعر الصرف من الإعدادات أولًا';
  END IF;

  RETURN v_rate;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: sales_orders_apply_exchange_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sales_orders_apply_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.order_type = 'TAILORING' THEN
    IF NEW.exchange_rate_used IS NULL THEN
      NEW.exchange_rate_used := public.require_exchange_rate(NEW.branch_id);
    END IF;

    IF COALESCE(NEW.tailoring_purpose, 'CUSTOMER') = 'CUSTOMER'
       AND COALESCE(NEW.total_amount, 0) > 0 THEN
      NEW.subtotal_usd := round(NEW.subtotal / NEW.exchange_rate_used, 2);
      NEW.total_amount_usd := round(NEW.total_amount / NEW.exchange_rate_used, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: settle_tailor_fx(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_tailor_fx(p_order_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    CASE
      WHEN debit_account = 'TAILOR_ADVANCES' THEN amount_usd
      WHEN credit_account = 'TAILOR_ADVANCES' THEN -amount_usd
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


--
-- Name: snapshot_inventory_movement_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_inventory_movement_cost() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.unit_cost_usd := COALESCE(NEW.unit_cost_usd, NEW.unit_cost, 0);
  NEW.total_cost_usd := round(NEW.quantity * NEW.unit_cost_usd, 2);
  RETURN NEW;
END;
$$;


--
-- Name: snapshot_journal_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_journal_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rate_id uuid;
  v_rate numeric(14,4);
  v_lookup_at timestamptz;
  v_inferred_currency text;
BEGIN
  v_lookup_at := COALESCE(NEW.created_at, now());

  /* -------------------------------------------------------
     Decide currency if caller did not provide one.
  ------------------------------------------------------- */

  v_inferred_currency := CASE
    WHEN NEW.entry_type IN (
      'SALE',
      'SALE_PAYMENT',
      'CUSTOMER_ADVANCE',
      'CUSTOMER_ADVANCE_REFUND',
      'TAILOR_ADVANCE',
      'TAILOR_PAYMENT'
    ) THEN 'SDG'

    WHEN (
      NEW.debit_account IN ('CASH', 'BANK')
      AND NEW.credit_account IN ('SALES', 'CUSTOMER_ADVANCES')
    ) THEN 'SDG'

    WHEN (
      NEW.credit_account IN ('CASH', 'BANK')
      AND NEW.debit_account IN ('SALES', 'CUSTOMER_ADVANCES')
    ) THEN 'SDG'

    WHEN (
      NEW.debit_account = 'CUSTOMER_ADVANCES'
      AND NEW.credit_account = 'SALES'
    ) THEN 'SDG'

    ELSE 'USD'
  END;

  IF NEW.currency IS NULL THEN
    NEW.currency := COALESCE(NEW.source_currency, v_inferred_currency);
  END IF;

  IF NEW.currency NOT IN ('USD', 'SDG') THEN
    RAISE EXCEPTION 'العملة غير صالحة: %', NEW.currency;
  END IF;

  IF NEW.source_currency IS NULL THEN
    NEW.source_currency := NEW.currency;
  ELSIF NEW.source_currency <> NEW.currency THEN
    RAISE EXCEPTION
      'عملة القيد (%) لا تتطابق مع مصدر العملة (%)',
      NEW.currency,
      NEW.source_currency;
  END IF;

  /* -------------------------------------------------------
     Resolve an explicitly supplied exchange_rate_id first.
  ------------------------------------------------------- */

  IF NEW.exchange_rate_id IS NOT NULL THEN
    SELECT er.id, er.rate
      INTO v_rate_id, v_rate
    FROM public.exchange_rates er
    WHERE er.id = NEW.exchange_rate_id
      AND er.branch_id = NEW.branch_id;

    IF v_rate_id IS NULL THEN
      RAISE EXCEPTION 'سعر الصرف المحدد غير موجود لهذا الفرع';
    END IF;

    NEW.exchange_rate_id := v_rate_id;
    NEW.exchange_rate_sdg_per_usd := v_rate;
  END IF;

  /* -------------------------------------------------------
     USD entries are already in the base reporting currency.
     Do not force a rate merely to store USD.
  ------------------------------------------------------- */

  IF NEW.currency = 'USD' THEN
    NEW.exchange_rate_used := NULL;
    NEW.amount_usd := round(NEW.amount, 2);

    /* Optional SDG display snapshot when a rate is already known. */
    IF NEW.exchange_rate_sdg_per_usd IS NOT NULL
       AND NEW.exchange_rate_sdg_per_usd > 0 THEN
      NEW.amount_sdg := round(NEW.amount_usd * NEW.exchange_rate_sdg_per_usd, 2);
    END IF;

    RETURN NEW;
  END IF;

  /* -------------------------------------------------------
     SDG entries need a locked conversion rate.

     For customer-advance recognition/refund, prefer the rate at
     which the original customer advance was received.
  ------------------------------------------------------- */

  IF NEW.exchange_rate_used IS NULL
     OR NEW.exchange_rate_used <= 0 THEN

    IF NEW.debit_account = 'CUSTOMER_ADVANCES'
       AND NEW.sales_order_id IS NOT NULL THEN
      NEW.exchange_rate_used := public.get_order_advance_rate(
        NEW.sales_order_id,
        NEW.branch_id
      );
    ELSE
      NEW.exchange_rate_used := public.require_exchange_rate(
        NEW.branch_id,
        v_lookup_at
      );
    END IF;
  END IF;

  IF NEW.exchange_rate_used IS NULL OR NEW.exchange_rate_used <= 0 THEN
    RAISE EXCEPTION 'سعر الصرف للقيد غير صالح';
  END IF;

  /* If no rate id was supplied, try to bind the exact stored rate row. */
  IF NEW.exchange_rate_id IS NULL THEN
    SELECT er.id, er.rate
      INTO v_rate_id, v_rate
    FROM public.exchange_rates er
    WHERE er.branch_id = NEW.branch_id
      AND er.rate = NEW.exchange_rate_used
      AND er.effective_at <= v_lookup_at
    ORDER BY er.effective_at DESC, er.created_at DESC
    LIMIT 1;

    IF v_rate_id IS NOT NULL THEN
      NEW.exchange_rate_id := v_rate_id;
      NEW.exchange_rate_sdg_per_usd := v_rate;
      NEW.exchange_rate_used := v_rate;
    ELSE
      /* Historical rate can be derived from old journal data even when
         its source row no longer matches exactly; keep the numeric rate. */
      NEW.exchange_rate_sdg_per_usd := NEW.exchange_rate_used;
    END IF;

  ELSIF NEW.exchange_rate_sdg_per_usd IS NULL THEN
    NEW.exchange_rate_sdg_per_usd := NEW.exchange_rate_used;
  END IF;

  NEW.amount_sdg := round(NEW.amount, 2);
  NEW.amount_usd := round(NEW.amount_sdg / NEW.exchange_rate_used, 2);

  RETURN NEW;
END;
$$;


--
-- Name: snapshot_sales_item_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_sales_item_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rate_id uuid;
  v_rate numeric(14,4);
BEGIN
  SELECT
    so.exchange_rate_id,
    so.exchange_rate_sdg_per_usd
  INTO
    v_rate_id,
    v_rate
  FROM public.sales_orders so
  WHERE so.id = NEW.sales_order_id;

  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'لا يوجد سعر صرف مثبت لفاتورة البيع';
  END IF;

  NEW.unit_price_sdg := round(COALESCE(NEW.unit_price, NEW.unit_price_sdg, 0), 2);
  NEW.total_price_sdg := round(COALESCE(NEW.total_price, NEW.total_price_sdg, 0), 2);

  /* Preserve explicitly provided USD item price snapshots (the checkout
     knows the source product USD price). Only synthesize when absent. */
  NEW.unit_price_usd := COALESCE(
    NEW.unit_price_usd,
    round(NEW.unit_price_sdg / v_rate, 2)
  );

  NEW.total_price_usd := COALESCE(
    NEW.total_price_usd,
    round(NEW.total_price_sdg / v_rate, 2)
  );

  NEW.revenue_usd := round(COALESCE(NEW.total_price_usd, 0), 2);

  /* Product cost is already USD in the product/inventory model. */
  NEW.unit_cost_usd := COALESCE(NEW.unit_cost_usd, NEW.unit_cost, 0);
  NEW.total_cost_usd := round(NEW.quantity * NEW.unit_cost_usd, 2);

  RETURN NEW;
END;
$$;


--
-- Name: snapshot_sales_order_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_sales_order_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rate_id uuid;
  v_rate numeric(14,4);
  v_lookup_at timestamptz;
BEGIN
  v_lookup_at := COALESCE(NEW.created_at, now());

  /* -------------------------------------------------------
     Resolve ONE immutable rate snapshot.
     Priority:
       1. explicit exchange_rate_id
       2. explicit exchange_rate_used matching a stored rate
       3. latest effective stored rate at order creation
  ------------------------------------------------------- */

  IF NEW.exchange_rate_id IS NOT NULL THEN
    SELECT er.id, er.rate
      INTO v_rate_id, v_rate
    FROM public.exchange_rates er
    WHERE er.id = NEW.exchange_rate_id
      AND er.branch_id = NEW.branch_id;

    IF v_rate_id IS NULL THEN
      RAISE EXCEPTION 'سعر الصرف المحدد غير موجود لهذا الفرع';
    END IF;

  ELSIF NEW.exchange_rate_used IS NOT NULL
        AND NEW.exchange_rate_used > 0 THEN

    SELECT er.id, er.rate
      INTO v_rate_id, v_rate
    FROM public.exchange_rates er
    WHERE er.branch_id = NEW.branch_id
      AND er.rate = NEW.exchange_rate_used
      AND er.effective_at <= v_lookup_at
    ORDER BY er.effective_at DESC, er.created_at DESC
    LIMIT 1;

    IF v_rate_id IS NULL THEN
      RAISE EXCEPTION
        'سعر الصرف % غير موجود في سجل أسعار الصرف للفرع',
        NEW.exchange_rate_used;
    END IF;

  ELSE

    SELECT er.id, er.rate
      INTO v_rate_id, v_rate
    FROM public.exchange_rates er
    WHERE er.branch_id = NEW.branch_id
      AND er.effective_at <= v_lookup_at
    ORDER BY er.effective_at DESC, er.created_at DESC
    LIMIT 1;

    IF v_rate_id IS NULL OR v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION
        'لا يوجد سعر صرف فعّال للفرع. سجّل سعر السوق أولاً';
    END IF;
  END IF;

  /* The database row is authoritative; never keep a stale/foreign rate. */
  NEW.exchange_rate_id := v_rate_id;
  NEW.exchange_rate_used := v_rate;
  NEW.exchange_rate_sdg_per_usd := v_rate;

  /* -------------------------------------------------------
     These four fields are the customer-facing SDG amounts.
     Always mirror the authoritative operational fields on BOTH
     INSERT and UPDATE. This prevents stale zero snapshots.
  ------------------------------------------------------- */

  NEW.subtotal_sdg := round(COALESCE(NEW.subtotal, 0), 2);
  NEW.discount_amount_sdg := round(COALESCE(NEW.discount_amount, 0), 2);
  NEW.tax_amount_sdg := round(COALESCE(NEW.tax_amount, 0), 2);
  NEW.total_amount_sdg := round(COALESCE(NEW.total_amount, 0), 2);

  /* -------------------------------------------------------
     USD snapshots used by accounting/reporting.
  ------------------------------------------------------- */

  NEW.subtotal_usd := round(NEW.subtotal_sdg / v_rate, 2);
  NEW.discount_amount_usd := round(NEW.discount_amount_sdg / v_rate, 2);
  NEW.tax_amount_usd := round(NEW.tax_amount_sdg / v_rate, 2);
  NEW.total_amount_usd := round(NEW.total_amount_sdg / v_rate, 2);

  /* Tailoring labor is a USD base cost, with an SDG display snapshot. */
  IF NEW.tailoring_cost IS NOT NULL
     AND COALESCE(NEW.tailoring_cost_sdg, 0) = 0
     AND NEW.tailoring_cost > 0 THEN
    NEW.tailoring_cost_sdg := round(NEW.tailoring_cost * v_rate, 2);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: snapshot_sales_payment_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_sales_payment_currency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rate_id uuid;
  v_rate numeric(14,4);
BEGIN
  SELECT
    so.exchange_rate_id,
    so.exchange_rate_sdg_per_usd
  INTO
    v_rate_id,
    v_rate
  FROM public.sales_orders so
  WHERE so.id = NEW.sales_order_id;

  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'لا يوجد سعر صرف مثبت لفاتورة البيع';
  END IF;

  NEW.exchange_rate_id := v_rate_id;
  NEW.exchange_rate_sdg_per_usd := v_rate;
  NEW.amount_sdg := round(COALESCE(NEW.amount, 0), 2);
  NEW.amount_usd := round(NEW.amount_sdg / v_rate, 2);

  RETURN NEW;
END;
$$;


--
-- Name: stock_status(numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_status(p_stock numeric, p_min numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN COALESCE(p_stock, 0) <= 0 THEN 'OUT'
    WHEN COALESCE(p_stock, 0) <= COALESCE(p_min, 0) THEN 'LOW'
    ELSE 'OK'
  END;
$$;


--
-- Name: tailor_advances_exceed_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tailor_advances_exceed_cost(p_order_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT public.get_tailor_paid_sdg(p_order_id, 'ADVANCE')
       > public.get_tailor_cost_sdg(p_order_id) + 0.01;
$$;


--
-- Name: trg_product_variants_stock_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_product_variants_stock_notify() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  v_new := CASE WHEN NEW."isActive" = false THEN 'OK'
    ELSE public.stock_status(NEW."stockQuantity", NEW."minStockLevel") END;

  IF TG_OP = 'INSERT' THEN
    -- منتج جديد برصيد صفر طبيعي (لسه ما اتشترى) → مفيش إشعار
    RETURN NEW;
  END IF;

  v_old := CASE WHEN OLD."isActive" = false THEN 'OK'
    ELSE public.stock_status(OLD."stockQuantity", OLD."minStockLevel") END;

  IF v_new IS DISTINCT FROM v_old THEN
    PERFORM public.notify_variant_stock(NEW.id, v_new);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_sales_orders_resolve_delay(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_sales_orders_resolve_delay() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.order_type = 'TAILORING'
     AND NEW.tailoring_status IS DISTINCT FROM OLD.tailoring_status
     AND NEW.tailoring_status IN ('RECEIVED', 'CANCELLED', 'CONVERTED') THEN
    UPDATE public.notifications
    SET "isRead" = true
    WHERE metadata ->> 'key' = 'ORDER_DELAY:' || NEW.id::text
      AND "isRead" = false;
  END IF;

  -- لو تاريخ التسليم اتأجل لتاريخ لسه ما جاش → نسمح بإشعار جديد لو اتأخر تاني
  IF NEW.order_type = 'TAILORING'
     AND NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
     AND NEW.expected_delivery_date >= (now() AT TIME ZONE 'Africa/Khartoum')::date THEN
    DELETE FROM public.notifications
    WHERE metadata ->> 'key' = 'ORDER_DELAY:' || NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_settle_tailor_fx_from_labor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_settle_tailor_fx_from_labor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.entry_type = 'TAILOR_COST'
     AND NEW.credit_account = 'TAILORS_PAYABLE'
     AND NEW.sales_order_id IS NOT NULL THEN
    PERFORM public.settle_tailor_fx(NEW.sales_order_id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_settle_tailor_fx_from_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_settle_tailor_fx_from_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.sales_order_id IS NOT NULL THEN
    PERFORM public.settle_tailor_fx(NEW.sales_order_id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_product(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product(p_product_id uuid, p_payload jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_template public.product_templates%rowtype;

  variants_json jsonb;
  variant jsonb;

  final_variant_count integer;
  default_count integer;

  incoming_ids uuid[];
  variant_id uuid;

  generated_sku text;
  generated_barcode text;
begin

  -- Lock template داخل transaction
  select *
  into current_template
  from public.product_templates
  where id = p_product_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0002',
        message = 'المنتج غير موجود';
  end if;


  -- =======================================================
  -- Template fields
  -- =======================================================

  update public.product_templates
  set
    name =
      case
        when p_payload ? 'name'
        then p_payload ->> 'name'
        else name
      end,

    description =
      case
        when p_payload ? 'description'
        then p_payload ->> 'description'
        else description
      end,

    "categoryId" =
      case
        when p_payload ? 'categoryId'
        then (p_payload ->> 'categoryId')::uuid
        else "categoryId"
      end,

    "supplierId" =
      case
        when p_payload ? 'supplierId'
        then (p_payload ->> 'supplierId')::uuid
        else "supplierId"
      end,

    "purchaseUnit" =
      case
        when p_payload ? 'purchaseUnit'
        then p_payload ->> 'purchaseUnit'
        else "purchaseUnit"
      end,

    "sellingUnit" =
      case
        when p_payload ? 'sellingUnit'
        then p_payload ->> 'sellingUnit'
        else "sellingUnit"
      end,

    "conversionFactor" =
      case
        when p_payload ? 'conversionFactor'
        then (p_payload ->> 'conversionFactor')::numeric
        else "conversionFactor"
      end,

    images =
      case
        when p_payload ? 'images'
        then coalesce(
          array(
            select jsonb_array_elements_text(
              coalesce(p_payload -> 'images', '[]'::jsonb)
            )
          ),
          '{}'::text[]
        )
        else images
      end,

    "isActive" =
      case
        when p_payload ? 'isActive'
        then (p_payload ->> 'isActive')::boolean
        else "isActive"
      end,

    "isVisible" =
      case
        when p_payload ? 'isVisible'
        then (p_payload ->> 'isVisible')::boolean
        else "isVisible"
      end,

    "updatedAt" = now()

  where id = p_product_id;


  -- =======================================================
  -- إذا لم تُرسل variants:
  -- نحافظ عليها ونحسب hasVariants من الموجود فعليًا.
  -- =======================================================

  if not (p_payload ? 'variants') then

    select count(*)
    into final_variant_count
    from public.product_variants
    where "templateId" = p_product_id;

  else

    variants_json := p_payload -> 'variants';

    if jsonb_typeof(variants_json) <> 'array' then
      raise exception
        using
          errcode = '22023',
          message = 'بيانات Variants غير صحيحة';
    end if;

    final_variant_count := jsonb_array_length(variants_json);

    if final_variant_count < 1 then
      raise exception
        using
          errcode = '22023',
          message = 'يجب أن يحتوي المنتج على Variant واحد على الأقل';
    end if;


    -- =====================================================
    -- جمع IDs المرسلة
    -- =====================================================

    incoming_ids := coalesce(
      array(
        select (value ->> 'id')::uuid
        from jsonb_array_elements(variants_json)
        where value ? 'id'
          and nullif(value ->> 'id', '') is not null
      ),
      '{}'::uuid[]
    );


    -- =====================================================
    -- أي ID موجود يجب أن يكون تابعًا لهذا المنتج
    -- =====================================================

    for variant in
      select value
      from jsonb_array_elements(variants_json)
    loop

      if variant ? 'id'
         and nullif(variant ->> 'id', '') is not null
      then

        variant_id := (variant ->> 'id')::uuid;

        if not exists (
          select 1
          from public.product_variants
          where id = variant_id
            and "templateId" = p_product_id
        ) then

          raise exception
            using
              errcode = '23503',
              message = 'Variant غير مرتبط بهذا المنتج';

        end if;

      end if;

    end loop;


    -- =====================================================
    -- Validate default
    -- =====================================================

    if final_variant_count > 1 then

      default_count := (
        select count(*)
        from jsonb_array_elements(variants_json) as v
        where coalesce((v ->> 'isDefault')::boolean, false) = true
      );

      if default_count <> 1 then
        raise exception
          using
            errcode = '22023',
            message = 'يجب تحديد Variant افتراضي واحد فقط';
      end if;

    end if;


    -- =====================================================
    -- حذف Variants التي أزيلت من payload
    --
    -- إذا كانت مرتبطة بمخزون/حركات:
    -- FK يمنع الحذف → transaction كلها تفشل.
    -- =====================================================

    delete from public.product_variants
    where "templateId" = p_product_id
      and not (id = any(incoming_ids));


    -- =====================================================
    -- Update / Insert
    -- =====================================================

    for variant in
      select value
      from jsonb_array_elements(variants_json)
    loop

      variant_id := null;

      if variant ? 'id'
         and nullif(variant ->> 'id', '') is not null
      then
        variant_id := (variant ->> 'id')::uuid;
      end if;


      generated_sku :=
        nullif(trim(variant ->> 'sku'), '');

      if generated_sku is null then
        generated_sku := public.generate_product_sku();
      end if;


      generated_barcode :=
        nullif(trim(variant ->> 'barcode'), '');

      if generated_barcode is null then
        generated_barcode := public.generate_product_barcode();
      end if;


      if variant_id is null then

        insert into public.product_variants (
          "templateId",
          sku,
          barcode,
          "packBarcode",
          "colorName",
          "colorCode",
          size,
          length,
          width,
          "purchasePrice",
          "sellingPrice",
          "minSellingPrice",
          "minStockLevel",
          images,
          "isDefault",
          "isActive"
        )
        values (
          p_product_id,

          generated_sku,
          generated_barcode,

          nullif(trim(variant ->> 'packBarcode'), ''),
          nullif(trim(variant ->> 'colorName'), ''),
          nullif(trim(variant ->> 'colorCode'), ''),
          nullif(trim(variant ->> 'size'), ''),

          (variant ->> 'length')::numeric,
          (variant ->> 'width')::numeric,

          (variant ->> 'purchasePrice')::numeric,
          (variant ->> 'sellingPrice')::numeric,
          (variant ->> 'minSellingPrice')::numeric,

          coalesce(
            (variant ->> 'minStockLevel')::numeric,
            5
          ),

          coalesce(
            array(
              select jsonb_array_elements_text(
                coalesce(variant -> 'images', '[]'::jsonb)
              )
            ),
            '{}'::text[]
          ),

          case
            when final_variant_count = 1 then true
            else coalesce(
              (variant ->> 'isDefault')::boolean,
              false
            )
          end,

          coalesce(
            (variant ->> 'isActive')::boolean,
            true
          )
        );

      else

        update public.product_variants
        set
          sku = generated_sku,
          barcode = generated_barcode,

          "packBarcode" =
            nullif(trim(variant ->> 'packBarcode'), ''),

          "colorName" =
            nullif(trim(variant ->> 'colorName'), ''),

          "colorCode" =
            nullif(trim(variant ->> 'colorCode'), ''),

          size =
            nullif(trim(variant ->> 'size'), ''),

          length =
            (variant ->> 'length')::numeric,

          width =
            (variant ->> 'width')::numeric,

          "purchasePrice" =
            (variant ->> 'purchasePrice')::numeric,

          "sellingPrice" =
            (variant ->> 'sellingPrice')::numeric,

          "minSellingPrice" =
            (variant ->> 'minSellingPrice')::numeric,

          "minStockLevel" =
            coalesce(
              (variant ->> 'minStockLevel')::numeric,
              5
            ),

          images =
            coalesce(
              array(
                select jsonb_array_elements_text(
                  coalesce(variant -> 'images', '[]'::jsonb)
                )
              ),
              '{}'::text[]
            ),

          "isDefault" =
            case
              when final_variant_count = 1 then true
              else coalesce(
                (variant ->> 'isDefault')::boolean,
                false
              )
            end,

          "isActive" =
            coalesce(
              (variant ->> 'isActive')::boolean,
              true
            ),

          "updatedAt" = now()

        where id = variant_id
          and "templateId" = p_product_id;

      end if;

    end loop;

  end if;


  -- =======================================================
  -- hasVariants يتم اشتقاقه دائمًا من DB
  -- =======================================================

  select count(*)
  into final_variant_count
  from public.product_variants
  where "templateId" = p_product_id;


  if final_variant_count < 1 then
    raise exception
      using
        errcode = '22023',
        message = 'لا يمكن أن يكون المنتج بدون Variant';
  end if;


  update public.product_templates
  set
    "hasVariants" = final_variant_count > 1,
    "updatedAt" = now()
  where id = p_product_id;


  return p_product_id;

exception
  when others then
    raise;
end;
$$;


--
-- Name: update_tailoring_order(uuid, uuid, uuid, text, text, uuid, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_tailor record;
  v_customer_id uuid;
  v_fabric record;
  v_measurement_meters numeric(12,2);
  v_max_fabric_quantity numeric(12,2);
  v_fabric_unit_cost numeric(12,2) := 0;
  v_fabric_cost numeric(12,2) := 0;
  v_tailor_advances numeric(12,2) := 0;
  v_now timestamptz := now();
  v_tlr_rate numeric(14,4);
  v_clean_whatsapp text;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'تعديل طلبات التفصيل متاح للكاشير أو المدير فقط';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF v_order.tailoring_status <> 'NEW' THEN
    RAISE EXCEPTION 'لا يمكن تعديل الطلب بعد بدء التفصيل. التعديل متاح في حالة الطلب الجديد فقط.';
  END IF;

  IF COALESCE(trim(p_tailoring_item_name), '') = '' THEN
    RAISE EXCEPTION 'اسم العمل أو الطلب مطلوب';
  END IF;

  IF char_length(trim(p_tailoring_item_name)) > 255 THEN
    RAISE EXCEPTION 'اسم العمل أو الطلب طويل جدًا';
  END IF;

  IF p_tailoring_item_description IS NOT NULL AND char_length(trim(p_tailoring_item_description)) > 2000 THEN
    RAISE EXCEPTION 'وصف العمل طويل جدًا';
  END IF;

  IF p_intake_date IS NULL OR p_expected_delivery_date IS NULL OR p_expected_delivery_date < p_intake_date THEN
    RAISE EXCEPTION 'تواريخ الطلب غير صالحة';
  END IF;

  IF p_tailor_id IS NULL THEN
    RAISE EXCEPTION 'الخياط المسؤول عن الطلب مطلوب';
  END IF;

  SELECT id, name, phone, role, "branchId" AS branch_id
  INTO v_tailor
  FROM public.users
  WHERE id = p_tailor_id;

  IF NOT FOUND OR v_tailor.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الخياط المحدد غير موجود في هذا الفرع';
  END IF;

  IF lower(COALESCE(v_tailor.role::text, '')) <> 'tailor' THEN
    RAISE EXCEPTION 'المستخدم المحدد ليس حساب خياط';
  END IF;

  v_measurement_meters := public.calculate_tailoring_measurement_meters(p_measurements);
  v_max_fabric_quantity := round(v_measurement_meters + 1, 2);

  IF v_order.tailoring_purpose = 'CUSTOMER' THEN
    IF COALESCE(trim(p_customer_name), '') = '' THEN
      RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;

    IF COALESCE(trim(p_customer_whatsapp), '') = '' THEN
      RAISE EXCEPTION 'رقم واتساب العميل مطلوب';
    END IF;

    v_clean_whatsapp := public.normalize_whatsapp_number(p_customer_whatsapp);

    IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
      RAISE EXCEPTION 'المبلغ الإجمالي يجب أن يكون أكبر من صفر';
    END IF;

    IF round(p_total_amount, 2) <> round(v_order.total_amount, 2) THEN
      RAISE EXCEPTION 'لا يمكن تغيير إجمالي طلب العميل من شاشة التعديل. إذا تغيّر السعر أنشئ طلبًا جديدًا حتى لا نغير أثر العربون السابق.';
    END IF;

    INSERT INTO public.customers (
      branch_id,
      name,
      whatsapp_number,
      measurements,
      updated_at
    )
    VALUES (
      p_branch_id,
      trim(p_customer_name),
      v_clean_whatsapp,
      p_measurements,
      v_now
    )
    ON CONFLICT (branch_id, whatsapp_number)
    DO UPDATE SET
      name = EXCLUDED.name,
      measurements = EXCLUDED.measurements,
      updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_customer_id;
  ELSE
    IF COALESCE(p_total_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'طلب التصنيع للمخزون لا يحتوي على سعر بيع للعميل';
    END IF;

    IF COALESCE(trim(p_customer_name), '') <> '' OR COALESCE(trim(p_customer_whatsapp), '') <> '' THEN
      RAISE EXCEPTION 'طلب التصنيع للمخزون لا يحتوي على بيانات عميل';
    END IF;
  END IF;

  IF p_tailoring_cost IS NULL OR p_tailoring_cost <= 0 OR round(p_tailoring_cost, 2) <> p_tailoring_cost THEN
    RAISE EXCEPTION 'تكلفة الخياطة غير صالحة';
  END IF;

  -- المقارنة بالجنيه (الأجرة والدفعات بالجنيه)
  v_tailor_advances := public.get_tailor_paid_sdg(p_order_id, 'ADVANCE');
  v_tlr_rate := COALESCE(v_order.exchange_rate_used, public.require_exchange_rate(p_branch_id));

  IF v_tailor_advances > round(p_tailoring_cost, 2) THEN
    RAISE EXCEPTION 'تكلفة الخياطة الجديدة أقل من الدفعات المقدمة للخياط لهذا الطلب';
  END IF;

  IF p_fabric_variant_id IS NOT NULL THEN
    IF p_fabric_quantity IS NULL OR p_fabric_quantity <= 0 THEN
      RAISE EXCEPTION 'كمية القماش مطلوبة';
    END IF;

    IF round(p_fabric_quantity, 2) <> p_fabric_quantity THEN
      RAISE EXCEPTION 'كمية القماش يجب ألا تتجاوز منزلتين عشريتين';
    END IF;

    IF p_fabric_quantity < v_measurement_meters OR p_fabric_quantity > v_max_fabric_quantity THEN
      RAISE EXCEPTION
        'كمية القماش يجب أن تكون بين % و % متر',
        v_measurement_meters,
        v_max_fabric_quantity;
    END IF;

    SELECT
      v.id,
      v."templateId",
      v."averageCost",
      v."purchasePrice",
      v."stockQuantity",
      v."isActive" AS variant_active,
      pt."isActive" AS template_active,
      pt."conversionFactor"
    INTO v_fabric
    FROM public.product_variants v
    INNER JOIN public.product_templates pt ON pt.id = v."templateId"
    WHERE v.id = p_fabric_variant_id;

    IF NOT FOUND OR NOT v_fabric.variant_active OR NOT v_fabric.template_active THEN
      RAISE EXCEPTION 'القماش المحدد غير موجود أو غير نشط';
    END IF;

    IF COALESCE(v_fabric."stockQuantity", 0) < p_fabric_quantity THEN
      RAISE EXCEPTION 'كمية القماش الحالية غير كافية. المتاح: %', COALESCE(v_fabric."stockQuantity", 0);
    END IF;

    v_fabric_unit_cost := COALESCE(
      NULLIF(v_fabric."averageCost", 0),
      round(
        COALESCE(v_fabric."purchasePrice", 0) /
        COALESCE(NULLIF(v_fabric."conversionFactor", 0), 1),
        2
      ),
      0
    );
    v_fabric_cost := round(p_fabric_quantity * v_fabric_unit_cost, 2);
  END IF;

  UPDATE public.sales_orders
  SET
    tailoring_item_name = trim(p_tailoring_item_name),
    tailoring_item_description = NULLIF(trim(p_tailoring_item_description), ''),
    tailor_id = p_tailor_id,
    customer_id = CASE WHEN v_order.tailoring_purpose = 'CUSTOMER' THEN v_customer_id ELSE customer_id END,
    measurements = p_measurements,
    intake_date = p_intake_date,
    expected_delivery_date = p_expected_delivery_date,
    fabric_variant_id = p_fabric_variant_id,
    fabric_quantity = CASE WHEN p_fabric_variant_id IS NULL THEN NULL ELSE round(p_fabric_quantity, 2) END,
    tailoring_cost = round(p_tailoring_cost / v_tlr_rate, 2),
    tailoring_cost_sdg = round(p_tailoring_cost, 2),
    tailoring_fabric_cost = round(v_fabric_cost, 2),
    notes = NULLIF(trim(p_notes), ''),
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'order_number', v_order.order_number,
    'tailoring_item_name', trim(p_tailoring_item_name),
    'tailoring_fabric_cost', v_fabric_cost,
    'tailoring_cost', round(p_tailoring_cost / v_tlr_rate, 2),
    'tailoring_cost_sdg', round(p_tailoring_cost, 2),
    'tailoring_status', 'NEW'
  );
END;
$$;


--
-- Name: update_tailoring_order_status(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tailoring_order_status(p_order_id uuid, p_user_id uuid, p_branch_id uuid, p_new_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_fabric record;
  v_now timestamptz := now();
  v_fabric_cost numeric(12,2) := 0;
  v_unit_cost numeric(12,2) := 0;
  v_entry_number text;
  v_material_entry_id uuid;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'tailor', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل حالة طلب التفصيل';
  END IF;

  IF p_new_status NOT IN ('UNDER_TAILORING', 'READY_FOR_PICKUP') THEN
    RAISE EXCEPTION 'الحالة المطلوبة غير صالحة لهذه العملية';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) = 'tailor'
     AND v_order.tailor_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'لا يمكنك تعديل طلب تفصيل مسند إلى خياط آخر';
  END IF;

  /* ------------------------------------------------------------
     NEW -> UNDER_TAILORING
     This is where store fabric actually leaves raw inventory.
  ------------------------------------------------------------ */
  IF v_order.tailoring_status = 'NEW'
     AND p_new_status = 'UNDER_TAILORING' THEN

    IF v_order.tailoring_material_journal_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'تم تطبيق حركة مواد هذا الطلب بالفعل؛ لا تعاد عملية بدء التفصيل';
    END IF;

    IF v_order.fabric_variant_id IS NOT NULL THEN
      SELECT
        v.id,
        v."templateId",
        v."stockQuantity",
        v."isActive" AS variant_active,
        pt."isActive" AS template_active
      INTO v_fabric
      FROM public.product_variants v
      INNER JOIN public.product_templates pt
        ON pt.id = v."templateId"
      WHERE v.id = v_order.fabric_variant_id
      FOR UPDATE OF v;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'القماش المرتبط بالطلب غير موجود';
      END IF;

      IF NOT v_fabric.variant_active OR NOT v_fabric.template_active THEN
        RAISE EXCEPTION 'القماش المرتبط بالطلب غير نشط';
      END IF;

      IF COALESCE(v_fabric."stockQuantity", 0) < COALESCE(v_order.fabric_quantity, 0) THEN
        RAISE EXCEPTION
          'كمية القماش غير كافية لبدء التفصيل. المتاح: %، المطلوب: %',
          COALESCE(v_fabric."stockQuantity", 0),
          COALESCE(v_order.fabric_quantity, 0);
      END IF;

      v_fabric_cost := round(COALESCE(v_order.tailoring_fabric_cost, 0), 2);

      IF v_order.fabric_quantity IS NOT NULL AND v_order.fabric_quantity > 0 THEN
        v_unit_cost := round(v_fabric_cost / v_order.fabric_quantity, 2);
      END IF;

      UPDATE public.product_variants
      SET
        "stockQuantity" = round("stockQuantity" - v_order.fabric_quantity, 2),
        "updatedAt" = v_now
      WHERE id = v_order.fabric_variant_id;

      -- تم تعديل نوع الحركة هنا لتصبح 'TAILORING' بدلاً من 'PRODUCTION_ISSUE'
      INSERT INTO public.inventory_movements (
        template_id,
        variant_id,
        sales_order_id,
        movement_type,
        quantity,
        unit_cost,
        reference,
        notes,
        created_by
      )
      VALUES (
        v_fabric."templateId",
        v_order.fabric_variant_id,
        v_order.id,
        'TAILORING',
        round(v_order.fabric_quantity, 2),
        v_unit_cost,
        v_order.order_number,
        'سحب قماش خام من المخزون لطلب تفصيل',
        p_user_id
      );

      IF v_fabric_cost > 0 THEN
        v_entry_number :=
          'JE-TLR-FABRIC-WIP-' ||
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

        INSERT INTO public.journal_entries (
          entry_number,
          entry_type,
          amount,
          description,
          debit_account,
          credit_account,
          branch_id,
          created_by,
          reference,
          sales_order_id
        )
        VALUES (
          v_entry_number,
          'TAILORING_MATERIAL',
          v_fabric_cost,
          'تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل ' || v_order.order_number,
          'WORK_IN_PROGRESS',
          'INVENTORY',
          p_branch_id,
          p_user_id,
          v_order.order_number,
          v_order.id
        )
        RETURNING id INTO v_material_entry_id;
      END IF;

      UPDATE public.sales_orders
      SET
        tailoring_material_journal_entry_id = v_material_entry_id,
        production_material_journal_entry_id = CASE
          WHEN v_order.tailoring_purpose = 'PRODUCTION'
          THEN v_material_entry_id
          ELSE production_material_journal_entry_id
        END,
        updated_at = v_now
      WHERE id = v_order.id;
    END IF;

    UPDATE public.sales_orders
    SET
      tailoring_status = 'UNDER_TAILORING',
      updated_at = v_now
    WHERE id = v_order.id;

  ELSIF v_order.tailoring_status = 'UNDER_TAILORING'
        AND p_new_status = 'READY_FOR_PICKUP' THEN

    UPDATE public.sales_orders
    SET
      tailoring_status = 'READY_FOR_PICKUP',
      updated_at = v_now
    WHERE id = v_order.id;

  ELSE
    RAISE EXCEPTION
      'لا يمكن الانتقال من الحالة % إلى الحالة %',
      v_order.tailoring_status,
      p_new_status;
  END IF;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'status', p_new_status,
    'tailor_id', v_order.tailor_id,
    'cashier_id', v_order.cashier_id,
    'material_journal_entry_id', v_material_entry_id
  );
END;
$$;


--
-- Name: update_tailoring_status(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user record;
  v_order record;
  v_fabric record;
  v_now timestamptz := now();
  v_fabric_cost numeric(12,2) := 0;
  v_unit_cost numeric(12,2) := 0;
  v_entry_number text;
  v_material_entry_id uuid;
BEGIN
  SELECT id, role, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم الحالي غير موجود';
  END IF;

  IF v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم لا ينتمي إلى الفرع المحدد';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) NOT IN ('owner', 'tailor', 'cashier', 'admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل حالة طلب التفصيل';
  END IF;

  IF p_new_status NOT IN ('UNDER_TAILORING', 'READY_FOR_PICKUP') THEN
    RAISE EXCEPTION 'الحالة المطلوبة غير صالحة لهذه العملية';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND branch_id = p_branch_id
    AND order_type = 'TAILORING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب التفصيل غير موجود';
  END IF;

  IF lower(COALESCE(v_user.role::text, '')) = 'tailor'
     AND v_order.tailor_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'لا يمكنك تعديل طلب تفصيل مسند إلى خياط آخر';
  END IF;

  /* ------------------------------------------------------------
     NEW -> UNDER_TAILORING
     This is where store fabric actually leaves raw inventory.
  ------------------------------------------------------------ */
  IF v_order.tailoring_status = 'NEW'
     AND p_new_status = 'UNDER_TAILORING' THEN

    IF v_order.tailoring_material_journal_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'تم تطبيق حركة مواد هذا الطلب بالفعل؛ لا تعاد عملية بدء التفصيل';
    END IF;

    IF v_order.fabric_variant_id IS NOT NULL THEN
      SELECT
        v.id,
        v."templateId",
        v."stockQuantity",
        v."isActive" AS variant_active,
        pt."isActive" AS template_active
      INTO v_fabric
      FROM public.product_variants v
      INNER JOIN public.product_templates pt
        ON pt.id = v."templateId"
      WHERE v.id = v_order.fabric_variant_id
      FOR UPDATE OF v;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'القماش المرتبط بالطلب غير موجود';
      END IF;

      IF NOT v_fabric.variant_active OR NOT v_fabric.template_active THEN
        RAISE EXCEPTION 'القماش المرتبط بالطلب غير نشط';
      END IF;

      IF COALESCE(v_fabric."stockQuantity", 0) < COALESCE(v_order.fabric_quantity, 0) THEN
        RAISE EXCEPTION
          'كمية القماش غير كافية لبدء التفصيل. المتاح: %، المطلوب: %',
          COALESCE(v_fabric."stockQuantity", 0),
          COALESCE(v_order.fabric_quantity, 0);
      END IF;

      v_fabric_cost := round(COALESCE(v_order.tailoring_fabric_cost, 0), 2);

      IF v_order.fabric_quantity IS NOT NULL AND v_order.fabric_quantity > 0 THEN
        v_unit_cost := round(v_fabric_cost / v_order.fabric_quantity, 2);
      END IF;

      UPDATE public.product_variants
      SET
        "stockQuantity" = round("stockQuantity" - v_order.fabric_quantity, 2),
        "updatedAt" = v_now
      WHERE id = v_order.fabric_variant_id;

      INSERT INTO public.inventory_movements (
        template_id,
        variant_id,
        sales_order_id,
        movement_type,
        quantity,
        unit_cost,
        reference,
        notes,
        created_by
      )
      VALUES (
        v_fabric."templateId",
        v_order.fabric_variant_id,
        v_order.id,
        'PRODUCTION_ISSUE',
        round(v_order.fabric_quantity, 2),
        v_unit_cost,
        v_order.order_number,
        'سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل',
        p_user_id
      );

      IF v_fabric_cost > 0 THEN
        v_entry_number :=
          'JE-TLR-FABRIC-WIP-' ||
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

        INSERT INTO public.journal_entries (
          entry_number,
          entry_type,
          amount,
          description,
          debit_account,
          credit_account,
          branch_id,
          created_by,
          reference,
          sales_order_id
        )
        VALUES (
          v_entry_number,
          'TAILORING_MATERIAL',
          v_fabric_cost,
          'تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل ' || v_order.order_number,
          'WORK_IN_PROGRESS',
          'INVENTORY',
          p_branch_id,
          p_user_id,
          v_order.order_number,
          v_order.id
        )
        RETURNING id INTO v_material_entry_id;
      END IF;

      UPDATE public.sales_orders
      SET
        tailoring_material_journal_entry_id = v_material_entry_id,
        production_material_journal_entry_id = CASE
          WHEN v_order.tailoring_purpose = 'PRODUCTION'
          THEN v_material_entry_id
          ELSE production_material_journal_entry_id
        END,
        updated_at = v_now
      WHERE id = v_order.id;
    END IF;

    UPDATE public.sales_orders
    SET
      tailoring_status = 'UNDER_TAILORING',
      updated_at = v_now
    WHERE id = v_order.id;

  ELSIF v_order.tailoring_status = 'UNDER_TAILORING'
        AND p_new_status = 'READY_FOR_PICKUP' THEN

    UPDATE public.sales_orders
    SET
      tailoring_status = 'READY_FOR_PICKUP',
      updated_at = v_now
    WHERE id = v_order.id;

  ELSE
    RAISE EXCEPTION
      'لا يمكن الانتقال من الحالة % إلى الحالة %',
      v_order.tailoring_status,
      p_new_status;
  END IF;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'status', p_new_status,
    'tailor_id', v_order.tailor_id,
    'cashier_id', v_order.cashier_id,
    'material_journal_entry_id', v_material_entry_id
  );
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   NEW."updatedAt" = NOW();
   RETURN NEW;
END;
$$;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    created_by uuid,
    name character varying(255) NOT NULL,
    category character varying(50) NOT NULL,
    purchase_value numeric(12,2) NOT NULL,
    purchase_date date NOT NULL,
    payment_method character varying(10) NOT NULL,
    reference character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    exchange_rate_used numeric(14,4),
    purchase_value_usd numeric(14,2),
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    purchase_value_sdg numeric(20,2),
    CONSTRAINT assets_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'SDG'::text]))),
    CONSTRAINT assets_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'BANK'::character varying])::text[]))),
    CONSTRAINT assets_value_check CHECK ((purchase_value > (0)::numeric))
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    "imageUrl" text,
    "createdAt" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    name text NOT NULL,
    whatsapp_number text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    measurements jsonb,
    CONSTRAINT customers_measurements_array_check CHECK (((measurements IS NULL) OR (jsonb_typeof(measurements) = 'array'::text)))
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    purchase_order_id uuid,
    movement_type character varying(30) NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    reference character varying(100),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sales_order_id uuid,
    unit_cost_usd numeric(20,6),
    total_cost_usd numeric(20,2),
    CONSTRAINT inventory_movements_movement_type_check CHECK (((movement_type)::text = ANY ('{PURCHASE,SALE,PURCHASE_RETURN,SALE_RETURN,ADJUSTMENT_IN,ADJUSTMENT_OUT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,GIFT,OPENING_STOCK}'::text[]))),
    CONSTRAINT inventory_movements_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_movements_single_source_check CHECK ((NOT ((purchase_order_id IS NOT NULL) AND (sales_order_id IS NOT NULL)))),
    CONSTRAINT inventory_movements_type_check CHECK (((movement_type)::text = ANY ('{ADJUSTMENT_IN,ADJUSTMENT_OUT,GIFT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,PURCHASE,PURCHASE_RETURN,SALE,SALE_RETURN,TAILORING,OPENING_STOCK}'::text[]))),
    CONSTRAINT inventory_movements_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number character varying(50) NOT NULL,
    purchase_order_id uuid,
    created_by uuid,
    branch_id uuid NOT NULL,
    entry_type character varying(30) NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    debit_account character varying(100) NOT NULL,
    credit_account character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference character varying(100),
    sales_order_id uuid,
    currency text NOT NULL,
    exchange_rate_used numeric(14,4),
    amount_usd numeric(14,2) NOT NULL,
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    source_currency text,
    amount_sdg numeric(20,2),
    CONSTRAINT journal_entries_accounts_check CHECK (((debit_account)::text <> (credit_account)::text)),
    CONSTRAINT journal_entries_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT journal_entries_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'SDG'::text]))),
    CONSTRAINT journal_entries_currency_consistency_check CHECK ((((currency = 'USD'::text) AND (amount_usd = amount)) OR ((currency = 'SDG'::text) AND (exchange_rate_used > (0)::numeric) AND (amount_usd >= (0)::numeric)))),
    CONSTRAINT journal_entries_entry_type_check CHECK (((entry_type)::text = ANY ((ARRAY['CAPITAL'::character varying, 'PURCHASE'::character varying, 'PURCHASE_PAYMENT'::character varying, 'SALE'::character varying, 'SALE_PAYMENT'::character varying, 'CUSTOMER_ADVANCE'::character varying, 'CUSTOMER_ADVANCE_REFUND'::character varying, 'TAILOR_ADVANCE'::character varying, 'TAILOR_ADVANCE_APPLICATION'::character varying, 'TAILOR_COST'::character varying, 'TAILOR_PAYMENT'::character varying, 'TAILORING_MATERIAL'::character varying, 'PRODUCTION'::character varying, 'COGS'::character varying, 'EXPENSE'::character varying, 'ASSET'::character varying, 'INVENTORY_ADJUSTMENT'::character varying, 'SALES_RETURN'::character varying, 'OTHER'::character varying, 'CURRENCY_EXCHANGE'::character varying, 'GIFT'::character varying])::text[]))),
    CONSTRAINT journal_entries_source_currency_check CHECK ((source_currency = ANY (ARRAY['SDG'::text, 'USD'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'SYSTEM'::text NOT NULL,
    link text,
    "isRead" boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    target_roles text[]
);


--
-- Name: product_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "categoryId" uuid,
    "supplierId" uuid,
    "hasVariants" boolean DEFAULT false NOT NULL,
    "purchaseUnit" text,
    "sellingUnit" text,
    "conversionFactor" numeric DEFAULT 1,
    images text[] DEFAULT '{}'::text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "isVisible" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT product_templates_conversion_factor_check CHECK ((("conversionFactor" IS NULL) OR ("conversionFactor" > (0)::numeric)))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "templateId" uuid NOT NULL,
    sku character varying(100),
    barcode character varying(100),
    "packBarcode" character varying(100),
    "colorName" text,
    "colorCode" text,
    size text,
    length numeric(10,2),
    width numeric(10,2),
    "purchasePrice" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "sellingPrice" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "minSellingPrice" numeric(12,2) DEFAULT 0.00,
    "stockQuantity" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "minStockLevel" numeric(12,2) DEFAULT 5.00,
    images text[] DEFAULT '{}'::text[],
    "isDefault" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "averageCost" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT product_variants_average_cost_check CHECK (("averageCost" >= (0)::numeric)),
    CONSTRAINT product_variants_length_check CHECK (((length IS NULL) OR (length >= (0)::numeric))),
    CONSTRAINT product_variants_min_selling_le_selling_check CHECK ((("minSellingPrice" IS NULL) OR ("minSellingPrice" <= "sellingPrice"))),
    CONSTRAINT product_variants_min_selling_price_check CHECK ((("minSellingPrice" IS NULL) OR ("minSellingPrice" >= (0)::numeric))),
    CONSTRAINT product_variants_min_stock_level_check CHECK ((("minStockLevel" IS NULL) OR ("minStockLevel" >= (0)::numeric))),
    CONSTRAINT product_variants_purchase_price_check CHECK (("purchasePrice" >= (0)::numeric)),
    CONSTRAINT product_variants_selling_price_check CHECK (("sellingPrice" >= (0)::numeric)),
    CONSTRAINT product_variants_stock_quantity_check CHECK (("stockQuantity" >= (0)::numeric)),
    CONSTRAINT product_variants_width_check CHECK (((width IS NULL) OR (width >= (0)::numeric)))
);


--
-- Name: COLUMN product_variants."purchasePrice"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_variants."purchasePrice" IS 'آخر تكلفة شراء بوحدة الشراء بالدولار (USD).';


--
-- Name: COLUMN product_variants."sellingPrice"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_variants."sellingPrice" IS 'سعر البيع بالجنيه السوداني (SDG).';


--
-- Name: COLUMN product_variants."minSellingPrice"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_variants."minSellingPrice" IS 'أدنى سعر بيع بالجنيه السوداني (SDG).';


--
-- Name: COLUMN product_variants."averageCost"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_variants."averageCost" IS 'متوسط التكلفة المرجّح بوحدة البيع بالدولار (USD).';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    template_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity numeric(12,2) NOT NULL,
    received_quantity numeric(12,2) DEFAULT 0.00 NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    allocated_delivery_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    effective_unit_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unit_cost_usd numeric(20,6),
    effective_unit_cost_usd numeric(20,6),
    subtotal_usd numeric(20,2),
    CONSTRAINT purchase_order_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT purchase_order_items_received_quantity_check CHECK (((received_quantity >= (0)::numeric) AND (received_quantity <= quantity))),
    CONSTRAINT purchase_order_items_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_order_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_order_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payment_method character varying(30),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reference character varying(100),
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    amount_usd numeric(20,2),
    amount_sdg numeric(20,2),
    CONSTRAINT purchase_order_payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(50) NOT NULL,
    supplier_id uuid,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    purchase_type character varying(20) DEFAULT 'WORKFLOW'::character varying NOT NULL,
    order_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expected_date date,
    subtotal numeric(12,2) DEFAULT 0.00 NOT NULL,
    delivery_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    notes text,
    created_by uuid,
    received_by uuid,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    subtotal_usd numeric(20,2),
    delivery_cost_usd numeric(20,2),
    discount_amount_usd numeric(20,2),
    total_amount_usd numeric(20,2),
    total_amount_sdg numeric(20,2),
    CONSTRAINT purchase_orders_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'APPROVED'::character varying, 'RECEIVED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT purchase_orders_type_check CHECK (((purchase_type)::text = ANY ((ARRAY['DIRECT'::character varying, 'WORKFLOW'::character varying])::text[])))
);


--
-- Name: sales_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_order_id uuid NOT NULL,
    template_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_gift boolean DEFAULT false NOT NULL,
    gift_note text,
    unit_price_usd numeric(14,2),
    total_price_usd numeric(14,2),
    unit_price_sdg numeric(20,2),
    total_price_sdg numeric(20,2),
    revenue_usd numeric(20,2),
    unit_cost_usd numeric(20,6),
    total_cost_usd numeric(20,2),
    CONSTRAINT sales_order_items_gift_note_check CHECK (((char_length(gift_note) <= 500) AND ((is_gift = true) OR (gift_note IS NULL)))),
    CONSTRAINT sales_order_items_gift_price_check CHECK (((is_gift = false) OR ((unit_price = (0)::numeric) AND (total_price = (0)::numeric)))),
    CONSTRAINT sales_order_items_prices_check CHECK (((unit_price >= (0)::numeric) AND (unit_cost >= (0)::numeric) AND (total_price >= (0)::numeric))),
    CONSTRAINT sales_order_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT sales_order_items_quantity_positive_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT sales_order_items_total_price_check CHECK ((total_price = round((quantity * unit_price), 2)))
);


--
-- Name: sales_order_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    payment_method character varying(30) NOT NULL,
    reference character varying(100),
    notes text,
    created_by uuid,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    amount_sdg numeric(20,2),
    amount_usd numeric(20,2),
    CONSTRAINT sales_order_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT sales_order_payments_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying])::text[])))
);


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(50) NOT NULL,
    branch_id uuid NOT NULL,
    cashier_id uuid,
    subtotal numeric(12,2) DEFAULT 0.00 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    payment_method character varying(30) DEFAULT 'CASH'::character varying NOT NULL,
    payment_status character varying(30) DEFAULT 'PAID'::character varying NOT NULL,
    status character varying(30) DEFAULT 'COMPLETED'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_type character varying(20) DEFAULT 'POS'::character varying NOT NULL,
    customer_id uuid,
    tailor_id uuid,
    sales_journal_entry_id uuid,
    cogs_journal_entry_id uuid,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tailoring_status text,
    intake_date date,
    expected_delivery_date date,
    measurements jsonb,
    fabric_variant_id uuid,
    fabric_quantity numeric(12,2),
    tailoring_cost numeric(12,2) DEFAULT 0 NOT NULL,
    tailoring_cogs_journal_entry_id uuid,
    tailoring_purpose text DEFAULT 'CUSTOMER'::text NOT NULL,
    tailoring_fabric_cost numeric(12,2) DEFAULT 0 NOT NULL,
    produced_product_template_id uuid,
    produced_product_variant_id uuid,
    produced_quantity numeric(12,2),
    production_total_cost numeric(12,2),
    production_material_journal_entry_id uuid,
    production_labor_journal_entry_id uuid,
    production_inventory_journal_entry_id uuid,
    tailoring_material_journal_entry_id uuid,
    tailoring_labor_journal_entry_id uuid,
    customer_advance_journal_entry_id uuid,
    customer_advance_recognition_journal_entry_id uuid,
    tailoring_item_name text,
    tailoring_item_description text,
    cancellation_reason text,
    converted_to_product_at timestamp with time zone,
    subtotal_usd numeric(14,2),
    total_amount_usd numeric(14,2),
    exchange_rate_used numeric(14,4),
    tailoring_cost_sdg numeric(14,2),
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    subtotal_sdg numeric(20,2),
    discount_amount_sdg numeric(20,2),
    tax_amount_sdg numeric(20,2),
    total_amount_sdg numeric(20,2),
    discount_amount_usd numeric(20,2),
    tax_amount_usd numeric(20,2),
    CONSTRAINT sales_orders_amounts_check CHECK (((subtotal >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (total_amount >= (0)::numeric))),
    CONSTRAINT sales_orders_amounts_consistency_check CHECK ((total_amount = ((subtotal - discount_amount) + tax_amount))),
    CONSTRAINT sales_orders_discount_check CHECK ((discount_amount <= subtotal)),
    CONSTRAINT sales_orders_fabric_quantity_check CHECK (((fabric_quantity IS NULL) OR (fabric_quantity > (0)::numeric))),
    CONSTRAINT sales_orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['POS'::character varying, 'TAILORING'::character varying])::text[]))),
    CONSTRAINT sales_orders_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying, 'MIXED'::character varying])::text[]))),
    CONSTRAINT sales_orders_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying])::text[]))),
    CONSTRAINT sales_orders_produced_quantity_check CHECK (((produced_quantity IS NULL) OR (produced_quantity > (0)::numeric))),
    CONSTRAINT sales_orders_production_total_cost_check CHECK (((production_total_cost IS NULL) OR (production_total_cost >= (0)::numeric))),
    CONSTRAINT sales_orders_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'RETURNED'::character varying])::text[]))),
    CONSTRAINT sales_orders_tailoring_cost_check CHECK ((tailoring_cost >= (0)::numeric)),
    CONSTRAINT sales_orders_tailoring_fabric_cost_check CHECK ((tailoring_fabric_cost >= (0)::numeric)),
    CONSTRAINT sales_orders_tailoring_purpose_check CHECK ((tailoring_purpose = ANY (ARRAY['CUSTOMER'::text, 'PRODUCTION'::text]))),
    CONSTRAINT sales_orders_tailoring_status_check CHECK (((tailoring_status IS NULL) OR (tailoring_status = ANY (ARRAY['NEW'::text, 'UNDER_TAILORING'::text, 'READY_FOR_PICKUP'::text, 'RECEIVED'::text, 'CANCELLED'::text]))))
);


--
-- Name: COLUMN sales_orders.tailoring_material_journal_entry_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.tailoring_material_journal_entry_id IS 'قيد تحويل قماش الطلب من المخزون إلى إنتاج تحت التشغيل عند بدء التفصيل';


--
-- Name: COLUMN sales_orders.tailoring_labor_journal_entry_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.tailoring_labor_journal_entry_id IS 'قيد إثبات تكلفة الخياط كالتزام عند اكتمال الطلب أو استلام الإنتاج';


--
-- Name: COLUMN sales_orders.customer_advance_journal_entry_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.customer_advance_journal_entry_id IS 'قيد استلام عربون العميل كالتزام CUSTOMER_ADVANCES قبل تحقق الإيراد';


--
-- Name: COLUMN sales_orders.customer_advance_recognition_journal_entry_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.customer_advance_recognition_journal_entry_id IS 'قيد تحويل رصيد عربون العميل إلى المبيعات عند استلام الطلب';


--
-- Name: COLUMN sales_orders.tailoring_item_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales_orders.tailoring_item_name IS 'اسم العمل/القطعة محل التفصيل، ويجب أن يكون واضحاً للموظف والعميل';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    "contactPerson" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    notes text
);


--
-- Name: tailor_commission_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tailor_commission_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    tailor_id uuid NOT NULL,
    sales_order_id uuid,
    amount numeric(12,2) NOT NULL,
    payment_method text NOT NULL,
    notes text,
    journal_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_type text DEFAULT 'SETTLEMENT'::text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    amount_original numeric(14,2),
    exchange_rate_used numeric(14,4),
    exchange_rate_id uuid,
    exchange_rate_sdg_per_usd numeric(20,6),
    amount_sdg numeric(20,2),
    amount_usd numeric(20,2),
    CONSTRAINT tailor_commission_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT tailor_commission_payments_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'SDG'::text]))),
    CONSTRAINT tailor_commission_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['CASH'::text, 'BANK'::text]))),
    CONSTRAINT tailor_commission_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['ADVANCE'::text, 'SETTLEMENT'::text])))
);


--
-- Name: COLUMN tailor_commission_payments.payment_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tailor_commission_payments.payment_type IS 'ADVANCE = دفع مقدم للخياط قبل إثبات تكلفة العمل; SETTLEMENT = سداد لمستحق مثبت';


--
-- Name: tailoring_customer_advance_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tailoring_customer_advance_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method text NOT NULL,
    journal_entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT tailoring_customer_advance_refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT tailoring_customer_advance_refunds_payment_method_check CHECK ((payment_method = ANY (ARRAY['CASH'::text, 'BANK_TRANSFER'::text])))
);


--
-- Name: TABLE tailoring_customer_advance_refunds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tailoring_customer_advance_refunds IS 'استردادات أرصدة عربون العملاء من الطلبات الملغاة';


--
-- Name: tailoring_customer_advance_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tailoring_customer_advance_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_order_id uuid NOT NULL,
    to_order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT tailoring_customer_advance_transfers_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT tailoring_customer_advance_transfers_different_orders CHECK ((from_order_id <> to_order_id))
);


--
-- Name: TABLE tailoring_customer_advance_transfers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tailoring_customer_advance_transfers IS 'تخصيص رصيد عربون موجود من طلب عميل ملغي إلى طلب عميل بديل بدون حركة نقدية جديدة';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    role public."Role" DEFAULT 'CASHIER'::public."Role" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isPasswordChanged" boolean DEFAULT false NOT NULL,
    salary double precision,
    shift text,
    phone text,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    "position" text,
    "branchId" uuid,
    "commissionRate" numeric DEFAULT 50,
    "resetRequested" boolean DEFAULT false
);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
4d299643-c5fd-4ac7-95d2-6dd1e8d557cc	c381c4795d8225e0a86a252107a67f5a1569733ac1a88cef4f32d111463009fe	2026-08-07 17:28:18.513853+00	20260807172817_init	\N	\N	2026-08-07 17:28:18.014682+00	1
85e198ca-ddfd-463a-8a74-c07017f5d258	efc5bbf334b7ff4c027bb35fdf3eba9e06af5d013594c8c5dbd45541d9d1a071	2026-08-19 12:42:27.078905+00	20260819124225_init_users_and_branches	\N	\N	2026-08-19 12:42:25.934623+00	1
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assets (id, branch_id, created_by, name, category, purchase_value, purchase_date, payment_method, reference, notes, created_at, updated_at, currency, exchange_rate_used, purchase_value_usd, exchange_rate_id, exchange_rate_sdg_per_usd, purchase_value_sdg) FROM stdin;
a27daa8b-1fce-41ff-aa8f-97e336365344	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ماكينة خياطة كهرباء	MACHINE	5000.00	2026-09-15	BANK	\N	\N	2026-09-20 20:42:41.351235+00	2026-09-20 20:42:41.351235+00	USD	\N	5000.00	\N	\N	\N
2d12ac66-44a2-4095-9fc4-2d3c57da86a0	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	مكيف غاز	AIR_CONDITIONER	1500.00	2026-09-13	CASH	\N	\N	2026-09-20 20:43:43.096457+00	2026-09-20 20:43:43.096457+00	USD	\N	1500.00	\N	\N	\N
2688f0fc-4a73-4cdb-9ab1-b9ea5e629d51	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	حاسب	OTHER	700.00	2026-09-22	CASH	\N	\N	2026-09-22 16:53:43.686318+00	2026-09-22 16:53:43.686318+00	USD	\N	700.00	\N	\N	\N
7fabb307-d30b-4e8e-96e1-8f4c2969c0cc	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	طابعة	OTHER	1500000.00	2026-10-05	CASH	\N	\N	2026-10-05 16:24:34.633969+00	2026-10-05 16:24:34.633969+00	SDG	8700.0000	172.41	\N	\N	\N
a43a2502-53ab-4a03-8d0f-b5402d3a5cef	dcc40a00-1275-463f-9cd8-caf5487100b0	48143da1-d832-40d6-99a0-2262bd58f2a4	جهاز حاسوب	COMPUTER	2000000.00	2026-10-08	CASH	\N	\N	2026-10-07 19:48:04.338849+00	2026-10-07 19:48:04.338849+00	SDG	8700.0000	229.89	\N	\N	\N
8628ff97-3be4-4d57-9523-a8240237d5e0	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ماكينة خياطة	MACHINE	5000000.00	2026-10-08	BANK	\N	\N	2026-10-08 11:47:46.827264+00	2026-10-08 11:47:46.827264+00	SDG	8500.0000	588.24	\N	\N	\N
bcce6e77-649b-4121-b9c2-c53b6511ebfe	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	طاولة خشبية	FURNITURE	1500000.00	2026-10-09	CASH	\N	\N	2026-10-08 11:52:00.387439+00	2026-10-08 11:52:00.387439+00	SDG	8500.0000	176.47	\N	\N	\N
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branches (id, name, code, "createdAt", "updatedAt") FROM stdin;
dcc40a00-1275-463f-9cd8-caf5487100b0	main-branch	BCH001	2026-08-20 08:45:43.4	2026-08-20 10:45:35
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, description, "imageUrl", "createdAt", "updatedAt") FROM stdin;
a954b0a9-5c5c-4193-bd52-40accf920164	اقمشة	\N	https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/categories/1788295625275-m1mp0gdt.png	2026-09-01 20:47:15.924399+00	2026-09-01 20:47:15.924399+00
7a70dd70-a3ce-4592-88fd-7e02b34fea1a	احذية	\N	https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/categories/1788297122927-6ez0vxkt.png	2026-09-01 21:12:16.651843+00	2026-09-01 21:12:16.651843+00
3093ea40-0e14-4b99-b1da-228aa484c6cf	جلاليب		https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/categories/1788386310674-dcexhj60.png	2026-09-02 21:58:48.852903+00	2026-09-02 21:59:17.507+00
6698e760-b238-4800-9752-296667248124	صديري	\N	https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/categories/1788621285151-7t5p2qh4.png	2026-09-05 15:14:52.187609+00	2026-09-05 15:14:52.187609+00
929f5bdf-cd05-4e70-8c2c-3e36f3719375	عطور	\N	\N	2026-09-14 18:03:39.343902+00	2026-09-14 18:03:39.343902+00
4a8c1e2a-e142-45d5-96de-e0eb41620f3a	شالات	\N	\N	2026-10-06 10:28:29.870091+00	2026-10-06 10:28:29.870091+00
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, branch_id, name, whatsapp_number, notes, created_at, updated_at, measurements) FROM stdin;
76f35be8-5ab6-446d-968b-26e6430e24cd	dcc40a00-1275-463f-9cd8-caf5487100b0	عمر	011115996330	\N	2026-09-24 11:55:43.2422+00	2026-09-24 11:55:43.2422+00	[{"unit": "M", "label": "الطول", "value": 3}, {"unit": "M", "label": "الصدر", "value": 1.5}, {"unit": "M", "label": "الكتف", "value": 1.7}, {"unit": "M", "label": "الخصر", "value": 2.4}]
ec893243-c18f-438d-9695-da951a5c95e6	dcc40a00-1275-463f-9cd8-caf5487100b0	عبدالله بدر	249147852369	\N	2026-09-25 11:38:42.727451+00	2026-09-25 11:38:42.727451+00	[{"unit": "M", "label": "الطول", "value": 2.7}, {"unit": "CM", "label": "الصدر", "value": 85}, {"unit": "CM", "label": "الكتف", "value": 95}, {"unit": "M", "label": "الخصر", "value": 1.7}]
5bb80bfb-ac62-4541-8295-9f239ccf3b41	dcc40a00-1275-463f-9cd8-caf5487100b0	موسى التاج	249962252686	\N	2026-10-07 14:45:22.07637+00	2026-10-07 21:14:49.575181+00	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 100}, {"unit": "CM", "label": "الخصر", "value": 100}]
ca9476f4-0623-41df-b39e-527d9199ad29	dcc40a00-1275-463f-9cd8-caf5487100b0	الطاهر حسن	01171175963	\N	2026-09-29 14:27:05.462559+00	2026-09-29 14:27:05.462559+00	[{"unit": "M", "label": "الطول", "value": 2.5}, {"unit": "CM", "label": "الصدر", "value": 50}, {"unit": "CM", "label": "الكتف", "value": 75}, {"unit": "M", "label": "الخصر", "value": 1.5}]
1e01c482-d1b6-4fdb-a096-b2318070c090	dcc40a00-1275-463f-9cd8-caf5487100b0	احمد محمد	0918066523	\N	2026-09-25 19:33:38.401782+00	2026-10-08 14:08:20.530981+00	[{"unit": "M", "label": "الطول", "value": 3.5}, {"unit": "M", "label": "العرض", "value": 2.7}]
b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	dcc40a00-1275-463f-9cd8-caf5487100b0	عبدالله عثمان	249962252687	\N	2026-10-01 17:16:21.636176+00	2026-10-08 17:57:26.91471+00	[{"unit": "M", "label": "الطول", "value": 2.5}, {"unit": "M", "label": "العرض", "value": 1.5}, {"unit": "CM", "label": "الاكمام", "value": 65}]
458eb845-c9c4-40df-9083-872aece41bf5	dcc40a00-1275-463f-9cd8-caf5487100b0	مهند تاج السر	01055586377	\N	2026-09-30 08:58:44.344231+00	2026-10-01 16:56:32.145813+00	[{"unit": "M", "label": "الطول", "value": 1.25}, {"unit": "CM", "label": "الصدر", "value": 50}, {"unit": "CM", "label": "الكتف", "value": 35}, {"unit": "CM", "label": "الخصر", "value": 0.8}]
e530c37a-c5a8-43e6-afc4-adc788a863b1	dcc40a00-1275-463f-9cd8-caf5487100b0	طلال باسم	249963353683	\N	2026-10-03 19:48:40.627024+00	2026-10-03 19:48:40.627024+00	[{"unit": "M", "label": "الطول", "value": 2}, {"unit": "CM", "label": "الخصر", "value": 150}]
c0d04b14-fdea-4753-bd50-0b13d5aae32f	dcc40a00-1275-463f-9cd8-caf5487100b0	عمر عبدالله	249918077820	\N	2026-10-07 20:38:58.394635+00	2026-10-08 18:27:13.248758+00	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 70}, {"unit": "CM", "label": "الكتف", "value": 45}]
\.


--
-- Data for Name: exchange_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exchange_rates (id, branch_id, rate, effective_at, notes, created_by, created_at) FROM stdin;
615c056a-931f-4bbb-9b68-707d29668b80	dcc40a00-1275-463f-9cd8-caf5487100b0	8700.0000	2026-10-05 12:11:25.715325+00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 12:11:25.715325+00
c62dc8fd-3223-4201-9d28-eabbac7f8b74	dcc40a00-1275-463f-9cd8-caf5487100b0	8500.0000	2026-10-07 19:50:42.015675+00	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	2026-10-07 19:50:42.015675+00
302ea13b-ab71-4381-b9a4-0fe7ea197bc8	dcc40a00-1275-463f-9cd8-caf5487100b0	9000.0000	2026-10-08 11:54:17.913844+00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 11:54:17.913844+00
\.


--
-- Data for Name: inventory_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_movements (id, template_id, variant_id, purchase_order_id, movement_type, quantity, unit_cost, reference, notes, created_by, created_at, sales_order_id, unit_cost_usd, total_cost_usd) FROM stdin;
4c34cb73-3900-48c0-a84e-00575398cd54	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10331d15-5840-4085-930e-5576ad505d37	PURCHASE	10.00	110.00	PO-PO-53573637	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:32:56.573812+00	\N	\N	\N
2e14bf12-a20b-4eda-959f-12cb9226dcec	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	6.00	118.18	INV-2026-000001	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:37:20.801847+00	bf466e39-01a5-4d6a-b43a-be4599b79932	\N	\N
5bef437b-187a-4f4a-8373-a4aee8845e67	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	PURCHASE	15.00	156.67	PO-PO-54250139	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:44:13.091552+00	\N	\N	\N
ee9cbeeb-8af6-437a-ad1b-8be1a6f88458	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	82efce3e-585f-4bc2-889d-0204b28aba18	PURCHASE	10.00	127.00	PO-PO-54760243	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:52:43.318671+00	\N	\N	\N
33bc20fc-0cc0-46aa-a9dd-89d4680f6b8e	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	1ac925e1-5889-40ed-a676-c7d44f995cdd	PURCHASE	6.00	120.00	PO-PO-54856325	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:54:19.40886+00	\N	\N	\N
45747e6f-5852-4d18-b50e-cf3d9b944564	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	1ac925e1-5889-40ed-a676-c7d44f995cdd	PURCHASE	10.00	100.00	PO-PO-54856325	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:54:19.866385+00	\N	\N	\N
d35ad84b-c0f3-4b83-9e14-765c8a51ab6b	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	5cda9713-8395-4c4d-976e-0abac15cceb5	PURCHASE	10.00	120.00	PO-PO-55207780	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 22:00:08.948632+00	\N	\N	\N
04433a00-2420-4d43-8271-52a4d6daf67a	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	728b3939-7cb1-4d63-b83f-f17ca0d00ef7	PURCHASE	10.00	104.00	PO-PO-11305140	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 13:35:06.021891+00	\N	\N	\N
174f2eee-c42c-4a28-b786-48635d534676	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	5531ec6a-553b-4fd0-a508-cdb2bc340825	PURCHASE	15.00	115.33	PO-PO-34452606	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 20:00:54.215751+00	\N	\N	\N
f401ec18-ae69-44ab-a9ea-7c6c7737b7d1	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	c58a3523-0263-4644-9c11-c3e3dbb1bcb7	PURCHASE	10.00	55.00	PO-PO-35117864	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 20:17:42.921361+00	\N	\N	\N
7b3bcbab-9cb4-44dc-9128-18c8eecc892a	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	ADJUSTMENT_OUT	2.00	110.00	تسوية يدوية	تلف في البضاعة	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 20:32:22.053648+00	\N	\N	\N
ba7b0fcd-5737-4c32-b849-50a61274aacb	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	ADJUSTMENT_IN	2.00	110.00	تسوية يدوية	مرتجع من العميل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 12:11:08.231062+00	\N	\N	\N
20ccce35-4b41-4ea9-99b2-c012455d9d3c	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	5.00	97.46	INV-2026-000002	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 13:24:33.956233+00	d32de191-3239-4776-9248-cba7e9ea85ef	\N	\N
5c329c76-c120-488f-8b12-45ffcca05020	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	\N	SALE	6.00	129.51	INV-2026-000002	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 13:24:33.956233+00	d32de191-3239-4776-9248-cba7e9ea85ef	\N	\N
aad4fbc9-e889-42b7-ac34-70d8ec2a5f7d	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	SALE	5.00	115.33	INV-2026-000002	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 13:24:33.956233+00	d32de191-3239-4776-9248-cba7e9ea85ef	\N	\N
f22134fa-2fdc-46b9-91bc-a5c69b943787	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	\N	SALE	15.00	129.51	INV-2026-000003	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 13:26:08.268334+00	7735a69e-9ec3-4a3f-bf95-843db37d11b7	\N	\N
4d8f4934-0e4e-4cc4-ae75-ef1e3b9d680c	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	10.00	97.46	INV-2026-000003	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 13:26:08.268334+00	7735a69e-9ec3-4a3f-bf95-843db37d11b7	\N	\N
f8b8b1c6-3504-4b1e-9aad-b9c03fbca576	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	30dccc98-4ad4-4975-a628-8d5ce2808949	PURCHASE	1.00	126.67	PO-PO-99807711	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 14:10:09.336513+00	\N	\N	\N
18f8bc5b-42e9-4037-a175-9e7c7b91a46b	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	30dccc98-4ad4-4975-a628-8d5ce2808949	PURCHASE	1.00	116.67	PO-PO-99807711	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 14:10:10.180353+00	\N	\N	\N
240c957e-7aa0-4517-bcaf-2de32b0f3116	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	30dccc98-4ad4-4975-a628-8d5ce2808949	PURCHASE	1.00	66.67	PO-PO-99807711	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 14:10:10.793642+00	\N	\N	\N
a8d2b4bc-2036-48e9-9485-4592db55897b	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	11ce7ef4-4c0d-4374-b1d5-74640466cc7e	PURCHASE	1.00	650.00	PO-PO-13762090	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:02:43.634018+00	\N	\N	\N
60742f74-a92c-4df2-837b-db517465e6f2	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	992d5384-dcf1-4eb2-a690-b24884d0385f	PURCHASE	10.00	45.00	PO-PO-14317462	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:11:59.41088+00	\N	\N	\N
fa805f17-b83d-4c2b-80b2-08c7e87da10c	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	80f3de33-aa61-40ca-b453-ebc2911669ba	PURCHASE	1.00	620.00	PO-PO-14831301	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:20:33.659964+00	\N	\N	\N
1d668283-217c-4093-a973-ad914b3c1ab8	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	PURCHASE	10.00	50.00	PO-PO-15386922	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:29:48.565715+00	\N	\N	\N
1c77afed-e1b0-402a-843b-61294237f5dd	332f8d1e-b025-455d-9b1f-8e3caab88295	90d344c2-29ef-43fb-b673-be3709878379	5f24a0a0-87d1-4a2e-908a-151f27becd65	PURCHASE	1.00	650.00	PO-PO-20643269	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 19:57:24.901517+00	\N	\N	\N
aba6b5a7-7214-4847-a707-7224f745a617	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	38704339-879a-46e7-b77c-6acbf06ce345	PURCHASE	8.00	203.75	PO-PO-24060126	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 20:56:57.289691+00	\N	\N	\N
54ad8358-515d-4b4f-878c-694019b54b35	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	38704339-879a-46e7-b77c-6acbf06ce345	PURCHASE	8.00	38.75	PO-PO-24060126	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 20:56:57.779916+00	\N	\N	\N
c0eedd3a-09f6-4755-b599-56c789c37cdd	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	b595b476-2619-4949-bcea-e43c5fd3b06c	PURCHASE	50.00	16.90	PO-PO-27137679	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 21:45:39.583649+00	\N	\N	\N
77749318-a81f-41a3-961b-bb6a6743eb2a	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	f5dd6d93-5f89-4f60-b817-e52f51eb9f76	PURCHASE	50.00	16.60	PO-PO-28106176	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 22:01:47.865527+00	\N	\N	\N
c2672800-34f7-4d55-a9a9-5986f2d3a8a8	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	ADJUSTMENT_OUT	3.00	16.75	ADJ-1790070886273	عجز	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 09:54:47.30416+00	\N	\N	\N
c8084783-71ad-4c18-8ca6-01a855c2d640	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	SALE	1.00	116.36	INV-2026-000004	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:57:31.578643+00	6a407f0b-e422-49a1-ae65-c0c18751e0f8	\N	\N
b6b6631a-76b3-46c6-bd7b-bf229ff2ffaf	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	SALE	8.00	42.22	INV-2026-000004	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:57:31.578643+00	6a407f0b-e422-49a1-ae65-c0c18751e0f8	\N	\N
375b46d2-43f5-427e-bbff-c606d1408c1f	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	17.00	16.75	INV-2026-000004	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:57:31.578643+00	6a407f0b-e422-49a1-ae65-c0c18751e0f8	\N	\N
679352a2-1adc-4acf-b015-959b469d6ca7	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	\N	SALE	5.00	50.00	INV-2026-000005	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:59:27.599953+00	9b42c995-89ab-4f6c-8023-49439102304c	\N	\N
5ad3c2e3-9058-4cec-9efb-2ac9d38afbd8	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	SALE	5.00	116.36	INV-2026-000005	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:59:27.599953+00	9b42c995-89ab-4f6c-8023-49439102304c	\N	\N
c0f5841e-53e3-4bab-bd99-9451a2e9a16f	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	\N	SALE	11.00	128.90	INV-2026-000005	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 12:59:27.599953+00	9b42c995-89ab-4f6c-8023-49439102304c	\N	\N
4dc8ff87-9d0c-45ef-8e75-e2b6ac254b77	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	ADJUSTMENT_OUT	5.00	16.75	ADJ-1790084356345	كمية تالفة	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:39:17.602522+00	\N	\N	\N
60045d7a-216c-4df3-9eb9-e5e0dd6c78bc	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	92431a52-65ae-4a53-8d53-66cb208ffd5e	PURCHASE	9.00	47.79	PO-PO-85291993	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:54:54.795313+00	\N	\N	\N
53bbcf88-2660-45fa-a860-0671708bfd5b	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	92431a52-65ae-4a53-8d53-66cb208ffd5e	PURCHASE	16.00	37.79	PO-PO-85291993	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:54:55.405497+00	\N	\N	\N
a8f98260-a0ad-4690-8ab7-e9b80a0165b1	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	\N	ADJUSTMENT_OUT	5.00	48.58	ADJ-1790085505147	بضاعة مرجوعة	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:58:26.362518+00	\N	\N	\N
36b8fe01-fb59-4c01-80ad-c02340f271e7	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	SALE	6.00	39.49	INV-2026-000006	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-23 11:33:20.414415+00	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	\N	\N
ca7b8c77-bba4-43f2-9af5-dbd560b0f6f4	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	1.00	95.99	INV-2026-000006	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-23 11:33:20.414415+00	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	\N	\N
218d469f-2e85-44cd-9ea2-e83ab5cd50f6	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	5.00	95.99	INV-2026-000007	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-23 11:35:11.987159+00	7cf2cb23-ce5c-4958-97b0-067c92e64d1f	\N	\N
1e46cdef-6105-4a8d-afd9-80ba673160a9	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	1.00	16.75	INV-2026-000008	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-23 11:41:55.512244+00	4364a355-8a9a-49d4-ab14-b03828966fcf	\N	\N
f9b508ed-8920-4747-938f-0799ac51c611	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	8.60	16.75	TLR-2026-000001	استهلاك قماش لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-24 11:55:43.2422+00	ed8fdb00-392f-40e6-b5e2-869fde5971e8	\N	\N
2eab675a-6774-4202-8657-20fe9c00826a	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	7.00	16.75	TLR-2026-000002	استهلاك قماش لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-25 11:38:42.727451+00	32e76cfa-5829-449a-9042-3cca2339e394	\N	\N
f7c3bb65-ae0a-434a-b70c-96ee1b43dde1	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	3.03	16.75	TLR-2026-000004	استهلاك قماش لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-25 19:47:38.082203+00	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	\N	\N
8e62b6be-a0bd-4cb7-ac7f-742ff7fcd69c	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	6.75	16.75	TLR-2026-000005	إصدار قماش خام إلى تحت التشغيل لطلب تصنيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-26 12:03:29.667535+00	0bb8de45-cb81-4750-a7c4-573f2f17b31b	\N	\N
a954c7af-b3c4-45ae-bb3a-b44bda127aa4	d9f347d4-54d5-4171-a1ed-25f96686f714	0e39be16-e69f-457c-a79f-06d398dd5679	\N	PRODUCTION_RECEIPT	1.00	313.06	TLR-2026-000005	إدخال المنتج المصنع إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-26 13:56:30.323617+00	0bb8de45-cb81-4750-a7c4-573f2f17b31b	\N	\N
f81bf011-bdce-4b66-921f-9331be55a799	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	5.50	16.75	TLR-2026-000007	استهلاك قماش لطلب تفصيل عميل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-29 14:27:05.462559+00	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	\N	\N
90c56a51-9182-4c16-b745-186e0b68d093	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	5.55	16.75	TLR-2026-000008	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-30 09:00:27.395751+00	4000a711-48a2-45f0-a38b-7d9388694566	\N	\N
497006b2-7825-4e3d-a8e8-3dc0259407bf	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	2.80	16.75	TLR-2026-000011	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-01 17:24:39.96835+00	cd4a56e5-e67f-4f97-904b-74f6c263940d	\N	\N
81fca30f-b5be-4e79-bbf6-cfdb5ec9a8fe	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	1.50	16.75	TLR-2026-000012	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 14:58:45.114402+00	79aa7a70-cacf-48b5-942e-df55e8c43697	\N	\N
3dca5ca2-816f-4411-813a-cdd1c99a7d6e	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	\N	PRODUCTION_RECEIPT	1.00	55.13	TLR-2026-000012	إدخال المنتج النهائي المصنع إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 15:01:11.419312+00	79aa7a70-cacf-48b5-942e-df55e8c43697	\N	\N
222bdb55-3ea4-4738-81bf-4b147b3e22bf	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	\N	SALE	1.00	55.13	INV-2026-000009	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 15:03:46.997059+00	c712117f-2745-468c-b22a-8e6c4c6957f6	\N	\N
e00164bd-61ed-4bb6-be4d-eb8aca3d1b15	63ae0a9d-ee2c-4004-9730-b8602c376b4b	af637885-884b-4b1c-887f-a90df270f350	\N	PRODUCTION_RECEIPT	1.00	150.00	TLR-2026-000013	إدخال المنتج الناتج من تحويل طلب العميل إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 15:05:59.675297+00	95ad07a7-e8d7-47fd-852e-96f52c582149	\N	\N
e85978ee-afc6-4c03-9ab4-114a72f8e356	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	3.07	16.75	INV-2026-000010	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 18:51:44.978169+00	ccd941fd-89d4-42ae-9026-71746b54c591	\N	\N
87d88c92-1824-4b54-ba41-208a45486d20	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	29d2c46f-9801-4b85-b8ae-0a442e4a6901	PURCHASE	6.00	51.29	PO-PO-67807132	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:03:28.662163+00	\N	\N	\N
fc12afa1-4883-43a3-9ff3-e460a81e0d1c	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	29d2c46f-9801-4b85-b8ae-0a442e4a6901	PURCHASE	10.00	51.29	PO-PO-67807132	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:03:29.125049+00	\N	\N	\N
18813cfb-c0e7-4baf-87f7-e0f13621bb74	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	29d2c46f-9801-4b85-b8ae-0a442e4a6901	PURCHASE	15.00	46.29	PO-PO-67807132	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:03:29.690204+00	\N	\N	\N
23776329-5b04-4c5a-bee4-60b2059517ca	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	\N	SALE	3.00	46.29	INV-2026-000011	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:04:42.372754+00	41b93550-8214-475c-af11-168e61131fc3	\N	\N
7ec6ef45-189a-4f24-b06f-044c2f06cb31	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	\N	SALE	3.00	51.29	INV-2026-000011	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:04:42.372754+00	41b93550-8214-475c-af11-168e61131fc3	\N	\N
a7dec041-3864-44a2-9141-e1ca350ca57a	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	\N	SALE	2.00	46.29	INV-2026-000012	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-03 17:05:54.626068+00	f7be6afe-9e7e-4323-8c0a-15f107f034dc	\N	\N
3610c80b-27be-4a46-90b1-8d0d11e3450d	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	GIFT	1.00	116.36	INV-2026-000012	هدية من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-03 17:05:54.626068+00	f7be6afe-9e7e-4323-8c0a-15f107f034dc	\N	\N
d6fc55a9-6b4a-4ddb-9172-8880f83ea89c	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	3.50	16.75	TLR-2026-000015	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-03 19:49:12.195878+00	70817a11-a4f4-4997-96e7-83478c1bdbcf	\N	\N
b5c3caf7-fc45-4a67-b7b4-04ac6fa525db	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	SALE	1.00	39.49	INV-2026-000013	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 16:17:20.946215+00	8c6542d2-da07-4852-8ab6-e2ecf3ac0337	\N	\N
bca62771-0146-460a-a44b-533a68ec8241	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	\N	SALE	2.00	128.90	INV-2026-000014	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 16:18:14.819252+00	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	\N	\N
5451924e-3923-4ccc-9741-cacec5c48dca	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	1.00	95.99	INV-2026-000014	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 16:18:14.819252+00	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	\N	\N
2223f194-707b-406b-bb84-18d57efb243f	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	1.00	16.75	INV-2026-000015	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 18:43:49.777219+00	eac12289-7a38-4c51-bfc0-1eac5d6f2533	\N	\N
3289a8a5-4786-4dd2-8432-d598aceb7fb8	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	\N	SALE	3.00	46.29	INV-2026-000016	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 18:45:12.868772+00	2aadb231-35cf-4fe0-b02f-99a062736230	\N	\N
93b24dfb-fabb-4ce6-a733-13187f122088	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	\N	SALE	3.00	51.29	INV-2026-000016	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-05 18:45:12.868772+00	2aadb231-35cf-4fe0-b02f-99a062736230	\N	\N
1a67f184-2ab6-482d-a34d-93dc598abc0d	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	7.70	16.75	INV-2026-000017	بيع من نقطة البيع	48143da1-d832-40d6-99a0-2262bd58f2a4	2026-10-06 09:43:10.028458+00	24155e69-8f6b-4977-8f50-757efce7d852	\N	\N
76586239-048d-431b-b1cf-8763c623376e	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	GIFT	2.00	39.49	INV-2026-000017	هدية من نقطة البيع - العميل فاتورته تجاوزت 200000	48143da1-d832-40d6-99a0-2262bd58f2a4	2026-10-06 09:43:10.028458+00	24155e69-8f6b-4977-8f50-757efce7d852	\N	\N
26f82da5-e44e-4a5b-8b2e-c76777cd372a	fe14a8e5-4e88-4fe8-aac3-1573062735e4	915a64a8-d226-459f-bbbb-ca52fefbd3dc	\N	OPENING_STOCK	12.00	7.00	JE-OPEN-F0759E8F12	مخزون افتتاحي	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-06 14:29:56.922893+00	\N	7.000000	84.00
661b3581-6efb-4936-9bbe-46c8b5089c8f	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	\N	PURCHASE	1.00	75.13	PO-PO-09998243	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-06 18:06:43.456313+00	\N	75.130000	75.13
738b2d3f-fca5-414b-ba71-3c911e2ed22a	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	\N	PURCHASE	1.00	75.13	PO-PO-10168511	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-06 18:09:30.979099+00	\N	75.130000	75.13
b8e75732-185e-458c-a7bc-6a6aed53fcdf	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	5fb226d7-22f3-4015-81ea-e22396659b7b	PURCHASE	1.00	75.13	PO-PO-14147263	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-06 19:15:49.703023+00	\N	75.130000	75.13
e1ada714-79cd-4fb6-a837-9c1c3f981b29	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	1.00	16.75	INV-2026-000018	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 12:29:28.100799+00	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	16.750000	16.75
1ffbbeb0-74f0-4d50-950b-3f0d6f2d9e29	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	\N	SALE	1.00	95.99	INV-2026-000018	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 12:29:28.100799+00	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	95.990000	95.99
50f33e86-e8d0-424f-a5f5-7ae900c2fe23	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	\N	GIFT	2.00	51.29	INV-2026-000019	هدية من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 12:31:03.588689+00	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	51.290000	102.58
7428b29b-dbfb-4ef0-97ce-24d5285ea5b8	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	\N	SALE	1.00	75.13	INV-2026-000019	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 12:31:03.588689+00	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	75.130000	75.13
8059da51-0d6b-46da-85a8-d1f93cd0e000	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	3.00	16.75	TLR-2026-000017	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 13:08:58.339661+00	56f2aba1-04df-441a-84f9-d2b5200fc323	16.750000	50.25
cf685f0b-b541-4fdd-9208-50cfec88b596	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	GIFT	1.00	39.49	INV-2026-000020	هدية من نقطة البيع - العميل اشثرى باكثر من 250000	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-07 20:05:52.576516+00	90313135-dbd4-4f15-97c0-8f31ba2595d3	39.490000	39.49
0f3ca593-1814-4b4c-aef4-0f805ccffe47	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	\N	SALE	1.00	48.58	INV-2026-000020	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-07 20:05:52.576516+00	90313135-dbd4-4f15-97c0-8f31ba2595d3	48.580000	48.58
ae58f303-5b74-4099-bee0-3816b53f7dc6	fe14a8e5-4e88-4fe8-aac3-1573062735e4	915a64a8-d226-459f-bbbb-ca52fefbd3dc	\N	SALE	1.00	7.00	INV-2026-000020	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-07 20:05:52.576516+00	90313135-dbd4-4f15-97c0-8f31ba2595d3	7.000000	7.00
954c5257-46bc-40ab-820a-2b9772f2b900	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	3.00	16.75	TLR-2026-000020	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	979147a7-a426-4e30-b90b-5f81f606c48b	2026-10-07 20:47:20.972945+00	db05a618-fcc7-407e-91bf-dc8d54248a4a	16.750000	50.25
1fac360a-8a68-4df7-99af-7ca76b013c06	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	3.00	16.75	TLR-2026-000018	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	979147a7-a426-4e30-b90b-5f81f606c48b	2026-10-07 20:47:42.539505+00	5566880c-fb25-4263-9c6c-b25b2b3e7133	16.750000	50.25
3d2f0cb0-c59c-4f64-8b2f-9817dc08c570	5512d3fe-cf9d-48e1-a925-f6e842615563	69ae184f-f5a2-4b8b-a4b3-ffe167670003	\N	PRODUCTION_RECEIPT	1.00	54.37	TLR-2026-000020	إدخال المنتج الناتج من تحويل طلب العميل إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 21:01:27.978792+00	db05a618-fcc7-407e-91bf-dc8d54248a4a	54.370000	54.37
53d0de48-286e-4ee0-9127-2aef52889161	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	3.80	16.75	TLR-2026-000021	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 21:15:36.887908+00	1fc23e98-e75a-4bae-a67a-5a34e6e81810	16.750000	63.65
d5b2c4bc-fc4f-4932-8d29-5699911787e5	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	2.50	16.75	TLR-2026-000022	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 21:23:42.189508+00	25a58694-8006-4bc0-b17f-4d50982eb949	16.750000	41.88
1156270b-57b4-47c1-b53d-b87fd87b11ba	1b8475e5-a387-45d0-992e-eb5e4ed076e7	8a58c754-f822-4278-b688-b05c9ae03db5	\N	OPENING_STOCK	15.00	18.00	JE-OPEN-7A4CFB8554	مخزون افتتاحي	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 22:44:47.504861+00	\N	18.000000	270.00
918e3385-5bac-4ed3-a752-877c4c21f6c7	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	1.00	16.75	INV-2026-000021	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:15:26.25196+00	067e3336-485d-4400-a3a7-34995323dd68	16.750000	16.75
97aebd1c-96c4-4861-982c-69aba40ba85d	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	GIFT	1.00	39.49	INV-2026-000021	هدية من نقطة البيع - شراء باكثر من 200000	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:15:26.25196+00	067e3336-485d-4400-a3a7-34995323dd68	39.490000	39.49
71cea212-a63b-41c4-a80d-7310b6fd9ef8	1b8475e5-a387-45d0-992e-eb5e4ed076e7	8a58c754-f822-4278-b688-b05c9ae03db5	\N	SALE	2.00	18.00	INV-2026-000021	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:15:26.25196+00	067e3336-485d-4400-a3a7-34995323dd68	18.000000	36.00
c64525c6-6833-4d9e-a886-5a9f0c1bebba	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	\N	SALE	1.00	51.29	INV-2026-000021	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:15:26.25196+00	067e3336-485d-4400-a3a7-34995323dd68	51.290000	51.29
70244468-5a12-46af-a5ab-9582eff50322	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	\N	GIFT	1.00	39.49	INV-2026-000022	هدية من نقطة البيع - اشتري باكثر من 150000	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:48:03.816797+00	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	39.490000	39.49
6c40f6b3-32e1-4deb-b20d-9abd493cdcf1	1b8475e5-a387-45d0-992e-eb5e4ed076e7	8a58c754-f822-4278-b688-b05c9ae03db5	\N	SALE	2.00	18.00	INV-2026-000022	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:48:03.816797+00	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	18.000000	36.00
0ea08099-dae9-45ba-bc8f-8f3d32cff2e4	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	\N	SALE	1.00	51.29	INV-2026-000022	بيع من نقطة البيع	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	2026-10-08 16:48:03.816797+00	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	51.290000	51.29
82c7235a-1ae9-464c-94b2-4892d483a238	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	ce254f54-c400-4947-a3f4-dc8e9cc90d60	PURCHASE	50.00	3.20	PO-PO-78304634	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 16:51:47.021091+00	\N	3.200000	160.00
0fc5ed46-9e0e-43f3-89e9-3818f129ef7b	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	SALE	3.70	3.39	INV-2026-000023	بيع من نقطة البيع	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 16:52:40.933653+00	596812e5-b325-41d5-8999-b40ce5ccb633	3.390000	12.54
57843060-3efc-494f-9c46-5f9850a4b4c2	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	5.00	3.39	TLR-2026-000024	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	979147a7-a426-4e30-b90b-5f81f606c48b	2026-10-08 18:01:17.637203+00	e6d6005b-6315-453b-9344-122572ffa2e7	3.390000	16.95
b3f4a8ec-4b45-4500-a8cb-186c99db9bdd	af22a815-e7de-4720-ada3-eb1ee2866a43	66665726-b6a5-4dd8-a640-6de10b14b770	\N	PRODUCTION_RECEIPT	1.00	22.51	TLR-2026-000024	إدخال المنتج الناتج من تحويل طلب العميل إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:22:19.006868+00	e6d6005b-6315-453b-9344-122572ffa2e7	22.510000	22.51
788cfae8-5af8-4637-ab68-6322e079e495	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	\N	PRODUCTION_ISSUE	2.60	3.39	TLR-2026-000028	سحب قماش خام من المخزون إلى الإنتاج تحت التشغيل لطلب تفصيل	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:31:21.354701+00	576f7912-4ad1-436c-a955-a0b5b990f405	3.390000	8.81
3ebee3f8-9376-425b-afe5-255abe8fa8e1	38d676aa-deeb-4f36-96f1-357b91e1ae61	b730c00c-0681-468f-b2d3-3b4e4a8ad92d	\N	PRODUCTION_RECEIPT	1.00	12.14	TLR-2026-000028	إدخال المنتج النهائي المصنع إلى المخزون	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:32:24.62697+00	576f7912-4ad1-436c-a955-a0b5b990f405	12.140000	12.14
dfaee275-d525-4831-bacc-1a0f50b53100	872a6c4f-a23d-41ac-b003-c40f442cc559	bca4c82c-295b-4fc3-9adc-6f2e2708ac88	\N	OPENING_STOCK	14.00	3.00	JE-OPEN-9151575556	مخزون افتتاحي	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 19:14:44.408399+00	\N	3.000000	42.00
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.journal_entries (id, entry_number, purchase_order_id, created_by, branch_id, entry_type, amount, description, debit_account, credit_account, created_at, reference, sales_order_id, currency, exchange_rate_used, amount_usd, exchange_rate_id, exchange_rate_sdg_per_usd, source_currency, amount_sdg) FROM stdin;
a964bca0-6335-47e2-95c3-cbc94db603ce	JE-REV-INV-2026-000013	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	478500.00	مبيعات نقطة البيع INV-2026-000013 - CASH	CASH	SALES	2026-10-05 16:17:20.946215+00	INV-2026-000013	8c6542d2-da07-4852-8ab6-e2ecf3ac0337	SDG	8700.0000	55.00	\N	\N	SDG	\N
60fb06e3-32dd-463c-8301-d96a3e05664b	JE-COGS-INV-2026-000013	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	39.49	تكلفة المبيعات للفاتورة INV-2026-000013	COGS	INVENTORY	2026-10-05 16:17:20.946215+00	INV-2026-000013	8c6542d2-da07-4852-8ab6-e2ecf3ac0337	USD	\N	39.49	\N	\N	USD	\N
78ae3611-b868-48b0-936c-0b04a9ea8df9	JE-REV-INV-2026-000014	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	3480000.00	مبيعات نقطة البيع INV-2026-000014 - CASH	CASH	SALES	2026-10-05 16:18:14.819252+00	INV-2026-000014	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	SDG	8700.0000	400.00	\N	\N	SDG	\N
4845b768-f34d-441c-99c0-435d9521ac38	JE-COGS-INV-2026-000014	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	353.79	تكلفة المبيعات للفاتورة INV-2026-000014	COGS	INVENTORY	2026-10-05 16:18:14.819252+00	INV-2026-000014	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	USD	\N	353.79	\N	\N	USD	\N
f5d65d2f-175f-4bf1-b70a-9d0a8259519f	JE-REV-INV-2026-000017	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1004850.00	مبيعات نقطة البيع INV-2026-000017 - BANK_TRANSFER	BANK	SALES	2026-10-06 09:43:10.028458+00	INV-2026-000017	24155e69-8f6b-4977-8f50-757efce7d852	SDG	8700.0000	115.50	\N	\N	SDG	\N
0a8ae29d-0b43-419b-97dd-1637f91d8cd6	JE-COGS-INV-2026-000017	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	128.98	تكلفة المبيعات للفاتورة INV-2026-000017	COGS	INVENTORY	2026-10-06 09:43:10.028458+00	INV-2026-000017	24155e69-8f6b-4977-8f50-757efce7d852	USD	\N	128.98	\N	\N	USD	\N
a77a8805-d34c-434e-ba9a-367e0f5a460f	JE-GIFT-INV-2026-000017	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	GIFT	78.98	تكلفة هدايا مع الفاتورة INV-2026-000017	GIFTS	INVENTORY	2026-10-06 09:43:10.028458+00	INV-2026-000017	24155e69-8f6b-4977-8f50-757efce7d852	USD	\N	78.98	\N	\N	USD	\N
eb241d98-9e3d-43c2-a684-4a90ff457274	JE-2026-46E04B9075	9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	2350.00	دفعة للمورد عن طلب الشراء PO-54250139	SUPPLIERS	CASH	2026-09-19 21:44:14.513717+00	\N	\N	USD	\N	2350.00	\N	\N	USD	\N
0e21ca0d-5000-435b-b393-05c8e815638f	JE-2026-B9B175AD77	82efce3e-585f-4bc2-889d-0204b28aba18	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1270.00	دفعة للمورد عن طلب الشراء PO-54760243	SUPPLIERS	BANK	2026-09-19 21:52:44.864687+00	\N	\N	USD	\N	1270.00	\N	\N	USD	\N
31fa1ccd-91ee-4178-8c50-f920dfde3789	JE-2026-B5A481D7BA	1ac925e1-5889-40ed-a676-c7d44f995cdd	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1720.00	دفعة للمورد عن طلب الشراء PO-54856325	SUPPLIERS	BANK	2026-09-19 21:54:21.251491+00	\N	\N	USD	\N	1720.00	\N	\N	USD	\N
6d219c55-4f45-466b-bd83-b5aa84ff557b	JE-2026-9A98CBE7E4	728b3939-7cb1-4d63-b83f-f17ca0d00ef7	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1040.00	شراء PO-11305140	INVENTORY	SUPPLIERS	2026-09-20 13:35:06.396541+00	PO-PO-11305140	\N	USD	\N	1040.00	\N	\N	USD	\N
32c4a61e-62f6-4388-bbd9-6be0e06c5244	JE-2026-61DF692AA9	5531ec6a-553b-4fd0-a508-cdb2bc340825	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1030.00	دفعة للمورد عن طلب الشراء PO-34452606	SUPPLIERS	CASH	2026-09-20 20:06:46.836767+00	\N	\N	USD	\N	1030.00	\N	\N	USD	\N
ba200cbb-02b3-4ab1-8528-89af32c5875e	JE-2026-6AAC2D8786	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	20000.00	راس مال افتتاحي يودع في الحساب البنكي بقيمة عشرون الف ريال	BANK	CAPITAL	2026-09-20 20:38:50.175181+00	\N	\N	USD	\N	20000.00	\N	\N	USD	\N
13dd11db-a395-4582-ab89-c2a8e98d3995	JE-2026-8DE794FBA6	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	5000.00	شراء أصل: ماكينة خياطة كهرباء	ASSETS	BANK	2026-09-20 20:42:41.485661+00	\N	\N	USD	\N	5000.00	\N	\N	USD	\N
6e13e7af-2f1f-44ac-a37a-27cbd8595621	JE-2026-EE0E13D27E	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	1500.00	شراء أصل: مكيف غاز	ASSETS	CASH	2026-09-20 20:43:43.2144+00	\N	\N	USD	\N	1500.00	\N	\N	USD	\N
46a5ad4a-4ed2-4f15-9e44-624ec773708d	JE-2026-E3D23A9B05	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	300.00	فاتورة الكهرباء	ELECTRICITY	BANK	2026-09-21 13:22:23.275996+00	\N	\N	USD	\N	300.00	\N	\N	USD	\N
d8aac907-cc90-424c-a466-6cd95efdce15	JE-REV-INV-2026-000002	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	2040.00	إثبات مبيعات نقطة البيع رقم INV-2026-000002	CASH	SALES	2026-09-21 13:24:33.956233+00	INV-2026-000002	d32de191-3239-4776-9248-cba7e9ea85ef	USD	\N	2040.00	\N	\N	USD	\N
74859ad4-1e24-4955-9bb8-99715d066812	JE-COGS-INV-2026-000002	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	1841.01	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000002	COGS	INVENTORY	2026-09-21 13:24:33.956233+00	INV-2026-000002	d32de191-3239-4776-9248-cba7e9ea85ef	USD	\N	1841.01	\N	\N	USD	\N
684cdf22-ba76-4f0b-816e-19b681075bc5	JE-REV-INV-2026-000003	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	3300.00	إثبات مبيعات نقطة البيع رقم INV-2026-000003	CASH	SALES	2026-09-21 13:26:08.268334+00	INV-2026-000003	7735a69e-9ec3-4a3f-bf95-843db37d11b7	USD	\N	3300.00	\N	\N	USD	\N
b3cd82e0-242e-4e99-9b8e-120d9fd9b9e1	JE-COGS-INV-2026-000003	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	2917.25	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000003	COGS	INVENTORY	2026-09-21 13:26:08.268334+00	INV-2026-000003	7735a69e-9ec3-4a3f-bf95-843db37d11b7	USD	\N	2917.25	\N	\N	USD	\N
2fb0885d-f55c-4a29-8ad0-5ed7a89645d8	JE-2026-0B99AA3019	30dccc98-4ad4-4975-a628-8d5ce2808949	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	310.00	شراء PO-99807711	INVENTORY	SUPPLIERS	2026-09-21 14:10:11.191914+00	PO-PO-99807711	\N	USD	\N	310.00	\N	\N	USD	\N
eec7811d-83f9-46c6-85af-5aed498a9f04	JE-2026-0B419BCD8B	30dccc98-4ad4-4975-a628-8d5ce2808949	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	200.00	دفعة للمورد عن طلب الشراء PO-99807711	SUPPLIERS	BANK	2026-09-21 14:10:12.673642+00	\N	\N	USD	\N	200.00	\N	\N	USD	\N
79fd4baa-f988-4822-a4ea-c5b90b711961	JE-2026-0EF7DBD41B	992d5384-dcf1-4eb2-a690-b24884d0385f	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	450.00	شراء PO-14317462	INVENTORY	SUPPLIERS	2026-09-21 18:11:59.803975+00	PO-PO-14317462	\N	USD	\N	450.00	\N	\N	USD	\N
da66ea04-2433-46c9-a17e-775e1ea364f5	JE-2026-9F9EDF36A4	80f3de33-aa61-40ca-b453-ebc2911669ba	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	620.00	شراء PO-14831301	INVENTORY	SUPPLIERS	2026-09-21 18:20:34.271844+00	PO-PO-14831301	\N	USD	\N	620.00	\N	\N	USD	\N
7165b675-0ff3-44b5-8f3a-eec16fd9845d	JE-2026-EA4E442394	80f3de33-aa61-40ca-b453-ebc2911669ba	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	620.00	دفعة للمورد عن طلب الشراء PO-14831301	SUPPLIERS	BANK	2026-09-21 18:20:35.743971+00	\N	\N	USD	\N	620.00	\N	\N	USD	\N
d5a2be47-e40d-4025-8be8-ae32e463bfa1	JE-2026-1EDE52BB7B	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	200.00	دفعة للمورد عن طلب الشراء PO-15386922	SUPPLIERS	CASH	2026-09-21 18:34:22.384619+00	\N	\N	USD	\N	200.00	\N	\N	USD	\N
18fd4de0-f01d-4ec4-8062-fa7b1a0a01cd	JE-2026-6A36C021FF	5fb226d7-22f3-4015-81ea-e22396659b7b	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	75.13	شراء PO-14147263	INVENTORY	SUPPLIERS	2026-10-06 19:15:50.120309+00	PO-PO-14147263	\N	USD	\N	75.13	\N	\N	USD	\N
379f4927-ba75-4d9b-8be9-469cfe7a7522	JE-2026-D2ADBF58A7	5fb226d7-22f3-4015-81ea-e22396659b7b	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	75.13	دفعة للمورد عن طلب الشراء PO-14147263	SUPPLIERS	BANK	2026-10-06 19:15:52.510593+00	\N	\N	USD	\N	75.13	\N	\N	USD	\N
3772a1b2-e493-4cbc-9421-54bed68d1b62	JE-TLR-FABRIC-WIP-9D158D74E8	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	50.25	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000017	WORK_IN_PROGRESS	INVENTORY	2026-10-07 13:08:58.339661+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	USD	\N	50.25	\N	\N	USD	\N
c910ef61-d528-4923-b728-e6d26ba31eb8	JE-TLR-CUST-ADV-0095A4A749	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	125000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000020	BANK	CUSTOMER_ADVANCES	2026-10-07 20:38:58.394635+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	SDG	8500.0000	14.71	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	125000.00
441b78ab-9e6a-46fc-add7-3062b0642a52	JE-TLR-CONVERT-LABOR-9950154596	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	4.12	إثبات تكلفة خياطة الطلب المحول إلى منتج TLR-2026-000020	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-07 21:01:27.978792+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	USD	\N	4.12	\N	\N	USD	\N
9e7b46a5-71d2-4a65-b302-c47d0d6f0447	JE-TLR-FX-368B3166C0	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CURRENCY_EXCHANGE	0.01	ربح فرق صرف على أجرة الخياط - TLR-2026-000020	TAILORS_PAYABLE	CURRENCY_EXCHANGE	2026-10-07 21:01:27.978792+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	USD	\N	0.01	\N	\N	USD	\N
9a69bb8b-764a-4172-a798-6d2a9cf95d8e	AST-1791217473155	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	1500000.00	شراء أصل: طابعة	ASSETS	CASH	2026-10-05 16:24:34.633969+00	\N	\N	SDG	8700.0000	172.41	\N	\N	SDG	\N
a093cb4a-b9b2-4ecc-b097-c507fc29f980	JE-TLR-REV-ADV-7ECF29719B	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	275.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000001	CUSTOMER_ADVANCES	SALES	2026-10-06 10:25:39.607968+00	TLR-2026-000001	ed8fdb00-392f-40e6-b5e2-869fde5971e8	SDG	8700.0000	0.03	\N	\N	SDG	\N
2e0e5037-5432-4b99-a466-dfbac5312ae8	JE-TLR-REV-FINAL-2A2E952F8E	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	275.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000001	BANK	SALES	2026-10-06 10:25:39.607968+00	TLR-2026-000001	ed8fdb00-392f-40e6-b5e2-869fde5971e8	SDG	8700.0000	0.03	\N	\N	SDG	\N
7216c818-ed0b-4613-9d62-4dfee31e309a	JE-2026-FA39FBD028	38704339-879a-46e7-b77c-6acbf06ce345	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1940.00	شراء PO-24060126	INVENTORY	SUPPLIERS	2026-09-21 20:56:58.159202+00	PO-PO-24060126	\N	USD	\N	1940.00	\N	\N	USD	\N
41d0dd56-807d-4a8d-a3b6-512999c58422	JE-2026-8EE426440C	38704339-879a-46e7-b77c-6acbf06ce345	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1540.00	دفعة للمورد عن طلب الشراء PO-24060126	SUPPLIERS	CASH	2026-09-21 20:56:58.890246+00	\N	\N	USD	\N	1540.00	\N	\N	USD	\N
1371e717-d25f-443d-a225-d4162538c88b	JE-2026-7C18325A0B	f5dd6d93-5f89-4f60-b817-e52f51eb9f76	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	830.00	شراء PO-28106176	INVENTORY	SUPPLIERS	2026-09-21 22:01:48.253912+00	PO-PO-28106176	\N	USD	\N	830.00	\N	\N	USD	\N
421868e7-9cea-45d6-ae0a-d243805d851a	JE-2026-2BFBF9E58C	f5dd6d93-5f89-4f60-b817-e52f51eb9f76	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	830.00	دفعة للمورد عن طلب الشراء PO-28106176	SUPPLIERS	CASH	2026-09-21 22:01:49.844431+00	\N	\N	USD	\N	830.00	\N	\N	USD	\N
6009ee94-f903-458c-95d4-56a0eb0a08e4	JE-2026-9345DD9897	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	1000.00	ايداع للبنك	CASH	CAPITAL	2026-09-22 12:13:11.080215+00	\N	\N	USD	\N	1000.00	\N	\N	USD	\N
b62a232b-e061-4357-bc31-d6abe2ea7628	JE-REV-INV-2026-000004	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	815.00	إثبات مبيعات نقطة البيع رقم INV-2026-000004	CASH	SALES	2026-09-22 12:57:31.578643+00	INV-2026-000004	6a407f0b-e422-49a1-ae65-c0c18751e0f8	USD	\N	815.00	\N	\N	USD	\N
4ab25096-931e-4de6-bc3b-46b7272fcfc2	JE-COGS-INV-2026-000004	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	738.87	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000004	COGS	INVENTORY	2026-09-22 12:57:31.578643+00	INV-2026-000004	6a407f0b-e422-49a1-ae65-c0c18751e0f8	USD	\N	738.87	\N	\N	USD	\N
06b5a18c-707b-4e61-b194-baaae6652534	ADJ-1790084356345-RETURN	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	30.00	مرتجع إلى المورد - قماش هندي	BANK	INVENTORY	2026-09-22 13:39:17.602522+00	ADJ-1790084356345	\N	USD	\N	30.00	\N	\N	USD	\N
68525993-88aa-4798-bdd8-86484c7a34c3	JE-2026-2B10507A2E	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	5000.00	ايداع لحساب البنك	CASH	CAPITAL	2026-09-22 13:49:39.519818+00	\N	\N	USD	\N	5000.00	\N	\N	USD	\N
9967c217-d34b-4444-9338-3dd642943c8d	JE-2026-5373A301B2	92431a52-65ae-4a53-8d53-66cb208ffd5e	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1034.85	شراء PO-85291993	INVENTORY	SUPPLIERS	2026-09-22 13:54:55.83148+00	PO-PO-85291993	\N	USD	\N	1034.85	\N	\N	USD	\N
671cdbf2-e7db-4144-9bf6-7b734eab9ddd	JE-2026-A65BD08603	92431a52-65ae-4a53-8d53-66cb208ffd5e	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	500.00	دفعة للمورد عن طلب الشراء PO-85291993	SUPPLIERS	BANK	2026-09-22 13:54:57.61325+00	\N	\N	USD	\N	500.00	\N	\N	USD	\N
7d02630a-9ee2-4a90-921b-bed4366b0153	ADJ-1790085505147-RETURN	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	200.00	مرتجع إلى المورد - عطر بلاك من عبد الصمد	CASH	INVENTORY	2026-09-22 13:58:26.362518+00	ADJ-1790085505147	\N	USD	\N	200.00	\N	\N	USD	\N
9130bf2a-2238-4737-b1a1-9d54b64a9e9d	JE-REV-INV-2026-000006	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	430.00	إثبات مبيعات نقطة البيع رقم INV-2026-000006	BANK	SALES	2026-09-23 11:33:20.414415+00	INV-2026-000006	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	USD	\N	430.00	\N	\N	USD	\N
a6ee53df-35e1-411c-bd03-4a1f5bea572b	JE-TLR-COGS-11BE491FE3	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	144.05	تكلفة قماش طلب تفصيل TLR-2026-000001	COGS	INVENTORY	2026-09-24 11:55:43.2422+00	TLR-2026-000001	ed8fdb00-392f-40e6-b5e2-869fde5971e8	USD	\N	144.05	\N	\N	USD	\N
233113e3-c725-4311-8d8f-4786bf4f173a	JE-TLR-DEP-AAF729F4D8	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	275.00	عربون طلب تفصيل TLR-2026-000001	BANK	SALES	2026-09-24 11:55:43.2422+00	TLR-2026-000001	ed8fdb00-392f-40e6-b5e2-869fde5971e8	USD	\N	275.00	\N	\N	USD	\N
41d488c8-7da2-4b8a-8a61-73fdbcd88267	JE-TLR-COGS-701213DCE1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	117.25	تكلفة قماش طلب تفصيل TLR-2026-000002	COGS	INVENTORY	2026-09-25 11:38:42.727451+00	TLR-2026-000002	32e76cfa-5829-449a-9042-3cca2339e394	USD	\N	117.25	\N	\N	USD	\N
ac310993-a836-4525-9586-e0604cf8ee4b	JE-TLR-DEP-AD9A454A33	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	150.00	عربون طلب تفصيل TLR-2026-000002	CASH	SALES	2026-09-25 11:38:42.727451+00	TLR-2026-000002	32e76cfa-5829-449a-9042-3cca2339e394	USD	\N	150.00	\N	\N	USD	\N
481fe134-8e9a-4ebc-b90d-80bde99ae4f1	JE-TAILOR-EXP-848FA30FB7	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	100.00	دفع مستحقات خياط - طلب TLR-2026-000002	OTHER_EXPENSE	CASH	2026-09-25 12:23:25.422998+00	TLR-2026-000002	\N	USD	\N	100.00	\N	\N	USD	\N
58eaa13e-d7dd-47c9-8031-d830b9e628b1	JE-TLR-DEP-FF2B6C6CB2	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	150.00	عربون طلب تفصيل TLR-2026-000003	BANK	SALES	2026-09-25 19:33:38.401782+00	TLR-2026-000003	77cc81a1-2bbf-4abb-983a-76dace9ecb78	USD	\N	150.00	\N	\N	USD	\N
8c65ea82-6da1-41cd-a719-28b4c90e87dd	JE-TLR-FABRIC-COGS-8308F2A90C	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	50.75	تكلفة قماش طلب تفصيل TLR-2026-000004	COGS	INVENTORY	2026-09-25 19:47:38.082203+00	TLR-2026-000004	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	USD	\N	50.75	\N	\N	USD	\N
a0598714-801a-443f-9b13-b9a06194cbeb	JE-TLR-DEP-195B035048	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	150.00	عربون طلب تفصيل TLR-2026-000004	CASH	SALES	2026-09-25 19:47:38.082203+00	TLR-2026-000004	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	USD	\N	150.00	\N	\N	USD	\N
5e603bfc-c6a2-48f5-833c-3b15ecd13f2a	JE-TLR-FINAL-FE360543D0	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	150.00	تحصيل باقي طلب تفصيل TLR-2026-000004	BANK	SALES	2026-09-25 19:49:59.095511+00	TLR-2026-000004	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	USD	\N	150.00	\N	\N	USD	\N
3eab8dba-2f2f-46f6-a669-1a7a8f6ab1c5	JE-TLR-LABOR-COGS-EED45BB09A	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	150.00	تكلفة خياطة طلب تفصيل TLR-2026-000004	COGS	SUPPLIERS	2026-09-25 19:49:59.095511+00	TLR-2026-000004	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	USD	\N	150.00	\N	\N	USD	\N
48da5733-605a-41b6-a778-b977edd84c3b	JE-TLR-PAY-35A1F7BEEA	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	150.00	سداد مستحق خياط لطلب تفصيل TLR-2026-000004	SUPPLIERS	CASH	2026-09-25 19:50:19.979723+00	TLR-2026-000004	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	USD	\N	150.00	\N	\N	USD	\N
ed4c2d77-68c0-4daa-8f96-cf503c1ab01b	JE-TLR-FABRIC-D56E20B495	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	113.06	تحويل تكلفة القماش إلى تحت التشغيل - TLR-2026-000005	WORK_IN_PROGRESS	INVENTORY	2026-09-26 12:03:29.667535+00	TLR-2026-000005	0bb8de45-cb81-4750-a7c4-573f2f17b31b	USD	\N	113.06	\N	\N	USD	\N
62f7ddbc-a866-4683-a02a-abc2f6068e06	JE-TLR-PROD-LABOR-1B5B6F7053	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	200.00	إثبات تكلفة خياطة إنتاج TLR-2026-000005	WORK_IN_PROGRESS	SUPPLIERS	2026-09-26 13:56:30.323617+00	TLR-2026-000005	0bb8de45-cb81-4750-a7c4-573f2f17b31b	USD	\N	200.00	\N	\N	USD	\N
508df3d5-d73a-4d31-9776-a51d4cf070a3	JE-TLR-PROD-FINISH-E0610A4594	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	313.06	إدخال منتج مصنع إلى المخزون بتكلفة الإنتاج - TLR-2026-000005	INVENTORY	WORK_IN_PROGRESS	2026-09-26 13:56:30.323617+00	TLR-2026-000005	0bb8de45-cb81-4750-a7c4-573f2f17b31b	USD	\N	313.06	\N	\N	USD	\N
6934abc5-5e8a-469e-980d-65160ae1c101	JE-REV-INV-2026-000018	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1174500.00	مبيعات نقطة البيع INV-2026-000018 - BANK_TRANSFER	BANK	SALES	2026-10-07 12:29:28.100799+00	INV-2026-000018	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	SDG	8700.0000	135.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	1174500.00
d8f27bab-9fc8-46d9-9202-3f3fecbf14b4	JE-COGS-INV-2026-000018	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	112.74	تكلفة المبيعات للفاتورة INV-2026-000018	COGS	INVENTORY	2026-10-07 12:29:28.100799+00	INV-2026-000018	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	USD	\N	112.74	\N	\N	USD	\N
fe16f3a5-eb56-4c7b-b082-1cc4f1bf711a	AST-1791460066727	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	5000000.00	شراء أصل: ماكينة خياطة	ASSETS	BANK	2026-10-08 11:47:46.827264+00	\N	\N	SDG	8500.0000	588.24	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	5000000.00
b6154420-32d2-4881-9ecb-16bc64c225d8	JE-OPEN-F0759E8F12	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	84.00	مخزون افتتاحي: 1 صنف	INVENTORY	CAPITAL	2026-10-06 14:29:56.922893+00	JE-OPEN-F0759E8F12	\N	USD	\N	84.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	USD	730800.00
68e58c6d-d05e-44f9-bb30-fc813b796422	JE-2026-3177805395	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	100000.00	لستك لماكينة الخياطة	MAINTENANCE	CASH	2026-10-05 16:28:25.633215+00	\N	\N	SDG	8700.0000	11.49	\N	\N	SDG	\N
c0970f02-3515-4cda-86fa-158b8865c27f	JE-TLR-PAY-6939BDFDB6	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	200.00	سداد مستحق خياط لطلب TLR-2026-000005	SUPPLIERS	BANK	2026-09-26 13:56:53.260635+00	TLR-2026-000005	0bb8de45-cb81-4750-a7c4-573f2f17b31b	USD	\N	200.00	\N	\N	USD	\N
06c6cd7c-9576-4bc5-bab6-b599b536b9ff	JE-TLR-DEP-2AC2548789	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	200.00	عربون طلب تفصيل TLR-2026-000006	CASH	SALES	2026-09-28 21:38:47.622131+00	TLR-2026-000006	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	USD	\N	200.00	\N	\N	USD	\N
235f66af-2eb5-46fa-96c7-be1ab52ec0a9	JE-TLR-FINAL-D8ECB8173D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	200.00	تحصيل باقي طلب تفصيل TLR-2026-000006	CASH	SALES	2026-09-28 21:40:21.688329+00	TLR-2026-000006	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	USD	\N	200.00	\N	\N	USD	\N
12dc3d82-8c58-4069-8aaf-dad1bab34140	JE-TLR-LABOR-COGS-6C4FB861B5	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	150.00	تكلفة خياطة طلب تفصيل TLR-2026-000006	COGS	SUPPLIERS	2026-09-28 21:40:21.688329+00	TLR-2026-000006	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	USD	\N	150.00	\N	\N	USD	\N
d83ca70c-53f9-4138-80bd-8b205c778250	JE-TLR-PAY-BE4E9B60EF	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	150.00	سداد مستحق خياط لطلب TLR-2026-000006	TAILOR_PAYMENT	CASH	2026-09-28 21:40:27.158171+00	TLR-2026-000006	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	USD	\N	150.00	\N	\N	USD	\N
abdf2351-4cb1-4e06-a786-555636421200	JE-TLR-FABRIC-E0618FCDC8	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	92.13	تكلفة قماش طلب تفصيل TLR-2026-000007	COGS	INVENTORY	2026-09-29 14:27:05.462559+00	TLR-2026-000007	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	USD	\N	92.13	\N	\N	USD	\N
d14a986e-0b34-48c2-a69e-450336c94353	JE-TLR-FINAL-7F14D40233	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	50.00	تحصيل باقي طلب تفصيل TLR-2026-000007	CASH	SALES	2026-09-29 17:11:40.014191+00	TLR-2026-000007	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	USD	\N	50.00	\N	\N	USD	\N
5a61eae5-1991-433d-b0e4-16e0f083cffe	JE-TLR-LABOR-COGS-5F6BBAD86F	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	45.00	تكلفة خياطة طلب تفصيل TLR-2026-000007	COGS	SUPPLIERS	2026-09-29 17:11:40.014191+00	TLR-2026-000007	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	USD	\N	45.00	\N	\N	USD	\N
0f6150fe-2751-4bc1-8d97-8a0a875190be	JE-TLR-PAY-74EF33A676	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	45.00	سداد مستحق خياط لطلب TLR-2026-000007	TAILOR_PAYMENT	CASH	2026-09-29 17:11:57.608713+00	TLR-2026-000007	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	USD	\N	45.00	\N	\N	USD	\N
bdeeea1b-bb9e-4221-afe2-003166568125	JE-TLR-CUST-ADV-E42783E8AD	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	225.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000008	BANK	CUSTOMER_ADVANCES	2026-09-30 08:58:44.344231+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	225.00	\N	\N	USD	\N
1c258ab7-351d-4250-aa34-63f56824f8fb	JE-TLR-FABRIC-WIP-18131BD52C	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	92.96	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000008	WORK_IN_PROGRESS	INVENTORY	2026-09-30 09:00:27.395751+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	92.96	\N	\N	USD	\N
2b0479c6-6bc5-45cf-94b1-3361de4798be	JE-TLR-ADV-PAY-0917D13A40	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	150.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000008	TAILOR_ADVANCES	CASH	2026-09-30 09:01:31.333807+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	150.00	\N	\N	USD	\N
2b2ba72e-349c-4c1b-b13e-79c4d0737d8b	JE-TLR-LABOR-FB208F5D7D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	150.00	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000008	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-09-30 09:05:57.868207+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	150.00	\N	\N	USD	\N
6038f7b0-84b1-4b4d-bf92-e90739b1126f	JE-TLR-ADV-APPLY-7F6C172F86	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	OTHER	150.00	تسوية الدفعات المقدمة للخياط مقابل تكلفة خياطة الطلب TLR-2026-000008	TAILORS_PAYABLE	TAILOR_ADVANCES	2026-09-30 09:05:57.868207+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	150.00	\N	\N	USD	\N
d522d340-3405-4789-b858-9e7958277700	JE-TLR-COGS-7C8F6D4E5E	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	242.96	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000008	COGS	WORK_IN_PROGRESS	2026-09-30 09:05:57.868207+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	242.96	\N	\N	USD	\N
3d1683b1-3b4b-4cba-b2ca-03279d920fe1	JE-TLR-REV-ADV-9F40BFAAE1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	225.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000008	CUSTOMER_ADVANCES	SALES	2026-09-30 09:05:57.868207+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	225.00	\N	\N	USD	\N
46ca7005-6e83-4061-83da-7802e58830e4	JE-TLR-REV-FINAL-7869551BCA	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	225.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000008	BANK	SALES	2026-09-30 09:05:57.868207+00	TLR-2026-000008	4000a711-48a2-45f0-a38b-7d9388694566	USD	\N	225.00	\N	\N	USD	\N
352d6a62-b298-4727-90a0-1ad588e58921	JE-TLR-CUST-ADV-7C5A5E314D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	175.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000009	CASH	CUSTOMER_ADVANCES	2026-10-01 13:26:23.046667+00	TLR-2026-000009	10d1d2c8-4bb1-4c16-aada-d4c26e65ec58	USD	\N	175.00	\N	\N	USD	\N
2b16c8a2-0431-4f5e-b7c2-20eb4c516665	JE-TLR-CUST-ADV-REFUND-CD1EDA89D6	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE_REFUND	175.00	استرداد عربون العميل لطلب التفصيل TLR-2026-000009	CUSTOMER_ADVANCES	CASH	2026-10-01 16:38:33.611073+00	TLR-2026-000009	10d1d2c8-4bb1-4c16-aada-d4c26e65ec58	USD	\N	175.00	\N	\N	USD	\N
01963004-5f01-4bfe-bc02-698cc395067e	JE-TLR-CUST-ADV-EB9F37D9C2	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	200.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000010	CASH	CUSTOMER_ADVANCES	2026-10-01 16:56:32.145813+00	TLR-2026-000010	b9556919-7013-474b-8e2a-a98c4c07dbac	USD	\N	200.00	\N	\N	USD	\N
423d07f1-1c12-47ad-b043-8a10312a360a	JE-TLR-ADV-PAY-9C92E0D333	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	25.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000010	TAILOR_ADVANCES	CASH	2026-10-01 16:59:31.996733+00	TLR-2026-000010	b9556919-7013-474b-8e2a-a98c4c07dbac	USD	\N	25.00	\N	\N	USD	\N
31b94fcb-1086-4822-aa76-75100556883d	JE-TLR-CUST-ADV-E7141990CB	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	225.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000011	BANK	CUSTOMER_ADVANCES	2026-10-01 17:16:21.636176+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	225.00	\N	\N	USD	\N
0c43f3c8-e835-408b-a0c2-6bc5b09a12f5	JE-TLR-ADV-PAY-01C13091A9	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	150.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000011	TAILOR_ADVANCES	CASH	2026-10-01 17:21:09.292227+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	150.00	\N	\N	USD	\N
9cdb0459-d885-4d53-8400-050a03732b16	JE-TLR-FABRIC-WIP-199F93DD74	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	46.90	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000011	WORK_IN_PROGRESS	INVENTORY	2026-10-01 17:24:39.96835+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	46.90	\N	\N	USD	\N
475adca5-c449-46ce-a35f-fe83f82ce797	JE-TLR-LABOR-89A19F2682	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	150.00	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000011	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-01 17:28:33.930318+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	150.00	\N	\N	USD	\N
67d9e8e0-d123-4db5-8cd2-2b649d27a3a0	JE-TLR-ADV-APPLY-F71957B0E1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE_APPLICATION	150.00	تسوية الدفعات المقدمة للخياط مقابل تكلفة خياطة الطلب TLR-2026-000011	TAILORS_PAYABLE	TAILOR_ADVANCES	2026-10-01 17:28:33.930318+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	150.00	\N	\N	USD	\N
48ec6994-82d1-4570-97b7-b11e6c1a12b9	JE-REV-INV-2026-000019	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	609000.00	مبيعات نقطة البيع INV-2026-000019 - CASH	CASH	SALES	2026-10-07 12:31:03.588689+00	INV-2026-000019	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	SDG	8700.0000	70.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	609000.00
fb47bdb8-689e-4c2e-aad7-c1aa9f1734b2	JE-2026-C3CD9A2123	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	500000.00	اضافة رأس مال للبنك	BANK	CAPITAL	2026-10-05 18:41:33.13416+00	\N	\N	USD	\N	500000.00	\N	\N	USD	\N
495e913d-bb7c-43f6-91da-d7d426fd3b22	JE-2026-DC24CD3C4D	82efce3e-585f-4bc2-889d-0204b28aba18	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1270.00	شراء PO-54760243	INVENTORY	SUPPLIERS	2026-09-19 21:52:43.797704+00	PO-PO-54760243	\N	USD	\N	1270.00	\N	\N	USD	\N
7d49a764-b944-4486-bdc9-5afd5c6df2f6	JE-2026-572BE7F6E5	1ac925e1-5889-40ed-a676-c7d44f995cdd	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1720.00	شراء PO-54856325	INVENTORY	SUPPLIERS	2026-09-19 21:54:20.20664+00	PO-PO-54856325	\N	USD	\N	1720.00	\N	\N	USD	\N
7b2069dd-26bf-4b4a-b7de-f28245017815	JE-2026-30E199F66B	5cda9713-8395-4c4d-976e-0abac15cceb5	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1200.00	شراء PO-55207780	INVENTORY	SUPPLIERS	2026-09-19 22:00:09.297087+00	PO-PO-55207780	\N	USD	\N	1200.00	\N	\N	USD	\N
a839d0f5-0c14-4a3f-ba64-9a863227d8f3	JE-2026-4936D18F98	5cda9713-8395-4c4d-976e-0abac15cceb5	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1200.00	دفعة للمورد عن طلب الشراء PO-55207780	SUPPLIERS	BANK	2026-09-19 22:00:11.112521+00	\N	\N	USD	\N	1200.00	\N	\N	USD	\N
92eee0a6-84c0-4dde-adf8-e074d00f19dd	JE-2026-3CC3EDEF48	5531ec6a-553b-4fd0-a508-cdb2bc340825	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1730.00	شراء PO-34452606	INVENTORY	SUPPLIERS	2026-09-20 20:00:54.602083+00	PO-PO-34452606	\N	USD	\N	1730.00	\N	\N	USD	\N
8d6129c4-a05b-4738-9885-9f5f657535d1	JE-2026-12AEC8E307	5531ec6a-553b-4fd0-a508-cdb2bc340825	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	700.00	دفعة للمورد عن طلب الشراء PO-34452606	SUPPLIERS	BANK	2026-09-20 20:00:56.135334+00	\N	\N	USD	\N	700.00	\N	\N	USD	\N
c90fb41a-c4a0-4bb7-8446-adfa9a46018d	JE-2026-B68AADC0D4	c58a3523-0263-4644-9c11-c3e3dbb1bcb7	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	550.00	شراء PO-35117864	INVENTORY	SUPPLIERS	2026-09-20 20:17:43.279082+00	PO-PO-35117864	\N	USD	\N	550.00	\N	\N	USD	\N
554ccfa7-c5e8-4bc3-83aa-cd9435992ced	JE-2026-EE85CCAC8D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	10000.00	ايداع مبلغ عشرة الاف للخزينة	CASH	CAPITAL	2026-09-20 20:40:33.76029+00	\N	\N	USD	\N	10000.00	\N	\N	USD	\N
8ccd81e1-4b34-4c6f-bdd9-30649d43fc86	JE-2026-D507AAF0BB	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	200.00	شراء وتسوية مخزنية - سديري اسود بلمعة	INVENTORY	BANK	2026-09-21 12:11:08.411171+00	ADJ-6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	\N	USD	\N	200.00	\N	\N	USD	\N
7a3ab5a0-efe5-4a43-a25e-85ad1aa2ce60	JE-2026-784D12F2A7	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	50.00	فاتورة الانترنت	UTILITIES	BANK	2026-09-21 13:50:43.021664+00	\N	\N	USD	\N	50.00	\N	\N	USD	\N
d6c43854-6893-4aa1-885c-96223620959f	JE-2026-E2677C26E8	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	10.00	فاتورة	UTILITIES	BANK	2026-09-21 13:52:27.262009+00	\N	\N	USD	\N	10.00	\N	\N	USD	\N
6594acb1-9f4b-4f45-bc6d-1818c0290129	JE-2026-B26B8B2651	11ce7ef4-4c0d-4374-b1d5-74640466cc7e	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	650.00	شراء PO-13762090	INVENTORY	SUPPLIERS	2026-09-21 18:02:44.024925+00	PO-PO-13762090	\N	USD	\N	650.00	\N	\N	USD	\N
075e0c53-a6df-4184-bb3e-d7383204d813	JE-2026-F29462FDED	11ce7ef4-4c0d-4374-b1d5-74640466cc7e	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	650.00	دفعة للمورد عن طلب الشراء PO-13762090	SUPPLIERS	BANK	2026-09-21 18:02:45.255511+00	\N	\N	USD	\N	650.00	\N	\N	USD	\N
dca1de87-e0ae-40ac-90c2-800aa4c5f67b	JE-2026-D12C9CE4A9	992d5384-dcf1-4eb2-a690-b24884d0385f	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	200.00	دفعة للمورد عن طلب الشراء PO-14317462	SUPPLIERS	BANK	2026-09-21 18:12:00.979088+00	\N	\N	USD	\N	200.00	\N	\N	USD	\N
ddad8c4d-49f4-44e9-9404-26def3691a58	JE-2026-90F3C2A8F0	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	500.00	شراء PO-15386922	INVENTORY	SUPPLIERS	2026-09-21 18:29:48.92625+00	PO-PO-15386922	\N	USD	\N	500.00	\N	\N	USD	\N
56ff9674-4dca-4a77-82be-bff7e35ce3bd	JE-2026-44243B2CC7	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	300.00	دفعة للمورد عن طلب الشراء PO-15386922	SUPPLIERS	BANK	2026-09-21 18:29:50.079613+00	\N	\N	USD	\N	300.00	\N	\N	USD	\N
1ccabe05-4ef1-4d84-90dd-111882cf47eb	JE-2026-3C1A3622E1	5f24a0a0-87d1-4a2e-908a-151f27becd65	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	650.00	شراء PO-20643269	INVENTORY	SUPPLIERS	2026-09-21 19:57:25.267425+00	PO-PO-20643269	\N	USD	\N	650.00	\N	\N	USD	\N
dbde83f5-6c3b-477c-b9d9-25c2d371b3c4	JE-2026-2B15911155	5f24a0a0-87d1-4a2e-908a-151f27becd65	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	650.00	دفعة للمورد عن طلب الشراء PO-20643269	SUPPLIERS	CASH	2026-09-21 19:57:26.360218+00	\N	\N	USD	\N	650.00	\N	\N	USD	\N
f0ca0e91-a313-4dd0-8464-7b90b3523829	JE-2026-3B2406FDC6	b595b476-2619-4949-bcea-e43c5fd3b06c	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	845.00	شراء PO-27137679	INVENTORY	SUPPLIERS	2026-09-21 21:45:39.966107+00	PO-PO-27137679	\N	USD	\N	845.00	\N	\N	USD	\N
651c2c31-e1f4-4a3b-99cb-aea5afcf147f	JE-2026-A8D9D496EC	b595b476-2619-4949-bcea-e43c5fd3b06c	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	845.00	دفعة للمورد عن طلب الشراء PO-27137679	SUPPLIERS	CASH	2026-09-21 21:45:41.795124+00	\N	\N	USD	\N	845.00	\N	\N	USD	\N
b5265e7e-2114-4161-87a6-6e76440d1f57	ADJ-1790070886273	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	50.25	تسوية مخزنية نقص - قماش هندي	OTHER_EXPENSE	INVENTORY	2026-09-22 09:54:47.30416+00	ADJ-1790070886273	\N	USD	\N	50.25	\N	\N	USD	\N
cb9c4c6d-9e62-483b-b0a0-d675f535f312	JE-2026-E7FD2DD9B1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	120.00	تغيير زييت للماكينة	MAINTENANCE	BANK	2026-09-22 12:54:09.43885+00	\N	\N	USD	\N	120.00	\N	\N	USD	\N
2792e27c-22aa-438b-9160-a1e1aafd95b1	JE-2026-D6FF6CA1EB	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	1700.00	راتب الكاشير	SALARIES	BANK	2026-09-22 12:55:04.281543+00	\N	\N	USD	\N	1700.00	\N	\N	USD	\N
bea553ab-8cb7-4ef8-883b-36e6e00e56f2	JE-REV-INV-2026-000005	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	2415.00	إثبات مبيعات نقطة البيع رقم INV-2026-000005	CASH	SALES	2026-09-22 12:59:27.599953+00	INV-2026-000005	9b42c995-89ab-4f6c-8023-49439102304c	USD	\N	2415.00	\N	\N	USD	\N
9ccb5c18-cdee-429c-8d86-577326ffb353	JE-COGS-INV-2026-000005	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	2249.70	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000005	COGS	INVENTORY	2026-09-22 12:59:27.599953+00	INV-2026-000005	9b42c995-89ab-4f6c-8023-49439102304c	USD	\N	2249.70	\N	\N	USD	\N
1bc8e64f-9fbe-41d4-b76e-6418e8644393	JE-2026-AC6C2B6598	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	100.00	فاتورة مياه	UTILITIES	BANK	2026-09-22 13:48:16.277275+00	\N	\N	USD	\N	100.00	\N	\N	USD	\N
18f57309-576c-4c3e-a001-8adcd2d8cb70	JE-2026-CA5DC8979D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	2500.00	رسوم ايجار محل	OTHER_EXPENSE	BANK	2026-09-22 13:51:58.825428+00	\N	\N	USD	\N	2500.00	\N	\N	USD	\N
f0bce9c8-42e2-4f9d-b056-696ac3769c5a	JE-2026-096C4EF77F	92431a52-65ae-4a53-8d53-66cb208ffd5e	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	530.00	دفعة للمورد عن طلب الشراء PO-85291993	SUPPLIERS	CASH	2026-09-22 13:57:05.962954+00	\N	\N	USD	\N	530.00	\N	\N	USD	\N
26cf57f5-c1b2-48ef-b842-ebea0622cf42	AST-1790096022354	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	700.00	شراء أصل: حاسب	ASSETS	CASH	2026-09-22 16:53:43.686318+00	\N	\N	USD	\N	700.00	\N	\N	USD	\N
34ebc048-ab1a-4d4a-9dec-1efa232d7aa2	JE-COGS-INV-2026-000006	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	332.93	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000006	COGS	INVENTORY	2026-09-23 11:33:20.414415+00	INV-2026-000006	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	USD	\N	332.93	\N	\N	USD	\N
225f0320-71c6-451b-bc0d-c349301de3b2	JE-REV-INV-2026-000007	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	600.00	إثبات مبيعات نقطة البيع رقم INV-2026-000007	CASH	SALES	2026-09-23 11:35:11.987159+00	INV-2026-000007	7cf2cb23-ce5c-4958-97b0-067c92e64d1f	USD	\N	600.00	\N	\N	USD	\N
b328e7ef-af96-4627-bc5f-e7c60f88bd32	JE-COGS-INV-2026-000007	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	479.95	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000007	COGS	INVENTORY	2026-09-23 11:35:11.987159+00	INV-2026-000007	7cf2cb23-ce5c-4958-97b0-067c92e64d1f	USD	\N	479.95	\N	\N	USD	\N
cbc69ea9-9af2-4b53-a1a4-b1674fa40e72	JE-REV-INV-2026-000008	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	15.00	إثبات مبيعات نقطة البيع رقم INV-2026-000008	CASH	SALES	2026-09-23 11:41:55.512244+00	INV-2026-000008	4364a355-8a9a-49d4-ab14-b03828966fcf	USD	\N	15.00	\N	\N	USD	\N
6f9f1b66-3b29-42c1-81c7-07b31264f9a7	JE-COGS-INV-2026-000019	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	75.13	تكلفة المبيعات للفاتورة INV-2026-000019	COGS	INVENTORY	2026-10-07 12:31:03.588689+00	INV-2026-000019	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	USD	\N	75.13	\N	\N	USD	\N
554f8c2e-0d63-4920-8cb3-f31151cc0228	JE-2026-F452019A22	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	5000000.00	راس مال	BANK	CAPITAL	2026-10-05 18:42:46.742195+00	\N	\N	SDG	8700.0000	574.71	\N	\N	SDG	\N
ed0fa2aa-f109-4edd-913f-15aa6e558a8d	JE-REV-INV-2026-000015	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	130500.00	مبيعات نقطة البيع INV-2026-000015 - CASH	CASH	SALES	2026-10-05 18:43:49.777219+00	INV-2026-000015	eac12289-7a38-4c51-bfc0-1eac5d6f2533	SDG	8700.0000	15.00	\N	\N	SDG	\N
22a13bad-53bf-46c9-bf65-8adff3ee2d18	JE-COGS-INV-2026-000015	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	16.75	تكلفة المبيعات للفاتورة INV-2026-000015	COGS	INVENTORY	2026-10-05 18:43:49.777219+00	INV-2026-000015	eac12289-7a38-4c51-bfc0-1eac5d6f2533	USD	\N	16.75	\N	\N	USD	\N
ddb2583e-8e8b-46da-a37a-130759951335	JE-2026-2B8E3E8E40	10331d15-5840-4085-930e-5576ad505d37	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1100.00	شراء PO-53573637	INVENTORY	SUPPLIERS	2026-09-19 21:32:56.931818+00	PO-PO-53573637	\N	USD	\N	1100.00	\N	\N	USD	\N
92978f21-511d-47bd-a46d-bcf5827f6b64	JE-GIFT-INV-2026-000019	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	GIFT	102.58	تكلفة هدايا مع الفاتورة INV-2026-000019	GIFTS	INVENTORY	2026-10-07 12:31:03.588689+00	INV-2026-000019	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	USD	\N	102.58	\N	\N	USD	\N
99819331-9978-47b4-a6c5-1e7e0de89da8	JE-TLR-LABOR-54275A7AA9	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	17.24	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000017	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-07 14:31:32.120478+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	USD	\N	17.24	\N	\N	USD	\N
2a944c6d-5e7a-49f0-ba44-85037c0ec524	JE-TLR-ADV-APPLY-E25DE09E16	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE_APPLICATION	11.49	تسوية الدفعات المقدمة للخياط مقابل تكلفة خياطة الطلب TLR-2026-000017	TAILORS_PAYABLE	TAILOR_ADVANCES	2026-10-07 14:31:32.120478+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	USD	\N	11.49	\N	\N	USD	\N
59f1295c-7bb6-40e2-99e0-a2d5326b0e2e	JE-TLR-COGS-09D75D83C1	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	67.49	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000017	COGS	WORK_IN_PROGRESS	2026-10-07 14:31:32.120478+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	USD	\N	67.49	\N	\N	USD	\N
78c957f1-aa1c-44b4-b07f-4ec01d366427	JE-TLR-REV-ADV-4BDE87BA43	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1000000.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000017	CUSTOMER_ADVANCES	SALES	2026-10-07 14:31:32.120478+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	SDG	8700.1914	114.94	\N	8700.191400	SDG	1000000.00
d8071dae-e722-4eca-b8b3-6c5e796f412c	JE-TLR-REV-FINAL-175F977C51	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1000000.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000017	CASH	SALES	2026-10-07 14:31:32.120478+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	SDG	8700.0000	114.94	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	1000000.00
f582848b-9555-4cb3-89a7-96d4f8aeb4ba	JE-TLR-FABRIC-WIP-31D1A200E0	\N	979147a7-a426-4e30-b90b-5f81f606c48b	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	50.25	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000020	WORK_IN_PROGRESS	INVENTORY	2026-10-07 20:47:20.972945+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	USD	\N	50.25	\N	\N	USD	\N
7d98e0e7-0fe7-4b0a-b9b9-4254408d3839	JE-TLR-CONVERT-ADV-APPLY-7C5330A98D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE_APPLICATION	4.11	تسوية الدفعات المقدمة للخياط مقابل تكلفة الطلب المحول إلى منتج TLR-2026-000020	TAILORS_PAYABLE	TAILOR_ADVANCES	2026-10-07 21:01:27.978792+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	USD	\N	4.11	\N	\N	USD	\N
a3255528-a3c4-4c21-ba71-ce7faee4b381	JE-TLR-CONVERT-FINISH-ADC052A6BF	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PRODUCTION	54.37	إدخال المنتج الناتج من تحويل الطلب إلى المخزون بتكلفة التصنيع TLR-2026-000020	INVENTORY	WORK_IN_PROGRESS	2026-10-07 21:01:27.978792+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	USD	\N	54.37	\N	\N	USD	\N
7bda7129-b3b3-4765-b285-70fc8bbde937	AST-1791460320063	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	1500000.00	شراء أصل: طاولة خشبية	ASSETS	CASH	2026-10-08 11:52:00.387439+00	\N	\N	SDG	8500.0000	176.47	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	1500000.00
56614845-86a8-40cd-9620-6da4a7690e6a	JE-2026-229B801081	ce254f54-c400-4947-a3f4-dc8e9cc90d60	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	160.00	دفعة للمورد عن طلب الشراء PO-78304634	SUPPLIERS	CASH	2026-10-08 16:51:53.294277+00	\N	\N	USD	\N	160.00	\N	\N	USD	\N
4bba9a18-a56e-438f-8baa-45ece867fb6e	JE-TLR-CUST-ADV-138DA26E4B	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	200000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000025	BANK	CUSTOMER_ADVANCES	2026-10-08 18:14:20.347043+00	TLR-2026-000025	ad718a01-60ee-490f-987c-ba8dba3d9d20	SDG	9000.0000	22.22	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	200000.00
c9b0052d-e0e3-445c-af1c-a3ade96309ef	JE-TLR-FABRIC-WIP-90080AB318	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	8.81	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000028	WORK_IN_PROGRESS	INVENTORY	2026-10-08 18:31:21.354701+00	TLR-2026-000028	576f7912-4ad1-436c-a955-a0b5b990f405	USD	\N	8.81	\N	\N	USD	\N
191624ea-f365-41f3-b11c-7460b7eb03cc	JE-2026-923FD3B62F	10331d15-5840-4085-930e-5576ad505d37	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	500.00	دفعة للمورد عن طلب الشراء PO-53573637	SUPPLIERS	CASH	2026-09-19 21:32:58.009085+00	\N	\N	USD	\N	500.00	\N	\N	USD	\N
fefdccc9-7704-46d7-b0fa-2ae771720d2d	JE-2026-30C56ACC65	9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	2350.00	شراء PO-54250139	INVENTORY	SUPPLIERS	2026-09-19 21:44:13.442506+00	PO-PO-54250139	\N	USD	\N	2350.00	\N	\N	USD	\N
7476b9bf-fab6-4cea-8ab5-966905f73201	JE-TLR-CUST-ADV-89CC899731	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	150000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000016	BANK	CUSTOMER_ADVANCES	2026-10-07 12:52:53.141268+00	TLR-2026-000016	f56387bf-67fd-4bb2-836e-854136916311	SDG	8700.0000	17.24	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	150000.00
99b6bf1f-f212-49e4-a1ca-45b247121ff7	JE-TLR-CUST-ADV-09F5E73CCC	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	600000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000018	BANK	CUSTOMER_ADVANCES	2026-10-07 14:40:03.450015+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	SDG	8700.0000	68.97	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	600000.00
04f0c266-3136-416f-b612-a86ec8f188c5	JE-TLR-FABRIC-WIP-A3788371D1	\N	979147a7-a426-4e30-b90b-5f81f606c48b	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	50.25	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000018	WORK_IN_PROGRESS	INVENTORY	2026-10-07 20:47:42.539505+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	USD	\N	50.25	\N	\N	USD	\N
2dae0679-daac-4e86-8db9-e01456e3f814	JE-TLR-CUST-ADV-REFUND-EB2A8E83B3	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE_REFUND	125000.00	استرداد عربون العميل لطلب التفصيل TLR-2026-000020 - العميل لغى الطلب	CUSTOMER_ADVANCES	CASH	2026-10-07 21:04:20.919638+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	SDG	8497.6207	14.71	\N	8497.620700	SDG	125000.00
717abc33-cce2-4531-a4b8-f289503fc028	JE-TLR-CUST-ADV-5162239136	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	250000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000023	CASH	CUSTOMER_ADVANCES	2026-10-08 14:08:20.530981+00	TLR-2026-000023	19473229-cc56-43a7-880a-6c4ef2d53d5f	SDG	9000.0000	27.78	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	250000.00
44a5a178-d3dd-4c18-a3b5-7473f239d399	JE-REV-INV-2026-000023	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	499500.00	مبيعات نقطة البيع INV-2026-000023 - CASH	CASH	SALES	2026-10-08 16:52:40.933653+00	INV-2026-000023	596812e5-b325-41d5-8999-b40ce5ccb633	SDG	9000.0000	55.50	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	499500.00
86a0fd92-aef3-4e0b-a591-7bfa99806d5c	JE-COGS-INV-2026-000023	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	12.54	تكلفة المبيعات للفاتورة INV-2026-000023	COGS	INVENTORY	2026-10-08 16:52:40.933653+00	INV-2026-000023	596812e5-b325-41d5-8999-b40ce5ccb633	USD	\N	12.54	\N	\N	USD	\N
a8726f93-73f8-4959-a5f9-dec75561503f	JE-TLR-CUST-ADV-REFUND-1AA953BC86	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE_REFUND	200000.00	استرداد عربون العميل لطلب التفصيل TLR-2026-000025 - استرد امواله	CUSTOMER_ADVANCES	CASH	2026-10-08 18:19:36.390451+00	TLR-2026-000025	ad718a01-60ee-490f-987c-ba8dba3d9d20	SDG	9000.9001	22.22	\N	9000.900100	SDG	200000.00
36cb6fd0-9663-4a25-85ad-2b70a449a5a5	JE-TLR-PROD-LABOR-DCD153EB67	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	3.33	إثبات تكلفة خياطة إنتاج TLR-2026-000028	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-08 18:32:24.62697+00	TLR-2026-000028	576f7912-4ad1-436c-a955-a0b5b990f405	USD	\N	3.33	\N	\N	USD	\N
27659185-64a7-4cb6-a726-65a913ff1bfe	JE-TLR-PROD-FINISH-0429737180	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PRODUCTION	12.14	إدخال المنتج المصنع إلى المخزون بتكلفة الإنتاج TLR-2026-000028	INVENTORY	WORK_IN_PROGRESS	2026-10-08 18:32:24.62697+00	TLR-2026-000028	576f7912-4ad1-436c-a955-a0b5b990f405	USD	\N	12.14	\N	\N	USD	\N
d9ad3038-ac29-4be2-b72f-3f95e4b20bd9	JE-TLR-CUST-ADV-REFUND-2243E57236	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE_REFUND	150000.00	استرداد عربون العميل لطلب التفصيل TLR-2026-000016	CUSTOMER_ADVANCES	BANK	2026-10-07 12:57:35.923315+00	TLR-2026-000016	f56387bf-67fd-4bb2-836e-854136916311	SDG	8700.6961	17.24	\N	8700.696100	SDG	150000.00
3d7bee09-1f5e-4c88-aed9-2f66086302d5	JE-TLR-CUST-ADV-50E46D986F	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	600000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000019	CASH	CUSTOMER_ADVANCES	2026-10-07 14:45:22.07637+00	TLR-2026-000019	d78e6f94-2b33-4c3b-9702-0af30831eb1a	SDG	8700.0000	68.97	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	600000.00
15d929ee-4b7d-438f-a001-cf67b2ea3c3f	JE-TLR-LABOR-B44D348675	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	28.74	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000018	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-07 20:51:41.511133+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	USD	\N	28.74	\N	\N	USD	\N
89d08569-353c-41d4-86dd-7a6f38dd0124	JE-TLR-COGS-9244DDA04C	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	78.99	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000018	COGS	WORK_IN_PROGRESS	2026-10-07 20:51:41.511133+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	USD	\N	78.99	\N	\N	USD	\N
e850db98-fdb3-4b16-962c-c666e9790573	JE-TLR-REV-ADV-5C4FE84453	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	600000.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000018	CUSTOMER_ADVANCES	SALES	2026-10-07 20:51:41.511133+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	SDG	8699.4345	68.97	\N	8699.434500	SDG	600000.00
3224f463-6414-4d1a-89e9-9a1ed01b86da	JE-TLR-REV-FINAL-31DF96D34E	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	600000.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000018	BANK	SALES	2026-10-07 20:51:41.511133+00	TLR-2026-000018	5566880c-fb25-4263-9c6c-b25b2b3e7133	SDG	8500.0000	70.59	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	600000.00
a3c3514a-38d5-4662-9e3b-5253dcf0c6ac	JE-TLR-FABRIC-WIP-ACE2109A8F	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	63.65	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000021	WORK_IN_PROGRESS	INVENTORY	2026-10-07 21:15:36.887908+00	TLR-2026-000021	1fc23e98-e75a-4bae-a67a-5a34e6e81810	USD	\N	63.65	\N	\N	USD	\N
7961f577-ff64-4146-be9d-a047ad29f879	JE-REV-INV-2026-000021	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1475000.00	مبيعات نقطة البيع INV-2026-000021 - BANK_TRANSFER	BANK	SALES	2026-10-08 16:15:26.25196+00	INV-2026-000021	067e3336-485d-4400-a3a7-34995323dd68	SDG	9000.0000	163.89	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	1475000.00
eda63e48-2e12-46d9-8756-741905f37c23	JE-COGS-INV-2026-000021	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	104.04	تكلفة المبيعات للفاتورة INV-2026-000021	COGS	INVENTORY	2026-10-08 16:15:26.25196+00	INV-2026-000021	067e3336-485d-4400-a3a7-34995323dd68	USD	\N	104.04	\N	\N	USD	\N
3206d06d-7906-4209-ac40-5157bb8738f0	JE-GIFT-INV-2026-000021	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	GIFT	39.49	تكلفة هدايا مع الفاتورة INV-2026-000021	GIFTS	INVENTORY	2026-10-08 16:15:26.25196+00	INV-2026-000021	067e3336-485d-4400-a3a7-34995323dd68	USD	\N	39.49	\N	\N	USD	\N
8204feda-15e7-4f38-9f09-66bb88477e9a	JE-TLR-CUST-ADV-EF188D46C7	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	175000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000024	BANK	CUSTOMER_ADVANCES	2026-10-08 17:57:26.91471+00	TLR-2026-000024	e6d6005b-6315-453b-9344-122572ffa2e7	SDG	9000.0000	19.44	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	175000.00
80bf999c-2f1e-4031-a5ea-2456785c2227	JE-TLR-CONVERT-LABOR-4372BFD859	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	5.56	إثبات تكلفة خياطة الطلب المحول إلى منتج TLR-2026-000024	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-08 18:22:19.006868+00	TLR-2026-000024	e6d6005b-6315-453b-9344-122572ffa2e7	USD	\N	5.56	\N	\N	USD	\N
d95effc8-1b95-4171-aeb9-be65830d0312	JE-TLR-CONVERT-FINISH-30C1DCF927	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PRODUCTION	22.51	إدخال المنتج الناتج من تحويل الطلب إلى المخزون بتكلفة التصنيع TLR-2026-000024	INVENTORY	WORK_IN_PROGRESS	2026-10-08 18:22:19.006868+00	TLR-2026-000024	e6d6005b-6315-453b-9344-122572ffa2e7	USD	\N	22.51	\N	\N	USD	\N
e70fcfc2-b691-4b56-a737-c552bc6438cd	JE-OPEN-9151575556	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	42.00	مخزون افتتاحي: 1 صنف	INVENTORY	CAPITAL	2026-10-08 19:14:44.408399+00	JE-OPEN-9151575556	\N	USD	\N	42.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	USD	378000.00
96080c1e-4f1a-477a-854b-e772d2a2cdef	JE-TLR-CUST-ADV-02321AD828	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	1000000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000017	CASH	CUSTOMER_ADVANCES	2026-10-07 13:00:11.585095+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	SDG	8700.0000	114.94	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	1000000.00
0c1eb1a7-c665-43cc-9518-c1c7bf78986f	AST-1791402484217	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	dcc40a00-1275-463f-9cd8-caf5487100b0	ASSET	2000000.00	شراء أصل: جهاز حاسوب	ASSETS	CASH	2026-10-07 19:48:04.338849+00	\N	\N	SDG	8700.0000	229.89	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	2000000.00
164638c8-4e0a-4874-8ad9-12a6f9c2f218	JE-TLR-ADV-PAY-B39A9F8BEF	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	20000.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000020 - سيستلم الباقي بعد الانتهاء	TAILOR_ADVANCES	BANK	2026-10-07 20:58:11.928691+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	SDG	8500.0000	2.35	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	20000.00
68c32686-9574-4dc5-8885-60ba887e8f5d	JE-TLR-FABRIC-WIP-CB3A5F77AF	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	41.88	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000022	WORK_IN_PROGRESS	INVENTORY	2026-10-07 21:23:42.189508+00	TLR-2026-000022	25a58694-8006-4bc0-b17f-4d50982eb949	USD	\N	41.88	\N	\N	USD	\N
509b1550-2492-4a2b-a7c8-6be4e6c12ad9	JE-REV-INV-2026-000022	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	1325000.00	مبيعات نقطة البيع INV-2026-000022 - CASH	CASH	SALES	2026-10-08 16:48:03.816797+00	INV-2026-000022	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	SDG	9000.0000	147.22	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	1325000.00
5fed862d-246f-448d-98db-99d146bc542a	JE-COGS-INV-2026-000022	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	87.29	تكلفة المبيعات للفاتورة INV-2026-000022	COGS	INVENTORY	2026-10-08 16:48:03.816797+00	INV-2026-000022	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	USD	\N	87.29	\N	\N	USD	\N
f17f45a4-0e6d-4f4e-bf96-a26de15816ae	JE-GIFT-INV-2026-000022	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	GIFT	39.49	تكلفة هدايا مع الفاتورة INV-2026-000022	GIFTS	INVENTORY	2026-10-08 16:48:03.816797+00	INV-2026-000022	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	USD	\N	39.49	\N	\N	USD	\N
ed0c6cdb-901f-4590-9c53-fabd64970e62	JE-TLR-FABRIC-WIP-E8879A01B8	\N	979147a7-a426-4e30-b90b-5f81f606c48b	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	16.95	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000024	WORK_IN_PROGRESS	INVENTORY	2026-10-08 18:01:17.637203+00	TLR-2026-000024	e6d6005b-6315-453b-9344-122572ffa2e7	USD	\N	16.95	\N	\N	USD	\N
39269dcd-5102-4d63-9361-f3eaca5fcd9a	JE-TLR-CUST-ADV-02127884FD	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	200000.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000026	CASH	CUSTOMER_ADVANCES	2026-10-08 18:24:48.874492+00	TLR-2026-000026	c50a83ab-1c5f-4bf4-8fac-2af23adc7448	SDG	9000.0000	22.22	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	200000.00
8401afad-469a-409f-b9f3-2af148e3dbf0	FX-CA5EE8AC19-OUT	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CURRENCY_EXCHANGE	3000000.00	تحويل عملة (خروج SDG) بسعر فعلي 60.0000	CURRENCY_EXCHANGE	CASH	2026-10-08 19:29:19.929719+00	FX-CA5EE8AC19	\N	SDG	9000.0000	333.33	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	3000000.00
bfcff8d4-a979-40fa-9f58-5047e6272bcf	FX-CA5EE8AC19-IN	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CURRENCY_EXCHANGE	50000.00	تحويل عملة (دخول USD) بسعر فعلي 60.0000	CASH	CURRENCY_EXCHANGE	2026-10-08 19:29:19.929719+00	FX-CA5EE8AC19	\N	USD	\N	50000.00	\N	\N	USD	\N
2e5179b3-aba4-4a0d-82f6-99591132ec59	JE-TLR-DEP-D2C1D730D0	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	50.00	عربون طلب تفصيل TLR-2026-000007	BANK	SALES	2026-09-29 14:27:05.462559+00	TLR-2026-000007	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	USD	\N	50.00	\N	\N	USD	\N
cd9f421e-8546-4cf0-9865-eeb78574a8a9	JE-TLR-ADV-PAY-F5E166C4F1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	100000.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000017	TAILOR_ADVANCES	BANK	2026-10-07 13:07:38.960882+00	TLR-2026-000017	56f2aba1-04df-441a-84f9-d2b5200fc323	SDG	8700.0000	11.49	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	SDG	100000.00
ed63a1ee-1af1-4951-9323-f927ac87563d	JE-REV-INV-2026-000020	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	532500.00	مبيعات نقطة البيع INV-2026-000020 - CASH	CASH	SALES	2026-10-07 20:05:52.576516+00	INV-2026-000020	90313135-dbd4-4f15-97c0-8f31ba2595d3	SDG	8500.0000	62.65	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	532500.00
540c0045-54ab-4cb5-8ab6-7775ff16fefe	JE-COGS-INV-2026-000020	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	55.58	تكلفة المبيعات للفاتورة INV-2026-000020	COGS	INVENTORY	2026-10-07 20:05:52.576516+00	INV-2026-000020	90313135-dbd4-4f15-97c0-8f31ba2595d3	USD	\N	55.58	\N	\N	USD	\N
639bb1e1-3815-4838-9b2b-f6c14a2068fc	JE-GIFT-INV-2026-000020	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	GIFT	39.49	تكلفة هدايا مع الفاتورة INV-2026-000020	GIFTS	INVENTORY	2026-10-07 20:05:52.576516+00	INV-2026-000020	90313135-dbd4-4f15-97c0-8f31ba2595d3	USD	\N	39.49	\N	\N	USD	\N
0cf53ae6-1af6-4abb-95e6-096cb20ef134	JE-TLR-ADV-PAY-F25BE1274D	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	15000.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000020	TAILOR_ADVANCES	CASH	2026-10-07 20:58:54.121807+00	TLR-2026-000020	db05a618-fcc7-407e-91bf-dc8d54248a4a	SDG	8500.0000	1.76	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	SDG	15000.00
be8c85c8-71d5-4bd6-85a4-40e3b57f6b56	JE-OPEN-7A4CFB8554	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	270.00	مخزون افتتاحي: 1 صنف	INVENTORY	CAPITAL	2026-10-07 22:44:47.504861+00	JE-OPEN-7A4CFB8554	\N	USD	\N	270.00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	USD	2295000.00
6005b72b-c46d-47dd-ae2d-46f1ce1f9f0d	JE-2026-C4A6D36165	ce254f54-c400-4947-a3f4-dc8e9cc90d60	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	160.00	شراء PO-78304634	INVENTORY	SUPPLIERS	2026-10-08 16:51:50.832644+00	PO-PO-78304634	\N	USD	\N	160.00	\N	\N	USD	\N
d6348f87-9984-4950-b7c0-be1bf69a6699	JE-TLR-LABOR-CD8B67BF46	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	3.33	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000023	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-08 18:04:25.716414+00	TLR-2026-000023	19473229-cc56-43a7-880a-6c4ef2d53d5f	USD	\N	3.33	\N	\N	USD	\N
73c863fe-aa8c-43a3-8a0d-0d9be4d67d14	JE-TLR-COGS-CEBCC8AA43	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	3.33	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000023	COGS	WORK_IN_PROGRESS	2026-10-08 18:04:25.716414+00	TLR-2026-000023	19473229-cc56-43a7-880a-6c4ef2d53d5f	USD	\N	3.33	\N	\N	USD	\N
94eb8a09-61a2-407f-b19e-b65f338fe7ae	JE-TLR-REV-ADV-A443BB9630	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	250000.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000023	CUSTOMER_ADVANCES	SALES	2026-10-08 18:04:25.716414+00	TLR-2026-000023	19473229-cc56-43a7-880a-6c4ef2d53d5f	SDG	8999.2801	27.78	\N	8999.280100	SDG	250000.00
40b434cf-4b09-452e-8105-02eb91ba9d3d	JE-TLR-REV-FINAL-8DB6375048	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	250000.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000023	BANK	SALES	2026-10-08 18:04:25.716414+00	TLR-2026-000023	19473229-cc56-43a7-880a-6c4ef2d53d5f	SDG	9000.0000	27.78	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	250000.00
3a2d51e6-4e01-4627-9db2-36f1660e9462	JE-TLR-ADV-PAY-2FBB953DB9	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_ADVANCE	2000.00	دفعة مقدمة للخياط عن طلب التفصيل TLR-2026-000027	TAILOR_ADVANCES	BANK	2026-10-08 18:28:10.749299+00	TLR-2026-000027	1138ae15-0a08-4500-809a-9b07dc0e2fd9	SDG	9000.0000	0.22	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	SDG	2000.00
79bf3567-57f2-433b-b2a1-e919e92a4772	JE-COGS-INV-2026-000008	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	16.75	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000008	COGS	INVENTORY	2026-09-23 11:41:55.512244+00	INV-2026-000008	4364a355-8a9a-49d4-ab14-b03828966fcf	USD	\N	16.75	\N	\N	USD	\N
f7ca98d8-ef39-4937-92af-441193c9f5b6	JE-2026-4223DC1EF1	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	1000.00	ايجار سبتمبر	RENTS	CASH	2026-09-29 11:04:48.037728+00	\N	\N	USD	\N	1000.00	\N	\N	USD	\N
2d9073d1-eaaf-4c1f-8f2b-4b12989baffb	JE-2026-A2AE649ECC	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	5000.00	راس مال افتتاحي تم ايداعه في البنك	BANK	CAPITAL	2026-09-19 21:30:44.226856+00	\N	\N	USD	\N	5000.00	\N	\N	USD	\N
d5f62e83-109a-4caf-ac5b-24cbfc909b48	JE-2026-A614797C9F	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CAPITAL	5000.00	رأس مال افتتاحي تم ايداعه في الخزنة	CASH	CAPITAL	2026-09-19 21:31:17.423936+00	\N	\N	USD	\N	5000.00	\N	\N	USD	\N
825a8b2d-ecad-4e08-bdd2-cd13091f2542	JE-REV-INV-2026-000001	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	720.00	إثبات مبيعات نقطة البيع رقم INV-2026-000001	CASH	SALES	2026-09-19 21:37:20.801847+00	INV-2026-000001	bf466e39-01a5-4d6a-b43a-be4599b79932	USD	\N	720.00	\N	\N	USD	\N
c95f2bf7-6593-4850-ba2b-feac7a0e017e	JE-COGS-INV-2026-000001	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	709.08	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000001	COGS	INVENTORY	2026-09-19 21:37:20.801847+00	INV-2026-000001	bf466e39-01a5-4d6a-b43a-be4599b79932	USD	\N	709.08	\N	\N	USD	\N
5cffa151-2ddf-47de-902c-515ed1cf8598	JE-2026-8404E6FBE0	29d2c46f-9801-4b85-b8ae-0a442e4a6901	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE	1515.00	شراء PO-67807132	INVENTORY	SUPPLIERS	2026-10-02 19:03:30.062231+00	PO-PO-67807132	\N	USD	\N	1515.00	\N	\N	USD	\N
f9b27bb5-ad23-4ac6-b1d9-58efa84eb398	JE-TLR-COGS-95DCB2020E	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	196.90	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000011	COGS	WORK_IN_PROGRESS	2026-10-01 17:28:33.930318+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	196.90	\N	\N	USD	\N
24ee0694-3c6b-4fae-bb46-a9f956b0419c	JE-TLR-REV-ADV-65114469D5	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	225.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000011	CUSTOMER_ADVANCES	SALES	2026-10-01 17:28:33.930318+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	225.00	\N	\N	USD	\N
a538cdf9-dff4-42ba-a4d8-1de75480110c	JE-TLR-REV-FINAL-58ED8D1A47	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	225.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000011	BANK	SALES	2026-10-01 17:28:33.930318+00	TLR-2026-000011	cd4a56e5-e67f-4f97-904b-74f6c263940d	USD	\N	225.00	\N	\N	USD	\N
5ba53637-1013-443b-a355-cff80e0f7b6e	JE-TLR-FABRIC-WIP-6217B6D8AE	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	25.13	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000012	WORK_IN_PROGRESS	INVENTORY	2026-10-02 14:58:45.114402+00	TLR-2026-000012	79aa7a70-cacf-48b5-942e-df55e8c43697	USD	\N	25.13	\N	\N	USD	\N
e29b26c0-f7eb-483f-b1b2-6449d7bcd9db	JE-TLR-PROD-LABOR-E1B6BD51CB	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	30.00	إثبات تكلفة خياطة إنتاج TLR-2026-000012	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-02 15:01:11.419312+00	TLR-2026-000012	79aa7a70-cacf-48b5-942e-df55e8c43697	USD	\N	30.00	\N	\N	USD	\N
14b4150b-6ce2-4980-8c68-ce2e737ab31e	JE-TLR-PROD-FINISH-4D43030E94	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PRODUCTION	55.13	إدخال المنتج المصنع إلى المخزون بتكلفة الإنتاج TLR-2026-000012	INVENTORY	WORK_IN_PROGRESS	2026-10-02 15:01:11.419312+00	TLR-2026-000012	79aa7a70-cacf-48b5-942e-df55e8c43697	USD	\N	55.13	\N	\N	USD	\N
55606e1b-c4b6-4a01-b4c8-acdf367ea481	JE-TLR-SETTLE-70EC7B8F84	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_PAYMENT	30.00	سداد مستحق الخياط عن طلب التفصيل TLR-2026-000012	TAILORS_PAYABLE	CASH	2026-10-02 15:01:56.022307+00	TLR-2026-000012	79aa7a70-cacf-48b5-942e-df55e8c43697	USD	\N	30.00	\N	\N	USD	\N
2c7a32d9-edec-4c18-bedf-37077b749bac	JE-REV-INV-2026-000009	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	70.00	إثبات مبيعات نقطة البيع رقم INV-2026-000009	CASH	SALES	2026-10-02 15:03:46.997059+00	INV-2026-000009	c712117f-2745-468c-b22a-8e6c4c6957f6	USD	\N	70.00	\N	\N	USD	\N
2a7a3430-9f45-4a00-b6cc-de19a7fb2f90	JE-COGS-INV-2026-000009	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	55.13	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000009	COGS	INVENTORY	2026-10-02 15:03:46.997059+00	INV-2026-000009	c712117f-2745-468c-b22a-8e6c4c6957f6	USD	\N	55.13	\N	\N	USD	\N
8bf0c0c7-ee7c-46b4-93a6-6a0707355b76	JE-TLR-CUST-ADV-F74AC3CFE8	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	225.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000013	CASH	CUSTOMER_ADVANCES	2026-10-02 15:05:28.24931+00	TLR-2026-000013	95ad07a7-e8d7-47fd-852e-96f52c582149	USD	\N	225.00	\N	\N	USD	\N
82d1b9eb-3e18-428e-8c07-825f967ca3ec	JE-TLR-CONVERT-LABOR-79F36D779C	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	150.00	إثبات تكلفة خياطة الطلب المحول إلى منتج TLR-2026-000013	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-02 15:05:59.675297+00	TLR-2026-000013	95ad07a7-e8d7-47fd-852e-96f52c582149	USD	\N	150.00	\N	\N	USD	\N
e3ca59e1-147e-4e40-9a95-5f72e369818d	JE-TLR-CONVERT-FINISH-BCB88B7F44	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PRODUCTION	150.00	إدخال المنتج الناتج من تحويل الطلب إلى المخزون بتكلفة التصنيع TLR-2026-000013	INVENTORY	WORK_IN_PROGRESS	2026-10-02 15:05:59.675297+00	TLR-2026-000013	95ad07a7-e8d7-47fd-852e-96f52c582149	USD	\N	150.00	\N	\N	USD	\N
0d864d82-0a2b-43ac-9dbf-20111a6141b0	JE-REV-INV-2026-000010	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	46.05	إثبات مبيعات نقطة البيع رقم INV-2026-000010	CASH	SALES	2026-10-02 18:51:44.978169+00	INV-2026-000010	ccd941fd-89d4-42ae-9026-71746b54c591	USD	\N	46.05	\N	\N	USD	\N
8e76b32b-88f9-4e4e-a6db-517dd550e876	JE-COGS-INV-2026-000010	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	51.42	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000010	COGS	INVENTORY	2026-10-02 18:51:44.978169+00	INV-2026-000010	ccd941fd-89d4-42ae-9026-71746b54c591	USD	\N	51.42	\N	\N	USD	\N
7733c44e-3841-4dc5-b5ab-0f7769354ef3	JE-2026-A8E21E3E58	29d2c46f-9801-4b85-b8ae-0a442e4a6901	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	PURCHASE_PAYMENT	1515.00	دفعة للمورد عن طلب الشراء PO-67807132	SUPPLIERS	BANK	2026-10-02 19:03:32.332449+00	\N	\N	USD	\N	1515.00	\N	\N	USD	\N
562b92fb-ee02-4b8a-aa25-4e11504c5a13	JE-REV-INV-2026-000011	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	540.00	إثبات مبيعات نقطة البيع رقم INV-2026-000011	CASH	SALES	2026-10-02 19:04:42.372754+00	INV-2026-000011	41b93550-8214-475c-af11-168e61131fc3	USD	\N	540.00	\N	\N	USD	\N
0bcf9971-2081-4d73-a68e-12333841718e	JE-COGS-INV-2026-000011	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	292.74	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000011	COGS	INVENTORY	2026-10-02 19:04:42.372754+00	INV-2026-000011	41b93550-8214-475c-af11-168e61131fc3	USD	\N	292.74	\N	\N	USD	\N
4f510920-9247-4e71-8081-00b1a9184749	JE-REV-INV-2026-000012	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	180.00	إثبات مبيعات نقطة البيع رقم INV-2026-000012	CASH	SALES	2026-10-03 17:05:54.626068+00	INV-2026-000012	f7be6afe-9e7e-4323-8c0a-15f107f034dc	USD	\N	180.00	\N	\N	USD	\N
684829df-d44b-4504-ba0d-767ba2eebb2e	JE-COGS-INV-2026-000012	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	92.58	إثبات تكلفة المبيعات ونقص المخزون للفاتورة INV-2026-000012	COGS	INVENTORY	2026-10-03 17:05:54.626068+00	INV-2026-000012	f7be6afe-9e7e-4323-8c0a-15f107f034dc	USD	\N	92.58	\N	\N	USD	\N
372732f9-f851-4822-9895-2d13efa29eb7	JE-GIFT-INV-2026-000012	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	EXPENSE	116.36	إثبات تكلفة الهدايا ضمن الفاتورة INV-2026-000012	GIFT_EXPENSE	INVENTORY	2026-10-03 17:05:54.626068+00	INV-2026-000012	f7be6afe-9e7e-4323-8c0a-15f107f034dc	USD	\N	116.36	\N	\N	USD	\N
e7e44d3e-c0cd-4d7e-ad1f-e81699b2f056	JE-TLR-LABOR-D7A3CE5792	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILOR_COST	200.00	إثبات تكلفة خياطة طلب تفصيل TLR-2026-000014	WORK_IN_PROGRESS	TAILORS_PAYABLE	2026-10-03 19:46:43.902206+00	TLR-2026-000014	258e66b7-d413-4945-8044-95782324f6c1	USD	\N	200.00	\N	\N	USD	\N
daada9ef-159a-40fe-b10f-c924f7e4a731	JE-TLR-COGS-16BF5F4179	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	200.00	إثبات تكلفة طلب التفصيل واستهلاك الإنتاج عند تسليمه TLR-2026-000014	COGS	WORK_IN_PROGRESS	2026-10-03 19:46:43.902206+00	TLR-2026-000014	258e66b7-d413-4945-8044-95782324f6c1	USD	\N	200.00	\N	\N	USD	\N
c03fa082-0811-45f5-a0cc-e678bce15c32	JE-TLR-REV-ADV-3D1F9881FC	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	75.00	تحويل عربون العميل إلى إيراد عند تسليم طلب التفصيل TLR-2026-000014	CUSTOMER_ADVANCES	SALES	2026-10-03 19:46:43.902206+00	TLR-2026-000014	258e66b7-d413-4945-8044-95782324f6c1	USD	\N	75.00	\N	\N	USD	\N
71bb4c48-8bec-4d27-b77f-0aab8e17535a	JE-TLR-REV-FINAL-DAE7976B27	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	75.00	تحصيل باقي قيمة طلب التفصيل TLR-2026-000014	CASH	SALES	2026-10-03 19:46:43.902206+00	TLR-2026-000014	258e66b7-d413-4945-8044-95782324f6c1	USD	\N	75.00	\N	\N	USD	\N
c0221155-1651-499f-ae93-7518a2e95f22	JE-TLR-CUST-ADV-655B423FC7	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	CUSTOMER_ADVANCE	250.00	استلام عربون من العميل لطلب تفصيل TLR-2026-000015	CASH	CUSTOMER_ADVANCES	2026-10-03 19:48:40.627024+00	TLR-2026-000015	70817a11-a4f4-4997-96e7-83478c1bdbcf	USD	\N	250.00	\N	\N	USD	\N
aad15d52-64b6-4773-ac9d-cf8301b5ef4c	JE-TLR-FABRIC-WIP-5FCFC9F0AE	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	TAILORING_MATERIAL	58.63	تحويل تكلفة القماش إلى إنتاج تحت التشغيل لطلب تفصيل TLR-2026-000015	WORK_IN_PROGRESS	INVENTORY	2026-10-03 19:49:12.195878+00	TLR-2026-000015	70817a11-a4f4-4997-96e7-83478c1bdbcf	USD	\N	58.63	\N	\N	USD	\N
5d8c8020-374a-4195-af85-7584ac2ce7ac	JE-REV-INV-2026-000016	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	SALE	4698000.00	مبيعات نقطة البيع INV-2026-000016 - BANK_TRANSFER	BANK	SALES	2026-10-05 18:45:12.868772+00	INV-2026-000016	2aadb231-35cf-4fe0-b02f-99a062736230	SDG	8700.0000	540.00	\N	\N	SDG	\N
ae4ca98b-5c1d-4ed8-b839-7ebc9d4aa8c6	JE-COGS-INV-2026-000016	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	dcc40a00-1275-463f-9cd8-caf5487100b0	COGS	292.74	تكلفة المبيعات للفاتورة INV-2026-000016	COGS	INVENTORY	2026-10-05 18:45:12.868772+00	INV-2026-000016	2aadb231-35cf-4fe0-b02f-99a062736230	USD	\N	292.74	\N	\N	USD	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, title, message, type, link, "isRead", metadata, created_at, target_roles) FROM stdin;
53066638-7679-4163-aa59-dfbb6157c410	طلب تفصيل متأخر	الطلب TLR-2026-000003 (احمد محمد) كان موعد تسليمه 2026-09-26 — متأخر 13 يوم.	ORDER_DELAY	/dashboard/tailoring/77cc81a1-2bbf-4abb-983a-76dace9ecb78	f	{"key": "ORDER_DELAY:77cc81a1-2bbf-4abb-983a-76dace9ecb78", "sales_order_id": "77cc81a1-2bbf-4abb-983a-76dace9ecb78"}	2026-10-09 16:40:34.98967+00	\N
89b5520a-7c2d-4928-8d4d-f3ebb67870c4	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000025 «ثوب كتان» للعميل عمر عبدالله أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/ad718a01-60ee-490f-987c-ba8dba3d9d20	t	{"key": "TAILORING_ASSIGNMENT:ad718a01-60ee-490f-987c-ba8dba3d9d20", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "a7cde9fd-a4da-4b3f-af45-a710b3639be9", "sales_order_id": "ad718a01-60ee-490f-987c-ba8dba3d9d20"}	2026-10-08 18:14:21.184206+00	{tailor}
8d34333f-1ba4-48db-8426-4e07c46c66a0	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000027 «ثوب كتان» للعميل عمر عبدالله أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/1138ae15-0a08-4500-809a-9b07dc0e2fd9	f	{"key": "TAILORING_ASSIGNMENT:1138ae15-0a08-4500-809a-9b07dc0e2fd9", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "1138ae15-0a08-4500-809a-9b07dc0e2fd9"}	2026-10-08 18:27:14.074165+00	{tailor}
02c75b8c-a007-4106-94c1-1a01fa1a1dcc	تعديل طلب تفصيل	الطلب TLR-2026-000025 «ثوب كتان» للعميل عمر عبدالله: تعديل طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/ad718a01-60ee-490f-987c-ba8dba3d9d20	t	{"key": "TAILORING:ad718a01-60ee-490f-987c-ba8dba3d9d20:EDITED", "event": "EDITED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "a7cde9fd-a4da-4b3f-af45-a710b3639be9", "sales_order_id": "ad718a01-60ee-490f-987c-ba8dba3d9d20"}	2026-10-08 18:17:32.246911+00	{tailor}
89cfe9c1-c38f-4478-9f21-e19f72bfa96d	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000028 «جلابية قطن بني» أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/576f7912-4ad1-436c-a955-a0b5b990f405	t	{"key": "TAILORING_ASSIGNMENT:576f7912-4ad1-436c-a955-a0b5b990f405", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "576f7912-4ad1-436c-a955-a0b5b990f405"}	2026-10-08 18:30:44.814474+00	{tailor}
e03287cd-0e29-49e8-b745-419ebfdf0d72	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000003 «طلب تفصيل TLR-2026-000003» للعميل احمد محمد أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/77cc81a1-2bbf-4abb-983a-76dace9ecb78	f	{"key": "TAILORING_ASSIGNMENT:77cc81a1-2bbf-4abb-983a-76dace9ecb78", "event": "ASSIGNED", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "77cc81a1-2bbf-4abb-983a-76dace9ecb78"}	2026-10-07 14:53:15.849439+00	{tailor}
4be59aab-21b9-4f92-acc5-52c656859cbe	تم إلغاء طلب تفصيل	الطلب TLR-2026-000025 «ثوب كتان» للعميل عمر عبدالله: تم إلغاء طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/ad718a01-60ee-490f-987c-ba8dba3d9d20	t	{"key": "TAILORING:ad718a01-60ee-490f-987c-ba8dba3d9d20:CANCELLED", "event": "CANCELLED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "a7cde9fd-a4da-4b3f-af45-a710b3639be9", "sales_order_id": "ad718a01-60ee-490f-987c-ba8dba3d9d20"}	2026-10-08 18:18:54.589802+00	{tailor}
18e332a2-ce16-4db4-962c-a5e53bf9c467	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000020 «علي الله» للعميل عمر عبدالله أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/db05a618-fcc7-407e-91bf-dc8d54248a4a	t	{"key": "TAILORING_ASSIGNMENT:db05a618-fcc7-407e-91bf-dc8d54248a4a", "event": "CREATED", "actor_id": "7bbdc948-cf5a-4017-a7cf-c3cd53e156e5", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "db05a618-fcc7-407e-91bf-dc8d54248a4a"}	2026-10-07 20:39:01.141182+00	{tailor}
377f9358-68c2-4d1a-babb-721ff7dc3e71	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000018 «ثوب كتان» للعميل موسى الشريف أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/5566880c-fb25-4263-9c6c-b25b2b3e7133	t	{"key": "TAILORING_ASSIGNMENT:5566880c-fb25-4263-9c6c-b25b2b3e7133", "event": "ASSIGNED", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "5566880c-fb25-4263-9c6c-b25b2b3e7133"}	2026-10-07 14:53:15.849439+00	{tailor}
8add07ea-0d75-4e48-bcea-794fb6e933aa	بدأ التفصيل	الطلب TLR-2026-000018 «ثوب كتان» للعميل موسى الشريف: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/5566880c-fb25-4263-9c6c-b25b2b3e7133	t	{"key": "TAILORING:5566880c-fb25-4263-9c6c-b25b2b3e7133:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "5566880c-fb25-4263-9c6c-b25b2b3e7133"}	2026-10-07 20:47:43.782564+00	{tailor}
c548611c-afe8-437b-bad8-591680100e32	بدأ التفصيل	الطلب TLR-2026-000020 «علي الله» للعميل عمر عبدالله: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/db05a618-fcc7-407e-91bf-dc8d54248a4a	t	{"key": "TAILORING:db05a618-fcc7-407e-91bf-dc8d54248a4a:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "db05a618-fcc7-407e-91bf-dc8d54248a4a"}	2026-10-07 20:47:22.28756+00	{tailor}
950a9207-1531-4231-8d7d-137b7851589b	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000019 «ثوب كتان» للعميل موسى التاج أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/d78e6f94-2b33-4c3b-9702-0af30831eb1a	t	{"key": "TAILORING_ASSIGNMENT:d78e6f94-2b33-4c3b-9702-0af30831eb1a", "event": "ASSIGNED", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "d78e6f94-2b33-4c3b-9702-0af30831eb1a"}	2026-10-07 14:53:15.849439+00	{tailor}
b2f4244d-d98c-4005-8177-f575aadd2856	استرداد عربون	الطلب TLR-2026-000025 «ثوب كتان» للعميل عمر عبدالله: استرداد عربون.	TAILORING_UPDATE	/dashboard/tailoring/ad718a01-60ee-490f-987c-ba8dba3d9d20	f	{"key": "TAILORING:ad718a01-60ee-490f-987c-ba8dba3d9d20:REFUNDED", "event": "REFUNDED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "a7cde9fd-a4da-4b3f-af45-a710b3639be9", "sales_order_id": "ad718a01-60ee-490f-987c-ba8dba3d9d20"}	2026-10-08 18:19:37.646999+00	{tailor}
37b8fcba-a32a-4c0b-bbb5-ef7c6aef9367	طلب جاهز للاستلام	الطلب TLR-2026-000018 «ثوب كتان» للعميل موسى الشريف: طلب جاهز للاستلام.	TAILORING_UPDATE	/dashboard/tailoring/5566880c-fb25-4263-9c6c-b25b2b3e7133	t	{"key": "TAILORING:5566880c-fb25-4263-9c6c-b25b2b3e7133:READY_FOR_PICKUP", "event": "READY_FOR_PICKUP", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "5566880c-fb25-4263-9c6c-b25b2b3e7133"}	2026-10-07 20:47:50.236858+00	{tailor}
1dac3722-b8da-45ca-80af-5912bda2ef46	تم تسليم طلب تفصيل	الطلب TLR-2026-000018 «ثوب كتان» للعميل موسى الشريف: تم تسليم طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/5566880c-fb25-4263-9c6c-b25b2b3e7133	f	{"key": "TAILORING:5566880c-fb25-4263-9c6c-b25b2b3e7133:RECEIVED", "event": "RECEIVED", "actor_id": "7bbdc948-cf5a-4017-a7cf-c3cd53e156e5", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "5566880c-fb25-4263-9c6c-b25b2b3e7133"}	2026-10-07 20:51:43.223065+00	{tailor}
d622f504-bc97-4625-84e7-2145d9ceca76	تحويل طلب إلى منتج	الطلب TLR-2026-000020 «علي الله» للعميل عمر عبدالله: تحويل طلب إلى منتج.	TAILORING_UPDATE	/dashboard/tailoring/db05a618-fcc7-407e-91bf-dc8d54248a4a	t	{"key": "TAILORING:db05a618-fcc7-407e-91bf-dc8d54248a4a:CONVERTED", "event": "CONVERTED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "db05a618-fcc7-407e-91bf-dc8d54248a4a"}	2026-10-07 21:01:29.518439+00	{tailor}
8be0d193-31a1-4368-9b1e-97993023f80d	بدأ التفصيل	الطلب TLR-2026-000028 «جلابية قطن بني»: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/576f7912-4ad1-436c-a955-a0b5b990f405	t	{"key": "TAILORING:576f7912-4ad1-436c-a955-a0b5b990f405:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "576f7912-4ad1-436c-a955-a0b5b990f405"}	2026-10-08 18:31:22.253105+00	{tailor}
b5c6735b-9bec-41a8-ba7d-f0b2fe85c11d	استرداد عربون	الطلب TLR-2026-000020 «علي الله» للعميل عمر عبدالله: استرداد عربون.	TAILORING_UPDATE	/dashboard/tailoring/db05a618-fcc7-407e-91bf-dc8d54248a4a	f	{"key": "TAILORING:db05a618-fcc7-407e-91bf-dc8d54248a4a:REFUNDED", "event": "REFUNDED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "db05a618-fcc7-407e-91bf-dc8d54248a4a"}	2026-10-07 21:04:22.917149+00	{tailor}
036e9c53-6eb1-4853-be26-f0be8d4cf329	تم إلغاء طلب تفصيل	الطلب TLR-2026-000019 «ثوب كتان» للعميل موسى التاج: تم إلغاء طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/d78e6f94-2b33-4c3b-9702-0af30831eb1a	f	{"key": "TAILORING:d78e6f94-2b33-4c3b-9702-0af30831eb1a:CANCELLED", "event": "CANCELLED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "d78e6f94-2b33-4c3b-9702-0af30831eb1a"}	2026-10-07 21:06:13.399296+00	{tailor}
54f41619-0c69-4e37-918f-453ec83a8916	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000021 «ثوب كتان» للعميل موسى التاج أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/1fc23e98-e75a-4bae-a67a-5a34e6e81810	t	{"key": "TAILORING_ASSIGNMENT:1fc23e98-e75a-4bae-a67a-5a34e6e81810", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "1fc23e98-e75a-4bae-a67a-5a34e6e81810"}	2026-10-07 21:08:29.59673+00	{tailor}
4dc8b548-cea9-4f30-a376-8f7b1568ed10	تحويل طلب إلى منتج	الطلب TLR-2026-000024 «على الله» للعميل عبدالله عثمان: تحويل طلب إلى منتج.	TAILORING_UPDATE	/dashboard/tailoring/e6d6005b-6315-453b-9344-122572ffa2e7	f	{"key": "TAILORING:e6d6005b-6315-453b-9344-122572ffa2e7:CONVERTED", "event": "CONVERTED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "e6d6005b-6315-453b-9344-122572ffa2e7"}	2026-10-08 18:22:19.628585+00	{tailor}
4f7d3296-dd4a-4e34-bbf8-465573915cba	تعديل طلب تفصيل	الطلب TLR-2026-000021 «ثوب كتان» للعميل موسى التاج: تعديل طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/1fc23e98-e75a-4bae-a67a-5a34e6e81810	t	{"key": "TAILORING:1fc23e98-e75a-4bae-a67a-5a34e6e81810:EDITED", "event": "EDITED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "1fc23e98-e75a-4bae-a67a-5a34e6e81810"}	2026-10-07 21:14:50.652364+00	{tailor}
39faf91d-b793-4f19-be0e-f0bd69e17e1b	بدأ التفصيل	الطلب TLR-2026-000021 «ثوب كتان» للعميل موسى التاج: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/1fc23e98-e75a-4bae-a67a-5a34e6e81810	f	{"key": "TAILORING:1fc23e98-e75a-4bae-a67a-5a34e6e81810:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "1fc23e98-e75a-4bae-a67a-5a34e6e81810"}	2026-10-07 21:15:38.402738+00	{tailor}
565243eb-ca66-448b-bc6b-b60b49b0a06c	إنتاج جاهز للاستلام	الطلب TLR-2026-000028 «جلابية قطن بني»: إنتاج جاهز للاستلام.	TAILORING_UPDATE	/dashboard/tailoring/576f7912-4ad1-436c-a955-a0b5b990f405	t	{"key": "TAILORING:576f7912-4ad1-436c-a955-a0b5b990f405:READY_FOR_PICKUP", "event": "READY_FOR_PICKUP", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "576f7912-4ad1-436c-a955-a0b5b990f405"}	2026-10-08 18:31:27.112227+00	{tailor}
f6fb806b-1882-4b02-812e-08c3b421d2dc	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000022 «ثوب كتان» أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/25a58694-8006-4bc0-b17f-4d50982eb949	t	{"key": "TAILORING_ASSIGNMENT:25a58694-8006-4bc0-b17f-4d50982eb949", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "25a58694-8006-4bc0-b17f-4d50982eb949"}	2026-10-07 21:17:58.775613+00	{tailor}
184f3470-31de-4b43-a5a9-68b83e29471b	بدأ التفصيل	الطلب TLR-2026-000022 «ثوب كتان»: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/25a58694-8006-4bc0-b17f-4d50982eb949	f	{"key": "TAILORING:25a58694-8006-4bc0-b17f-4d50982eb949:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "25a58694-8006-4bc0-b17f-4d50982eb949"}	2026-10-07 21:23:43.113375+00	{tailor}
af85d5c2-b507-499f-af7d-9e7790b15afb	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000024 «على الله» للعميل عبدالله عثمان أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/e6d6005b-6315-453b-9344-122572ffa2e7	t	{"key": "TAILORING_ASSIGNMENT:e6d6005b-6315-453b-9344-122572ffa2e7", "event": "CREATED", "actor_id": "7bbdc948-cf5a-4017-a7cf-c3cd53e156e5", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "e6d6005b-6315-453b-9344-122572ffa2e7"}	2026-10-08 17:57:28.369681+00	{tailor}
9a432364-abdf-45d3-a64a-20036e1c8776	بدأ التفصيل	الطلب TLR-2026-000024 «على الله» للعميل عبدالله عثمان: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/e6d6005b-6315-453b-9344-122572ffa2e7	t	{"key": "TAILORING:e6d6005b-6315-453b-9344-122572ffa2e7:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "e6d6005b-6315-453b-9344-122572ffa2e7"}	2026-10-08 18:01:18.955524+00	{tailor}
92af4c52-172b-4ff2-861f-3499c7fac184	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000023 «جلابية قطن بني» للعميل احمد محمد أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/19473229-cc56-43a7-880a-6c4ef2d53d5f	t	{"key": "TAILORING_ASSIGNMENT:19473229-cc56-43a7-880a-6c4ef2d53d5f", "event": "CREATED", "actor_id": "48143da1-d832-40d6-99a0-2262bd58f2a4", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "19473229-cc56-43a7-880a-6c4ef2d53d5f"}	2026-10-08 14:08:21.34131+00	{tailor}
edbad0c9-697f-4c90-9dc0-61e57fbdb803	بدأ التفصيل	الطلب TLR-2026-000023 «جلابية قطن بني» للعميل احمد محمد: بدأ التفصيل.	TAILORING_UPDATE	/dashboard/tailoring/19473229-cc56-43a7-880a-6c4ef2d53d5f	t	{"key": "TAILORING:19473229-cc56-43a7-880a-6c4ef2d53d5f:UNDER_TAILORING", "event": "UNDER_TAILORING", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "19473229-cc56-43a7-880a-6c4ef2d53d5f"}	2026-10-08 18:01:52.026187+00	{tailor}
9b7c2867-8ce3-4738-93c6-0f84430af97b	طلب تفصيل جديد مسند إليك	الطلب TLR-2026-000026 «ثوب كتان» للعميل عمر عبدالله أُسند إليك للتنفيذ.	TAILORING_UPDATE	/dashboard/tailoring/c50a83ab-1c5f-4bf4-8fac-2af23adc7448	t	{"key": "TAILORING_ASSIGNMENT:c50a83ab-1c5f-4bf4-8fac-2af23adc7448", "event": "CREATED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "c50a83ab-1c5f-4bf4-8fac-2af23adc7448"}	2026-10-08 18:24:49.697204+00	{tailor}
7bbaf617-6f0e-4b13-8fa9-eae62c497ff8	تم استلام إنتاج	الطلب TLR-2026-000028 «جلابية قطن بني»: تم استلام إنتاج.	TAILORING_UPDATE	/dashboard/tailoring/576f7912-4ad1-436c-a955-a0b5b990f405	f	{"key": "TAILORING:576f7912-4ad1-436c-a955-a0b5b990f405:PRODUCTION_RECEIVED", "event": "PRODUCTION_RECEIVED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "576f7912-4ad1-436c-a955-a0b5b990f405"}	2026-10-08 18:32:25.4794+00	{tailor}
c407f3e2-d779-4b3b-a1a3-26bda66a64e7	طلب جاهز للاستلام	الطلب TLR-2026-000023 «جلابية قطن بني» للعميل احمد محمد: طلب جاهز للاستلام.	TAILORING_UPDATE	/dashboard/tailoring/19473229-cc56-43a7-880a-6c4ef2d53d5f	t	{"key": "TAILORING:19473229-cc56-43a7-880a-6c4ef2d53d5f:READY_FOR_PICKUP", "event": "READY_FOR_PICKUP", "actor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "19473229-cc56-43a7-880a-6c4ef2d53d5f"}	2026-10-08 18:01:58.788884+00	{tailor}
cccfbd5b-2af5-4199-94df-f74acc22b752	تم تسليم طلب تفصيل	الطلب TLR-2026-000023 «جلابية قطن بني» للعميل احمد محمد: تم تسليم طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/19473229-cc56-43a7-880a-6c4ef2d53d5f	f	{"key": "TAILORING:19473229-cc56-43a7-880a-6c4ef2d53d5f:RECEIVED", "event": "RECEIVED", "actor_id": "7bbdc948-cf5a-4017-a7cf-c3cd53e156e5", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "19473229-cc56-43a7-880a-6c4ef2d53d5f"}	2026-10-08 18:04:27.021762+00	{tailor}
70607273-ba3c-48be-b4c5-041fff16d6f1	تم إلغاء طلب تفصيل	الطلب TLR-2026-000026 «ثوب كتان» للعميل عمر عبدالله: تم إلغاء طلب تفصيل.	TAILORING_UPDATE	/dashboard/tailoring/c50a83ab-1c5f-4bf4-8fac-2af23adc7448	f	{"key": "TAILORING:c50a83ab-1c5f-4bf4-8fac-2af23adc7448:CANCELLED", "event": "CANCELLED", "actor_id": "f25f6d4b-9b0b-43cb-b619-54fc913449ab", "tailor_id": "979147a7-a426-4e30-b90b-5f81f606c48b", "sales_order_id": "c50a83ab-1c5f-4bf4-8fac-2af23adc7448"}	2026-10-08 18:25:13.992187+00	{tailor}
\.


--
-- Data for Name: product_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_templates (id, name, description, "categoryId", "supplierId", "hasVariants", "purchaseUnit", "sellingUnit", "conversionFactor", images, "isActive", "isVisible", "createdAt", "updatedAt") FROM stdin;
8e11036a-62b5-4099-be9d-9b6bdb6850e8	حذاء		7a70dd70-a3ce-4592-88fd-7e02b34fea1a	86149372-b75e-442a-8a2f-97683b1efb3a	f	كرتونة	قطعة	15	{}	t	t	2026-09-21 18:01:37.99711+00	2026-09-21 18:01:37.99711+00
859c97ed-4a25-4762-b904-ca016fd30442	عطر من سوفاج		929f5bdf-cd05-4e70-8c2c-3e36f3719375	\N	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790013996596-fg9vlef3.png}	t	t	2026-09-21 18:07:15.33896+00	2026-09-21 18:07:15.33896+00
58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	عطر بلاك من عبد الصمد		929f5bdf-cd05-4e70-8c2c-3e36f3719375	\N	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790015017451-28kv4afh.jpg}	t	t	2026-09-21 18:24:17.357987+00	2026-09-21 18:35:41.106+00
94340b6c-fe97-4067-bfd5-f2569f079362	حذاء رياضي نايكي		7a70dd70-a3ce-4592-88fd-7e02b34fea1a	86149372-b75e-442a-8a2f-97683b1efb3a	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1789830144525-kelbwmuu.jpg}	t	t	2026-09-19 15:03:16.968963+00	2026-09-19 15:03:16.968963+00
332f8d1e-b025-455d-9b1f-8e3caab88295	قماش باكستاني		a954b0a9-5c5c-4193-bd52-40accf920164	\N	f	طاقة	متر	25	{}	t	t	2026-09-21 19:56:29.535768+00	2026-09-21 19:56:29.535768+00
ba277ad0-2925-4eb6-9114-158880d6178d	صديري		6698e760-b238-4800-9752-296667248124	\N	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1789854141033-x0cevd8l.jpg}	t	t	2026-09-19 21:42:58.869853+00	2026-09-20 13:43:32.705465+00
ad451294-47bd-4f5b-8bc0-0bb06b49faec	قماش هندي		a954b0a9-5c5c-4193-bd52-40accf920164	3b1f5010-df2e-4556-a054-454e971f5ed9	f	طاقة	متر	25	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790026976829-e4qbdiya.png}	t	t	2026-09-21 21:43:59.440783+00	2026-09-21 21:43:59.440783+00
b574a61a-7bad-4818-87b7-d39ead948134	سديري اسود بلمعة		6698e760-b238-4800-9752-296667248124	3b1f5010-df2e-4556-a054-454e971f5ed9	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1789934006975-xpa8zd3g.png}	t	t	2026-09-20 19:55:07.867086+00	2026-09-20 20:22:43.680311+00
d9f347d4-54d5-4171-a1ed-25f96686f714	صديري بني		\N	\N	f	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790431278662-9zlpbguk.png}	t	t	2026-09-26 13:56:30.323617+00	2026-09-26 14:01:25.992813+00
0d8be9bf-02d8-4970-8fa9-e818f9012fbf	سروال ابيض بلستك	\N	3093ea40-0e14-4b99-b1da-228aa484c6cf	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-02 15:01:11.419312+00	2026-10-02 15:01:11.419312+00
63ae0a9d-ee2c-4004-9730-b8602c376b4b	جلابية كتان	\N	\N	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-02 15:05:59.675297+00	2026-10-02 15:05:59.675297+00
3d8170b6-a0d1-4e02-976f-cce5497ca06a	صديري اسود بلمعة		6698e760-b238-4800-9752-296667248124	\N	t	قطعة	قطعة	1	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790967443303-232ydp0i.jpg}	t	t	2026-10-02 19:02:04.106264+00	2026-10-02 19:02:04.106264+00
fe14a8e5-4e88-4fe8-aac3-1573062735e4	ثوب كتان		3093ea40-0e14-4b99-b1da-228aa484c6cf	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-06 13:45:57.797062+00	2026-10-06 13:45:57.797062+00
6a9b6ed6-949d-4ca3-9f19-a3ff1cabd063	ثوب قطني		a954b0a9-5c5c-4193-bd52-40accf920164	\N	f	طاقة	متر	50	{}	t	t	2026-10-06 18:04:57.006665+00	2026-10-06 18:04:57.006665+00
5512d3fe-cf9d-48e1-a925-f6e842615563	علي الله	علي الله زرقاء اكمام مسلوبة جيوب ازرار	3093ea40-0e14-4b99-b1da-228aa484c6cf	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-07 21:01:27.978792+00	2026-10-07 21:01:27.978792+00
1b8475e5-a387-45d0-992e-eb5e4ed076e7	حذاء جلدي		7a70dd70-a3ce-4592-88fd-7e02b34fea1a	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-07 22:43:47.47246+00	2026-10-07 22:43:47.47246+00
af22a815-e7de-4720-ada3-eb1ee2866a43	على الله	على الله باكمام مسلوبة وازرار في الجيوب وقيطان	3093ea40-0e14-4b99-b1da-228aa484c6cf	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-08 18:22:19.006868+00	2026-10-08 18:22:19.006868+00
38d676aa-deeb-4f36-96f1-357b91e1ae61	جلابية قطن بني	\N	\N	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-08 18:32:24.62697+00	2026-10-08 18:32:24.62697+00
872a6c4f-a23d-41ac-b003-c40f442cc559	شال بلمعة		4a8c1e2a-e142-45d5-96de-e0eb41620f3a	\N	f	قطعة	قطعة	1	{}	t	t	2026-10-08 19:13:50.21727+00	2026-10-08 19:13:50.21727+00
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_variants (id, "templateId", sku, barcode, "packBarcode", "colorName", "colorCode", size, length, width, "purchasePrice", "sellingPrice", "minSellingPrice", "stockQuantity", "minStockLevel", images, "isDefault", "isActive", "createdAt", "updatedAt", "averageCost") FROM stdin;
8a58c754-f822-4278-b688-b05c9ae03db5	1b8475e5-a387-45d0-992e-eb5e4ed076e7	SKU-1ABB637D59	2087298875181	\N	\N	#000000	\N	\N	\N	20.00	30.00	0.00	11.00	5.00	{}	t	t	2026-10-07 22:43:47.47246+00	2026-10-08 16:48:03.816797+00	18.00
9733a683-15ef-4a31-a958-461bed369d65	3d8170b6-a0d1-4e02-976f-cce5497ca06a	SKU-0883DB37EA	2098623316101	\N	اسود بلمعة	#0b0c0c	S	\N	\N	50.00	90.00	0.00	4.00	5.00	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790967591513-s01nhkey.webp}	f	t	2026-10-02 19:02:04.106264+00	2026-10-08 16:48:03.816797+00	51.29
f9fff384-cb87-477c-bbc2-41a730fe88fd	94340b6c-fe97-4067-bfd5-f2569f079362	SKU-F565E4E6F4	2061476853543	\N	\N	#000000	\N	\N	\N	50.00	120.00	115.00	13.00	5.00	{}	t	t	2026-09-19 15:03:16.968963+00	2026-10-07 12:29:28.100799+00	95.99
6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	b574a61a-7bad-4818-87b7-d39ead948134	SKU-368D67E2D9	2020703164135	\N	\N	#000000	\N	\N	\N	110.00	120.00	0.00	4.00	5.00	{}	t	t	2026-09-20 19:55:07.867086+00	2026-10-03 17:05:54.626068+00	116.36
e5728235-0a9e-4c97-94f5-2ea336a0219d	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	PROD-897597	\N	\N	\N	\N	\N	\N	\N	55.13	70.00	\N	2.00	5.00	{}	t	t	2026-10-02 15:01:11.419312+00	2026-10-07 12:31:03.588689+00	75.13
9f7a16a8-4f3a-48e6-9935-c275f857beba	ba277ad0-2925-4eb6-9114-158880d6178d	SKU-BF2ADA9DA0	2018119187350	\N	\N	#000000	\N	\N	\N	100.00	140.00	0.00	8.00	5.00	{}	t	t	2026-09-19 21:42:58.869853+00	2026-10-05 16:18:14.819252+00	128.90
0e39be16-e69f-457c-a79f-06d398dd5679	d9f347d4-54d5-4171-a1ed-25f96686f714	SKU-E4532B52EB	2021916196654	\N	\N	#000000	\N	\N	\N	313.06	300.00	\N	1.00	5.00	{}	t	t	2026-09-26 13:56:30.323617+00	2026-09-26 14:01:25.992813+00	313.06
1ef01eeb-6a90-4407-b356-dea9015b973a	3d8170b6-a0d1-4e02-976f-cce5497ca06a	SKU-20C1061E1C	4842231075630	\N	اسود بنقشة بيضاء	#525252	L	0.00	0.00	45.00	90.00	0.00	7.00	5.00	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790967664215-rw3dyejg.png}	f	t	2026-10-02 19:02:04.106264+00	2026-10-05 18:45:12.868772+00	46.29
66665726-b6a5-4dd8-a640-6de10b14b770	af22a815-e7de-4720-ada3-eb1ee2866a43	\N	\N	\N	\N	\N	\N	\N	\N	22.51	100.00	\N	1.00	1.00	{}	t	t	2026-10-08 18:22:19.006868+00	2026-10-08 18:22:19.006868+00	22.51
2bf556f1-2202-4fc4-be07-c646f4a263a2	ad451294-47bd-4f5b-8bc0-0bb06b49faec	SKU-F7CBB75635	2091530957306	\N	\N	#000000	\N	\N	\N	80.00	15.00	0.00	39.40	5.00	{}	t	t	2026-09-21 21:43:59.440783+00	2026-10-08 18:31:21.354701+00	3.39
b730c00c-0681-468f-b2d3-3b4e4a8ad92d	38d676aa-deeb-4f36-96f1-357b91e1ae61	\N	\N	\N	\N	\N	\N	\N	\N	12.14	45.00	\N	1.00	1.00	{}	t	t	2026-10-08 18:32:24.62697+00	2026-10-08 18:32:24.62697+00	12.14
af637885-884b-4b1c-887f-a90df270f350	63ae0a9d-ee2c-4004-9730-b8602c376b4b	\N	\N	\N	\N	\N	\N	\N	\N	150.00	300.00	\N	1.00	5.00	{}	t	t	2026-10-02 15:05:59.675297+00	2026-10-02 15:05:59.675297+00	150.00
90d344c2-29ef-43fb-b673-be3709878379	332f8d1e-b025-455d-9b1f-8e3caab88295	SKU-E6DFD2FC53	2074075396861	\N	\N	#000000	\N	\N	\N	550.00	35.00	0.00	1.00	5.00	{}	t	t	2026-09-21 19:56:29.535768+00	2026-09-21 19:57:24.769368+00	650.00
e1818896-2a34-4287-9fc1-c93a1b0a725d	8e11036a-62b5-4099-be9d-9b6bdb6850e8	SKU-C9F44FAD7C	2085452515140	\N	\N	#000000	\N	\N	\N	200.00	45.00	0.00	10.00	5.00	{}	t	t	2026-09-21 18:01:37.99711+00	2026-09-21 20:56:57.165303+00	290.00
78b086ad-974d-48d0-a1f3-6206a176c8b0	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	SKU-43EE2FD5E5	2005838554518	\N	\N	#000000	\N	\N	\N	45.00	55.00	0.00	8.00	5.00	{}	t	t	2026-09-21 18:24:17.357987+00	2026-10-07 20:05:52.576516+00	48.58
915a64a8-d226-459f-bbbb-ca52fefbd3dc	fe14a8e5-4e88-4fe8-aac3-1573062735e4	SKU-BBF815ADA2	2048302804054	\N	\N	#000000	\N	\N	\N	7.00	10.00	0.00	11.00	5.00	{}	t	t	2026-10-06 13:45:57.797062+00	2026-10-07 20:05:52.576516+00	7.00
bca4c82c-295b-4fc3-9adc-6f2e2708ac88	872a6c4f-a23d-41ac-b003-c40f442cc559	SKU-8C117452B3	2011274246689	\N	\N	#000000	\N	\N	\N	3.00	7.00	0.00	14.00	4.00	{}	t	t	2026-10-08 19:13:50.21727+00	2026-10-08 19:14:44.408399+00	3.00
69ae184f-f5a2-4b8b-a4b3-ffe167670003	5512d3fe-cf9d-48e1-a925-f6e842615563	\N	\N	\N	\N	\N	\N	\N	\N	54.37	65.00	\N	1.00	5.00	{}	t	t	2026-10-07 21:01:27.978792+00	2026-10-07 21:01:27.978792+00	54.37
521b7ebb-6d06-484f-af20-7f1bcb676050	6a9b6ed6-949d-4ca3-9f19-a3ff1cabd063	SKU-72CDE3BE00	2075042631725	\N	\N	#000000	__product_measurements_v1__:[{"label":"الطول","value":""},{"label":"الصدر","value":""},{"label":"","value":""}]	\N	\N	0.00	0.00	0.00	0.00	5.00	{}	t	t	2026-10-06 18:04:57.006665+00	2026-10-06 18:04:57.006665+00	0.00
dcdae268-46b9-4b64-b95e-204bbfd522be	3d8170b6-a0d1-4e02-976f-cce5497ca06a	SKU-DA6C2917B2	2067186420495	\N	اسود بلمعة	#0b0c0c	XXL	\N	\N	50.00	90.00	0.00	2.00	5.00	{https://vaoxybnbrrbedeujeupa.supabase.co/storage/v1/object/public/store-assets/products/1790967462777-7t0jo3pl.webp}	t	t	2026-10-02 19:02:04.106264+00	2026-10-08 16:15:26.25196+00	51.29
33359c2b-c5d7-48e0-82c7-a531ba2fc769	859c97ed-4a25-4762-b904-ca016fd30442	SKU-EA0A419F2C	2045841867168	\N	\N	#000000	\N	\N	\N	35.00	55.00	0.00	14.00	5.00	{}	t	t	2026-09-21 18:07:15.33896+00	2026-10-08 16:48:03.816797+00	39.49
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_order_items (id, purchase_order_id, template_id, variant_id, quantity, received_quantity, unit_cost, allocated_delivery_cost, effective_unit_cost, subtotal, created_at, unit_cost_usd, effective_unit_cost_usd, subtotal_usd) FROM stdin;
cf6eccbb-a534-4a96-b03b-fd3a47fe6560	29d2c46f-9801-4b85-b8ae-0a442e4a6901	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	6.00	6.00	50.00	7.74	51.29	300.00	2026-10-02 19:03:27.530345+00	\N	\N	\N
b87dc315-faa2-4b23-9829-559a3a45e3c9	29d2c46f-9801-4b85-b8ae-0a442e4a6901	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	10.00	10.00	50.00	12.90	51.29	500.00	2026-10-02 19:03:27.530345+00	\N	\N	\N
de4714dc-6226-4438-a29e-f41cdae19271	29d2c46f-9801-4b85-b8ae-0a442e4a6901	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	15.00	15.00	45.00	19.35	46.29	675.00	2026-10-02 19:03:27.530345+00	\N	\N	\N
4733b543-94c9-434b-9178-6c7c8b9c549c	10331d15-5840-4085-930e-5576ad505d37	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10.00	10.00	100.00	100.00	110.00	1000.00	2026-09-19 21:32:55.866775+00	\N	\N	\N
426f3d28-1a70-4238-b8cb-51e29294a30c	9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	15.00	15.00	150.00	100.00	156.67	2250.00	2026-09-19 21:44:12.27025+00	\N	\N	\N
0f322d1d-2289-48dc-a7f2-33629349867d	82efce3e-585f-4bc2-889d-0204b28aba18	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10.00	10.00	120.00	70.00	127.00	1200.00	2026-09-19 21:52:42.492084+00	\N	\N	\N
e0dfdfc5-5344-422c-802a-888e4cf134dd	1ac925e1-5889-40ed-a676-c7d44f995cdd	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	6.00	6.00	120.00	0.00	120.00	720.00	2026-09-19 21:54:18.574841+00	\N	\N	\N
84794a3c-7e7a-4f7a-bdbb-a7b31064c3e2	1ac925e1-5889-40ed-a676-c7d44f995cdd	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10.00	10.00	100.00	0.00	100.00	1000.00	2026-09-19 21:54:18.574841+00	\N	\N	\N
7196ec52-52e2-498a-876c-3a165a70d5cd	5cda9713-8395-4c4d-976e-0abac15cceb5	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	10.00	10.00	120.00	0.00	120.00	1200.00	2026-09-19 22:00:08.149198+00	\N	\N	\N
9c65196e-4d38-426f-a06a-c2af4d22b9d9	728b3939-7cb1-4d63-b83f-f17ca0d00ef7	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	10.00	10.00	100.00	40.00	104.00	1000.00	2026-09-20 13:35:05.05789+00	\N	\N	\N
7eca402d-1e0a-4adc-9c8b-cf23930c205e	5531ec6a-553b-4fd0-a508-cdb2bc340825	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	15.00	15.00	110.00	80.00	115.33	1650.00	2026-09-20 20:00:52.994128+00	\N	\N	\N
05379e0c-0e43-4261-9aaf-520251b744b5	c58a3523-0263-4644-9c11-c3e3dbb1bcb7	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10.00	10.00	50.00	70.00	55.00	500.00	2026-09-20 20:15:23.932987+00	\N	\N	\N
bdca1970-c2e0-4f82-afaa-f94377049993	30dccc98-4ad4-4975-a628-8d5ce2808949	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	1.00	1.00	110.00	16.67	126.67	110.00	2026-09-21 14:10:08.232269+00	\N	\N	\N
a5c36aed-f2d4-4e8e-97d0-4d2ff20ec58c	30dccc98-4ad4-4975-a628-8d5ce2808949	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	1.00	1.00	100.00	16.67	116.67	100.00	2026-09-21 14:10:08.232269+00	\N	\N	\N
82df6bb6-d35f-4da6-a953-59e28acd8249	30dccc98-4ad4-4975-a628-8d5ce2808949	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	1.00	1.00	50.00	16.67	66.67	50.00	2026-09-21 14:10:08.232269+00	\N	\N	\N
ccebd597-b824-4e87-acea-aae626843780	11ce7ef4-4c0d-4374-b1d5-74640466cc7e	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	1.00	1.00	600.00	50.00	650.00	600.00	2026-09-21 18:02:42.74+00	\N	\N	\N
fe06b858-3130-4828-ae6b-b825359d597d	992d5384-dcf1-4eb2-a690-b24884d0385f	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	10.00	10.00	40.00	50.00	45.00	400.00	2026-09-21 18:11:58.227501+00	\N	\N	\N
5f2b5128-6a08-43a0-9244-117eb575700c	80f3de33-aa61-40ca-b453-ebc2911669ba	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	1.00	1.00	600.00	20.00	620.00	600.00	2026-09-21 18:20:32.61932+00	\N	\N	\N
6f8e1374-4e80-4fcf-8999-163fec0364e8	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	10.00	10.00	45.00	50.00	50.00	450.00	2026-09-21 18:29:47.556388+00	\N	\N	\N
30d36fca-3429-4955-903c-73b630b12d75	5f24a0a0-87d1-4a2e-908a-151f27becd65	332f8d1e-b025-455d-9b1f-8e3caab88295	90d344c2-29ef-43fb-b673-be3709878379	1.00	1.00	550.00	100.00	650.00	550.00	2026-09-21 19:57:24.052014+00	\N	\N	\N
90a674fa-84d8-483d-acd5-687f2d7037ec	38704339-879a-46e7-b77c-6acbf06ce345	8e11036a-62b5-4099-be9d-9b6bdb6850e8	e1818896-2a34-4287-9fc1-c93a1b0a725d	8.00	8.00	200.00	30.00	203.75	1600.00	2026-09-21 20:54:20.956612+00	\N	\N	\N
983f5dd8-260b-49b5-a5ff-4453bc0260f1	38704339-879a-46e7-b77c-6acbf06ce345	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	8.00	8.00	35.00	30.00	38.75	280.00	2026-09-21 20:54:20.956612+00	\N	\N	\N
d240508b-fc92-4e66-9506-2eface8f0804	b595b476-2619-4949-bcea-e43c5fd3b06c	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.00	2.00	400.00	45.00	16.90	800.00	2026-09-21 21:45:38.416428+00	\N	\N	\N
872e36cd-a845-4d16-aa42-ab5837a0fa54	f5dd6d93-5f89-4f60-b817-e52f51eb9f76	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.00	2.00	400.00	30.00	16.60	800.00	2026-09-21 22:01:46.869977+00	\N	\N	\N
24dc301a-9102-4645-adff-41d55131d977	92431a52-65ae-4a53-8d53-66cb208ffd5e	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	9.00	9.00	45.00	25.15	47.79	405.00	2026-09-22 13:54:53.211145+00	\N	\N	\N
bf8809f7-4dd7-474a-82c1-1c79f45387b7	92431a52-65ae-4a53-8d53-66cb208ffd5e	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	16.00	16.00	35.00	44.70	37.79	560.00	2026-09-22 13:54:53.211145+00	\N	\N	\N
7cca0c7f-eab0-404c-ba9c-b032d05cdaf2	5fb226d7-22f3-4015-81ea-e22396659b7b	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	1.00	1.00	55.13	20.00	75.13	55.13	2026-10-06 19:15:48.469759+00	\N	\N	\N
028fd224-b2ca-41a3-af5c-f9c77d759d8e	ce254f54-c400-4947-a3f4-dc8e9cc90d60	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.00	2.00	80.00	0.00	3.20	160.00	2026-10-08 16:51:45.109605+00	\N	\N	\N
\.


--
-- Data for Name: purchase_order_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_order_payments (id, purchase_order_id, amount, payment_date, payment_method, notes, created_by, created_at, reference, exchange_rate_id, exchange_rate_sdg_per_usd, amount_usd, amount_sdg) FROM stdin;
1d77a0ff-219e-461a-861b-b644f2502035	10331d15-5840-4085-930e-5576ad505d37	500.00	2026-09-19 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:32:57.891306+00	\N	\N	\N	\N	\N
35245e60-699f-40b1-904a-3c2872fae660	9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	2350.00	2026-09-19 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:44:14.394288+00	\N	\N	\N	\N	\N
d513ca38-40fa-4bbd-b696-286f80275937	82efce3e-585f-4bc2-889d-0204b28aba18	1270.00	2026-09-19 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:52:44.753777+00	\N	\N	\N	\N	\N
c22cae09-8a69-41f1-b5a6-1b5271b26927	1ac925e1-5889-40ed-a676-c7d44f995cdd	1720.00	2026-09-19 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 21:54:21.139755+00	\N	\N	\N	\N	\N
03329e91-b622-4201-83e1-df18dfe3aeb8	5cda9713-8395-4c4d-976e-0abac15cceb5	1200.00	2026-09-19 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-19 22:00:10.997814+00	\N	\N	\N	\N	\N
f1d375c3-2a8e-4ed3-83d8-9bea5af6f1bd	5531ec6a-553b-4fd0-a508-cdb2bc340825	700.00	2026-09-20 00:00:00+00	BANK	تم استلام الشحنة بالكامل مع دفع جزئي 40%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 20:00:56.017075+00	\N	\N	\N	\N	\N
dd5799e4-4411-4ec4-bb0c-a504a4bd8122	5531ec6a-553b-4fd0-a508-cdb2bc340825	1030.00	2026-09-21 00:00:00+00	CASH	اتمام الدفع 60%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-20 20:06:46.71325+00	\N	\N	\N	\N	\N
eb3bba3b-7c8a-436b-af89-fa1fc627130d	30dccc98-4ad4-4975-a628-8d5ce2808949	200.00	2026-09-21 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 14:10:12.528037+00	\N	\N	\N	\N	\N
435e4939-8503-43ac-a048-a54e4aa811c9	11ce7ef4-4c0d-4374-b1d5-74640466cc7e	650.00	2026-09-21 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:02:45.112974+00	\N	\N	\N	\N	\N
2b59e5e9-9aad-4279-8cfc-f99e766b1068	992d5384-dcf1-4eb2-a690-b24884d0385f	200.00	2026-09-21 00:00:00+00	BANK	استلام كامل ودفعة اولية 45%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:12:00.847045+00	\N	\N	\N	\N	\N
c8baa561-9dfc-41fb-b33a-8fef34c46c03	80f3de33-aa61-40ca-b453-ebc2911669ba	620.00	2026-09-21 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:20:35.470344+00	\N	\N	\N	\N	\N
e30a2478-e266-484c-bb56-ea2fc6ef04f6	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	300.00	2026-09-21 00:00:00+00	BANK	تم الاستلام بالكامل مع دفع 65%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:29:49.961223+00	\N	\N	\N	\N	\N
097883c7-d61f-4b3e-a6a1-15854165e503	779e9874-0beb-41b1-b1dd-90fb3b65a1c8	200.00	2026-09-21 00:00:00+00	CASH	دفعه ب35% واكتمال المستحقات	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 18:34:22.252893+00	\N	\N	\N	\N	\N
f2724c5f-d7a2-411e-9260-65bbf1bf9443	5f24a0a0-87d1-4a2e-908a-151f27becd65	650.00	2026-09-21 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 19:57:26.237645+00	\N	\N	\N	\N	\N
6fcab5ee-cc21-4f01-a8f6-d674dc8368e1	38704339-879a-46e7-b77c-6acbf06ce345	1540.00	2026-09-21 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 20:56:58.770138+00	\N	\N	\N	\N	\N
1ec58b41-b8af-4509-b789-c0aa99184630	b595b476-2619-4949-bcea-e43c5fd3b06c	845.00	2026-09-21 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 21:45:41.670468+00	\N	\N	\N	\N	\N
06c71bb4-c7aa-4cb5-8bcf-4bf57f2ffed3	f5dd6d93-5f89-4f60-b817-e52f51eb9f76	830.00	2026-09-21 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-21 22:01:49.713985+00	\N	\N	\N	\N	\N
325113e8-a5b1-4e09-99b4-fc6992890b39	92431a52-65ae-4a53-8d53-66cb208ffd5e	500.00	2026-09-22 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:54:57.470584+00	\N	\N	\N	\N	\N
d39902e9-4b4f-461e-b686-6f5ca1dc1f16	92431a52-65ae-4a53-8d53-66cb208ffd5e	530.00	2026-09-22 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-22 13:57:05.7653+00	\N	\N	\N	\N	\N
84a831a7-b32d-421b-ba43-d81177739bcc	29d2c46f-9801-4b85-b8ae-0a442e4a6901	1515.00	2026-10-02 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 19:03:32.219126+00	\N	\N	\N	\N	\N
909318c4-fb31-4410-8546-5229d4bcab1f	5fb226d7-22f3-4015-81ea-e22396659b7b	75.13	2026-10-06 00:00:00+00	BANK	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-06 19:15:52.382765+00	\N	\N	\N	\N	\N
a83efebe-826b-4417-a28b-4b34fdb8bc66	ce254f54-c400-4947-a3f4-dc8e9cc90d60	160.00	2026-10-08 00:00:00+00	CASH	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 16:51:53.146191+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (id, order_number, supplier_id, status, purchase_type, order_date, expected_date, subtotal, delivery_cost, discount_amount, total_amount, notes, created_by, received_by, journal_entry_id, created_at, updated_at, exchange_rate_id, exchange_rate_sdg_per_usd, subtotal_usd, delivery_cost_usd, discount_amount_usd, total_amount_usd, total_amount_sdg) FROM stdin;
5f24a0a0-87d1-4a2e-908a-151f27becd65	PO-20643269	3b1f5010-df2e-4556-a054-454e971f5ed9	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-10-08	550.00	100.00	0.00	650.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	1ccabe05-4ef1-4d84-90dd-111882cf47eb	2026-09-21 19:57:23.83103+00	2026-09-21 19:57:25.074+00	\N	\N	\N	\N	\N	\N	\N
5531ec6a-553b-4fd0-a508-cdb2bc340825	PO-34452606	\N	RECEIVED	DIRECT	2026-09-20 00:00:00+00	2026-09-20	1650.00	80.00	0.00	1730.00	تم استلام الشحنة بالكامل مع دفع جزئي 40%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	92eee0a6-84c0-4dde-adf8-e074d00f19dd	2026-09-20 20:00:52.846911+00	2026-09-20 20:00:54.776+00	\N	\N	\N	\N	\N	\N	\N
5fb226d7-22f3-4015-81ea-e22396659b7b	PO-14147263	\N	RECEIVED	DIRECT	2026-10-06 00:00:00+00	2026-10-22	55.13	20.00	0.00	75.13	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	18fd4de0-f01d-4ec4-8062-fa7b1a0a01cd	2026-10-06 19:15:48.31759+00	2026-10-06 19:15:49.342+00	\N	\N	\N	\N	\N	\N	\N
c58a3523-0263-4644-9c11-c3e3dbb1bcb7	PO-35117864	86149372-b75e-442a-8a2f-97683b1efb3a	RECEIVED	WORKFLOW	2026-09-20 00:00:00+00	2026-09-30	500.00	100.00	20.00	550.00	بيانات اولية عن المنتج	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	c90fb41a-c4a0-4bb7-8446-adfa9a46018d	2026-09-20 20:11:58.058208+00	2026-09-20 20:17:43.469+00	\N	\N	\N	\N	\N	\N	\N
10331d15-5840-4085-930e-5576ad505d37	PO-53573637	86149372-b75e-442a-8a2f-97683b1efb3a	RECEIVED	DIRECT	2026-09-19 00:00:00+00	2026-09-19	1000.00	100.00	0.00	1100.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ddb2583e-8e8b-46da-a37a-130759951335	2026-09-19 21:32:55.722156+00	2026-09-19 21:32:55.207+00	\N	\N	\N	\N	\N	\N	\N
38704339-879a-46e7-b77c-6acbf06ce345	PO-24060126	\N	RECEIVED	WORKFLOW	2026-09-21 00:00:00+00	2026-10-01	1880.00	60.00	0.00	1940.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	7216c818-ed0b-4613-9d62-4dfee31e309a	2026-09-21 20:54:20.788221+00	2026-09-21 20:56:57.925+00	\N	\N	\N	\N	\N	\N	\N
30dccc98-4ad4-4975-a628-8d5ce2808949	PO-99807711	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-24	260.00	50.00	0.00	310.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2fb0885d-f55c-4a29-8ad0-5ed7a89645d8	2026-09-21 14:10:08.065918+00	2026-09-21 14:10:11.287+00	\N	\N	\N	\N	\N	\N	\N
11ce7ef4-4c0d-4374-b1d5-74640466cc7e	PO-13762090	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-23	600.00	50.00	0.00	650.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	6594acb1-9f4b-4f45-bc6d-1818c0290129	2026-09-21 18:02:42.587628+00	2026-09-21 18:02:43.926+00	\N	\N	\N	\N	\N	\N	\N
992d5384-dcf1-4eb2-a690-b24884d0385f	PO-14317462	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-21	400.00	50.00	0.00	450.00	استلام كامل ودفعة اولية 45%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	79fd4baa-f988-4822-a4ea-c5b90b711961	2026-09-21 18:11:58.001263+00	2026-09-21 18:11:59.68+00	\N	\N	\N	\N	\N	\N	\N
9723c7bc-8de0-4a47-91a3-cc3a4dd3a851	PO-54250139	\N	RECEIVED	DIRECT	2026-09-19 00:00:00+00	2026-09-19	2250.00	100.00	0.00	2350.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	fefdccc9-7704-46d7-b0fa-2ae771720d2d	2026-09-19 21:44:12.126899+00	2026-09-19 21:44:11.71+00	\N	\N	\N	\N	\N	\N	\N
80f3de33-aa61-40ca-b453-ebc2911669ba	PO-14831301	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-22	600.00	20.00	0.00	620.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	da66ea04-2433-46c9-a17e-775e1ea364f5	2026-09-21 18:20:32.359844+00	2026-09-21 18:20:34.157+00	\N	\N	\N	\N	\N	\N	\N
b595b476-2619-4949-bcea-e43c5fd3b06c	PO-27137679	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-24	800.00	45.00	0.00	845.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f0ca0e91-a313-4dd0-8464-7b90b3523829	2026-09-21 21:45:38.210448+00	2026-09-21 21:45:39.678+00	\N	\N	\N	\N	\N	\N	\N
779e9874-0beb-41b1-b1dd-90fb3b65a1c8	PO-15386922	\N	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-09-25	450.00	50.00	0.00	500.00	تم الاستلام بالكامل مع دفع 65%	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ddad8c4d-49f4-44e9-9404-26def3691a58	2026-09-21 18:29:47.42499+00	2026-09-21 18:29:48.803+00	\N	\N	\N	\N	\N	\N	\N
82efce3e-585f-4bc2-889d-0204b28aba18	PO-54760243	\N	RECEIVED	DIRECT	2026-09-19 00:00:00+00	2026-09-19	1200.00	70.00	0.00	1270.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	495e913d-bb7c-43f6-91da-d7d426fd3b22	2026-09-19 21:52:42.349995+00	2026-09-19 21:52:42.058+00	\N	\N	\N	\N	\N	\N	\N
1ac925e1-5889-40ed-a676-c7d44f995cdd	PO-54856325	\N	RECEIVED	DIRECT	2026-09-19 00:00:00+00	\N	1720.00	0.00	0.00	1720.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	7d49a764-b944-4486-bdc9-5afd5c6df2f6	2026-09-19 21:54:18.440368+00	2026-09-19 21:54:18.463+00	\N	\N	\N	\N	\N	\N	\N
f5dd6d93-5f89-4f60-b817-e52f51eb9f76	PO-28106176	3b1f5010-df2e-4556-a054-454e971f5ed9	RECEIVED	DIRECT	2026-09-21 00:00:00+00	2026-10-01	800.00	30.00	0.00	830.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	1371e717-d25f-443d-a225-d4162538c88b	2026-09-21 22:01:46.726198+00	2026-09-21 22:01:47.956+00	\N	\N	\N	\N	\N	\N	\N
ce254f54-c400-4947-a3f4-dc8e9cc90d60	PO-78304634	\N	RECEIVED	DIRECT	2026-10-08 00:00:00+00	2026-10-08	160.00	0.00	0.00	160.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	6005b72b-c46d-47dd-ae2d-46f1ce1f9f0d	2026-10-08 16:51:44.948812+00	2026-10-08 16:51:51.222+00	\N	\N	\N	\N	\N	\N	\N
92431a52-65ae-4a53-8d53-66cb208ffd5e	PO-85291993	\N	RECEIVED	DIRECT	2026-09-22 00:00:00+00	2026-10-09	965.00	69.85	0.00	1034.85	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	9967c217-d34b-4444-9338-3dd642943c8d	2026-09-22 13:54:53.057875+00	2026-09-22 13:54:55.051+00	\N	\N	\N	\N	\N	\N	\N
5cda9713-8395-4c4d-976e-0abac15cceb5	PO-55207780	\N	RECEIVED	DIRECT	2026-09-19 00:00:00+00	2026-09-20	1200.00	0.00	0.00	1200.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	7b2069dd-26bf-4b4a-b7de-f28245017815	2026-09-19 22:00:07.999127+00	2026-09-19 22:00:09.469+00	\N	\N	\N	\N	\N	\N	\N
29d2c46f-9801-4b85-b8ae-0a442e4a6901	PO-67807132	\N	RECEIVED	DIRECT	2026-10-02 00:00:00+00	2026-10-02	1475.00	40.00	0.00	1515.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	5cffa151-2ddf-47de-902c-515ed1cf8598	2026-10-02 19:03:27.346501+00	2026-10-02 19:03:30.094+00	\N	\N	\N	\N	\N	\N	\N
728b3939-7cb1-4d63-b83f-f17ca0d00ef7	PO-11305140	\N	RECEIVED	DIRECT	2026-09-20 00:00:00+00	2026-09-20	1000.00	40.00	0.00	1040.00	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	f25f6d4b-9b0b-43cb-b619-54fc913449ab	6d219c55-4f45-466b-bd83-b5aa84ff557b	2026-09-20 13:35:04.91432+00	2026-09-20 13:35:06.881+00	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: sales_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_order_items (id, sales_order_id, template_id, variant_id, quantity, unit_price, unit_cost, total_price, created_at, is_gift, gift_note, unit_price_usd, total_price_usd, unit_price_sdg, total_price_sdg, revenue_usd, unit_cost_usd, total_cost_usd) FROM stdin;
0dc5c136-b9e0-45b8-a7b3-d7f7c6864728	bf466e39-01a5-4d6a-b43a-be4599b79932	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	6.00	120.00	118.18	720.00	2026-09-19 21:37:20.801847+00	f	\N	\N	\N	\N	\N	\N	\N	\N
67a419ba-d93a-4800-8ca5-a0fbcb9a90ce	d32de191-3239-4776-9248-cba7e9ea85ef	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	5.00	120.00	97.46	600.00	2026-09-21 13:24:33.956233+00	f	\N	\N	\N	\N	\N	\N	\N	\N
1ffa2e17-6661-4c27-9eea-c6e4a92630f3	d32de191-3239-4776-9248-cba7e9ea85ef	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	6.00	140.00	129.51	840.00	2026-09-21 13:24:33.956233+00	f	\N	\N	\N	\N	\N	\N	\N	\N
2c1a75af-e40e-4eaf-b592-214daa83366f	d32de191-3239-4776-9248-cba7e9ea85ef	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	5.00	120.00	115.33	600.00	2026-09-21 13:24:33.956233+00	f	\N	\N	\N	\N	\N	\N	\N	\N
0b1a2de1-5fb8-4a55-8c37-2e708ba191f7	7735a69e-9ec3-4a3f-bf95-843db37d11b7	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	15.00	140.00	129.51	2100.00	2026-09-21 13:26:08.268334+00	f	\N	\N	\N	\N	\N	\N	\N	\N
825b2c53-112f-4a8c-a6b3-8d5e169df206	7735a69e-9ec3-4a3f-bf95-843db37d11b7	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	10.00	120.00	97.46	1200.00	2026-09-21 13:26:08.268334+00	f	\N	\N	\N	\N	\N	\N	\N	\N
c5e46a24-bec0-4daf-b6c0-3ab7b1d93fc4	6a407f0b-e422-49a1-ae65-c0c18751e0f8	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	1.00	120.00	116.36	120.00	2026-09-22 12:57:31.578643+00	f	\N	\N	\N	\N	\N	\N	\N	\N
4c209798-6c44-4bc6-82d9-15ae4929f4f0	6a407f0b-e422-49a1-ae65-c0c18751e0f8	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	8.00	55.00	42.22	440.00	2026-09-22 12:57:31.578643+00	f	\N	\N	\N	\N	\N	\N	\N	\N
0f19edcc-f0bf-461a-80d8-6a86a2419bda	6a407f0b-e422-49a1-ae65-c0c18751e0f8	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	17.00	15.00	16.75	255.00	2026-09-22 12:57:31.578643+00	f	\N	\N	\N	\N	\N	\N	\N	\N
04c971e2-8b60-4e35-b71b-e4a6de741a3b	9b42c995-89ab-4f6c-8023-49439102304c	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	5.00	55.00	50.00	275.00	2026-09-22 12:59:27.599953+00	f	\N	\N	\N	\N	\N	\N	\N	\N
d77eeca8-217b-453b-b300-c44a1174ea26	9b42c995-89ab-4f6c-8023-49439102304c	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	5.00	120.00	116.36	600.00	2026-09-22 12:59:27.599953+00	f	\N	\N	\N	\N	\N	\N	\N	\N
41304de3-529d-4923-9729-9e57f2070cdd	9b42c995-89ab-4f6c-8023-49439102304c	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	11.00	140.00	128.90	1540.00	2026-09-22 12:59:27.599953+00	f	\N	\N	\N	\N	\N	\N	\N	\N
c7bbf3a1-1318-47c5-bdfb-c83f808d42e7	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	6.00	55.00	39.49	330.00	2026-09-23 11:33:20.414415+00	f	\N	\N	\N	\N	\N	\N	\N	\N
d3d850d2-3b9a-46d5-ac59-05317a3fe655	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	1.00	120.00	95.99	120.00	2026-09-23 11:33:20.414415+00	f	\N	\N	\N	\N	\N	\N	\N	\N
1c9e86e0-8e8e-4a49-b0d6-50c77a49c992	7cf2cb23-ce5c-4958-97b0-067c92e64d1f	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	5.00	120.00	95.99	600.00	2026-09-23 11:35:11.987159+00	f	\N	\N	\N	\N	\N	\N	\N	\N
ac7bb4d2-8321-4e26-9639-5c4ce4e9a743	4364a355-8a9a-49d4-ab14-b03828966fcf	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	1.00	15.00	16.75	15.00	2026-09-23 11:41:55.512244+00	f	\N	\N	\N	\N	\N	\N	\N	\N
d2e21b0f-748d-46c2-a20f-4aea9cbb5a34	c712117f-2745-468c-b22a-8e6c4c6957f6	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	1.00	70.00	55.13	70.00	2026-10-02 15:03:46.997059+00	f	\N	\N	\N	\N	\N	\N	\N	\N
879d333b-f474-4d2a-962f-3663ee57f9cb	ccd941fd-89d4-42ae-9026-71746b54c591	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.07	15.00	16.75	46.05	2026-10-02 18:51:44.978169+00	f	\N	\N	\N	\N	\N	\N	\N	\N
00cfdde0-7e31-4d61-9474-1d7cb928a7cd	41b93550-8214-475c-af11-168e61131fc3	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	3.00	90.00	46.29	270.00	2026-10-02 19:04:42.372754+00	f	\N	\N	\N	\N	\N	\N	\N	\N
58a9d8da-de38-4a16-a346-94e351b540b2	41b93550-8214-475c-af11-168e61131fc3	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	3.00	90.00	51.29	270.00	2026-10-02 19:04:42.372754+00	f	\N	\N	\N	\N	\N	\N	\N	\N
8d60069c-b568-4135-bed6-c890705279a3	f7be6afe-9e7e-4323-8c0a-15f107f034dc	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	2.00	90.00	46.29	180.00	2026-10-03 17:05:54.626068+00	f	\N	\N	\N	\N	\N	\N	\N	\N
59df2039-1ffc-4e61-aeeb-11cd5d2b8052	f7be6afe-9e7e-4323-8c0a-15f107f034dc	b574a61a-7bad-4818-87b7-d39ead948134	6e970b46-3a7a-4fc4-b27f-b49c3d32c51d	1.00	0.00	116.36	0.00	2026-10-03 17:05:54.626068+00	t	\N	\N	\N	\N	\N	\N	\N	\N
ffc812d7-a6c4-4671-8b5c-2bd98ab287d2	8c6542d2-da07-4852-8ab6-e2ecf3ac0337	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	1.00	478500.00	39.49	478500.00	2026-10-05 16:17:20.946215+00	f	\N	55.00	55.00	478500.00	478500.00	55.00	39.490000	39.49
a1a48d63-7051-4bf0-82bf-82ed3ff4a2fd	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	ba277ad0-2925-4eb6-9114-158880d6178d	9f7a16a8-4f3a-48e6-9935-c275f857beba	2.00	1218000.00	128.90	2436000.00	2026-10-05 16:18:14.819252+00	f	\N	140.00	280.00	1218000.00	2436000.00	280.00	128.900000	257.80
bf6d9651-d461-40a0-8489-f90b8e6f8b1a	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	1.00	1044000.00	95.99	1044000.00	2026-10-05 16:18:14.819252+00	f	\N	120.00	120.00	1044000.00	1044000.00	120.00	95.990000	95.99
5177cc65-3651-47fd-a320-723d0ef23f02	eac12289-7a38-4c51-bfc0-1eac5d6f2533	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	1.00	130500.00	16.75	130500.00	2026-10-05 18:43:49.777219+00	f	\N	15.00	15.00	130500.00	130500.00	15.00	16.750000	16.75
113fc358-7abe-49dd-bbad-af456607e7cc	2aadb231-35cf-4fe0-b02f-99a062736230	3d8170b6-a0d1-4e02-976f-cce5497ca06a	1ef01eeb-6a90-4407-b356-dea9015b973a	3.00	783000.00	46.29	2349000.00	2026-10-05 18:45:12.868772+00	f	\N	90.00	270.00	783000.00	2349000.00	270.00	46.290000	138.87
08f573d4-d18e-4fe7-8511-4239eefc03f0	2aadb231-35cf-4fe0-b02f-99a062736230	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	3.00	783000.00	51.29	2349000.00	2026-10-05 18:45:12.868772+00	f	\N	90.00	270.00	783000.00	2349000.00	270.00	51.290000	153.87
ea2d3892-7491-4265-ad11-c88c0023c098	24155e69-8f6b-4977-8f50-757efce7d852	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	7.70	130500.00	16.75	1004850.00	2026-10-06 09:43:10.028458+00	f	\N	15.00	115.50	130500.00	1004850.00	115.50	16.750000	128.98
2a1bd53f-4ef5-4ecc-b0d2-9059f630af97	24155e69-8f6b-4977-8f50-757efce7d852	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	2.00	0.00	39.49	0.00	2026-10-06 09:43:10.028458+00	t	العميل فاتورته تجاوزت 200000	0.00	0.00	0.00	0.00	0.00	39.490000	78.98
a1856a2d-8614-47f7-809a-acaf99ffd70b	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	1.00	130500.00	16.75	130500.00	2026-10-07 12:29:28.100799+00	f	\N	15.00	15.00	130500.00	130500.00	15.00	16.750000	16.75
4f976c80-a8dc-4335-b390-fab48ae52c7e	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	94340b6c-fe97-4067-bfd5-f2569f079362	f9fff384-cb87-477c-bbc2-41a730fe88fd	1.00	1044000.00	95.99	1044000.00	2026-10-07 12:29:28.100799+00	f	\N	120.00	120.00	1044000.00	1044000.00	120.00	95.990000	95.99
7a581508-79ca-4872-81bc-de1b9f9c8fa9	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	2.00	0.00	51.29	0.00	2026-10-07 12:31:03.588689+00	t	\N	0.00	0.00	0.00	0.00	0.00	51.290000	102.58
ac61777b-6996-4470-b308-84445f5fe1d5	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	1.00	609000.00	75.13	609000.00	2026-10-07 12:31:03.588689+00	f	\N	70.00	70.00	609000.00	609000.00	70.00	75.130000	75.13
ea7e39dd-8d7c-4d81-b2b5-aab962d2ecae	90313135-dbd4-4f15-97c0-8f31ba2595d3	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	1.00	0.00	39.49	0.00	2026-10-07 20:05:52.576516+00	t	العميل اشثرى باكثر من 250000	0.00	0.00	0.00	0.00	0.00	39.490000	39.49
66280e73-55f7-4c13-9a78-6b0e6b806626	90313135-dbd4-4f15-97c0-8f31ba2595d3	58c6c83d-ce1d-46ba-abe4-cc1ddc92168f	78b086ad-974d-48d0-a1f3-6206a176c8b0	1.00	467500.00	48.58	467500.00	2026-10-07 20:05:52.576516+00	f	\N	55.00	55.00	467500.00	467500.00	55.00	48.580000	48.58
5a7018f4-d590-4859-aacf-1da54e3c7291	90313135-dbd4-4f15-97c0-8f31ba2595d3	fe14a8e5-4e88-4fe8-aac3-1573062735e4	915a64a8-d226-459f-bbbb-ca52fefbd3dc	1.00	85000.00	7.00	85000.00	2026-10-07 20:05:52.576516+00	f	\N	10.00	10.00	85000.00	85000.00	10.00	7.000000	7.00
5ca269b3-c09c-4bb4-9651-69ed1e9952aa	067e3336-485d-4400-a3a7-34995323dd68	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	1.00	135000.00	16.75	135000.00	2026-10-08 16:15:26.25196+00	f	\N	15.00	15.00	135000.00	135000.00	15.00	16.750000	16.75
6b3cdf8c-072c-40c0-bc14-8c3a908ad6d8	067e3336-485d-4400-a3a7-34995323dd68	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	1.00	0.00	39.49	0.00	2026-10-08 16:15:26.25196+00	t	شراء باكثر من 200000	0.00	0.00	0.00	0.00	0.00	39.490000	39.49
4375b063-7763-45a1-b8a7-357f20c27b6a	067e3336-485d-4400-a3a7-34995323dd68	1b8475e5-a387-45d0-992e-eb5e4ed076e7	8a58c754-f822-4278-b688-b05c9ae03db5	2.00	270000.00	18.00	540000.00	2026-10-08 16:15:26.25196+00	f	\N	30.00	60.00	270000.00	540000.00	60.00	18.000000	36.00
aac3f38f-8ec5-4c98-9d62-36171c076bd8	067e3336-485d-4400-a3a7-34995323dd68	3d8170b6-a0d1-4e02-976f-cce5497ca06a	dcdae268-46b9-4b64-b95e-204bbfd522be	1.00	810000.00	51.29	810000.00	2026-10-08 16:15:26.25196+00	f	\N	90.00	90.00	810000.00	810000.00	90.00	51.290000	51.29
6a890185-407d-4e32-9fb5-4527c8287f6c	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	859c97ed-4a25-4762-b904-ca016fd30442	33359c2b-c5d7-48e0-82c7-a531ba2fc769	1.00	0.00	39.49	0.00	2026-10-08 16:48:03.816797+00	t	اشتري باكثر من 150000	0.00	0.00	0.00	0.00	0.00	39.490000	39.49
80bc9667-f17f-43f5-b5da-2dbed85a977a	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	1b8475e5-a387-45d0-992e-eb5e4ed076e7	8a58c754-f822-4278-b688-b05c9ae03db5	2.00	270000.00	18.00	540000.00	2026-10-08 16:48:03.816797+00	f	\N	30.00	60.00	270000.00	540000.00	60.00	18.000000	36.00
9ad8361b-fee0-4897-a1ff-72299d8d800f	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	3d8170b6-a0d1-4e02-976f-cce5497ca06a	9733a683-15ef-4a31-a958-461bed369d65	1.00	810000.00	51.29	810000.00	2026-10-08 16:48:03.816797+00	f	\N	90.00	90.00	810000.00	810000.00	90.00	51.290000	51.29
5ffcef2d-3078-494b-82b4-13724e127d43	596812e5-b325-41d5-8999-b40ce5ccb633	ad451294-47bd-4f5b-8bc0-0bb06b49faec	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.70	135000.00	3.39	499500.00	2026-10-08 16:52:40.933653+00	f	\N	15.00	55.50	135000.00	499500.00	55.50	3.390000	12.54
\.


--
-- Data for Name: sales_order_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_order_payments (id, sales_order_id, amount, payment_date, payment_method, reference, notes, created_by, journal_entry_id, created_at, exchange_rate_id, exchange_rate_sdg_per_usd, amount_sdg, amount_usd) FROM stdin;
a3173a95-2a5d-4017-95d7-f356d9331b5f	bf466e39-01a5-4d6a-b43a-be4599b79932	720.00	2026-09-19 21:37:20.801847+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	\N	2026-09-19 21:37:20.801847+00	\N	\N	\N	\N
10e7d173-22f7-4b20-bc7d-4e03843a28f1	d32de191-3239-4776-9248-cba7e9ea85ef	2040.00	2026-09-21 13:24:33.956233+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	\N	2026-09-21 13:24:33.956233+00	\N	\N	\N	\N
4fcdf1e9-e917-4331-8ac6-393637c7c53d	7735a69e-9ec3-4a3f-bf95-843db37d11b7	3300.00	2026-09-21 13:26:08.268334+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	\N	2026-09-21 13:26:08.268334+00	\N	\N	\N	\N
396a7c57-b906-44a0-8d59-8b42a63cb460	6a407f0b-e422-49a1-ae65-c0c18751e0f8	815.00	2026-09-22 12:57:31.578643+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	\N	2026-09-22 12:57:31.578643+00	\N	\N	\N	\N
8c94606b-fbbe-4cb7-9712-03788ed4d2b5	9b42c995-89ab-4f6c-8023-49439102304c	2415.00	2026-09-22 12:59:27.599953+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	\N	2026-09-22 12:59:27.599953+00	\N	\N	\N	\N
a1e568f0-e01d-4565-9d4c-da9a166faaff	cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	430.00	2026-09-23 11:33:20.414415+00	CARD	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	9130bf2a-2238-4737-b1a1-9d54b64a9e9d	2026-09-23 11:33:20.414415+00	\N	\N	\N	\N
3950a654-1a69-4c49-a105-0f53259947d1	7cf2cb23-ce5c-4958-97b0-067c92e64d1f	600.00	2026-09-23 11:35:11.987159+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	225f0320-71c6-451b-bc0d-c349301de3b2	2026-09-23 11:35:11.987159+00	\N	\N	\N	\N
ee8315f1-1f06-4438-859e-51c5e969484b	4364a355-8a9a-49d4-ab14-b03828966fcf	15.00	2026-09-23 11:41:55.512244+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	cbc69ea9-9af2-4b53-a1a4-b1674fa40e72	2026-09-23 11:41:55.512244+00	\N	\N	\N	\N
6438ecd0-e07e-4356-8588-2b577421a2a3	ed8fdb00-392f-40e6-b5e2-869fde5971e8	275.00	2026-09-24 11:55:43.2422+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	233113e3-c725-4311-8d8f-4786bf4f173a	2026-09-24 11:55:43.2422+00	\N	\N	\N	\N
f4caeb51-a80d-49b3-89da-85876a08dc13	32e76cfa-5829-449a-9042-3cca2339e394	150.00	2026-09-25 11:38:42.727451+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ac310993-a836-4525-9586-e0604cf8ee4b	2026-09-25 11:38:42.727451+00	\N	\N	\N	\N
391cc24d-30d8-467c-973b-2c81c20604be	77cc81a1-2bbf-4abb-983a-76dace9ecb78	150.00	2026-09-25 19:33:38.401782+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	58eaa13e-d7dd-47c9-8031-d830b9e628b1	2026-09-25 19:33:38.401782+00	\N	\N	\N	\N
f59c75c9-d64e-4eb8-be4c-9d82434474c2	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	150.00	2026-09-25 19:47:38.082203+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	a0598714-801a-443f-9b13-b9a06194cbeb	2026-09-25 19:47:38.082203+00	\N	\N	\N	\N
e0169013-3493-4ed5-a629-251946b3f1ea	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	150.00	2026-09-25 19:49:59.095511+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	5e603bfc-c6a2-48f5-833c-3b15ecd13f2a	2026-09-25 19:49:59.095511+00	\N	\N	\N	\N
f007ab43-1858-4caf-8339-cf607a1218ba	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	200.00	2026-09-28 21:38:47.622131+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	06c6cd7c-9576-4bc5-bab6-b599b536b9ff	2026-09-28 21:38:47.622131+00	\N	\N	\N	\N
47c579c2-3326-45ac-91d1-cccc3a3eec2a	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	200.00	2026-09-28 21:40:21.688329+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	235f66af-2eb5-46fa-96c7-be1ab52ec0a9	2026-09-28 21:40:21.688329+00	\N	\N	\N	\N
9feeac2a-84c7-4fec-8251-4e359c653044	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	50.00	2026-09-29 14:27:05.462559+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2e5179b3-aba4-4a0d-82f6-99591132ec59	2026-09-29 14:27:05.462559+00	\N	\N	\N	\N
c0e9f971-f2a5-4081-a3ba-f40dde8c093d	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	50.00	2026-09-29 17:11:40.014191+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	d14a986e-0b34-48c2-a69e-450336c94353	2026-09-29 17:11:40.014191+00	\N	\N	\N	\N
c0ab8023-70e0-4558-8d3c-ecd58d664141	4000a711-48a2-45f0-a38b-7d9388694566	225.00	2026-09-30 08:58:44.344231+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	bdeeea1b-bb9e-4221-afe2-003166568125	2026-09-30 08:58:44.344231+00	\N	\N	\N	\N
dd361c79-8381-4e89-8038-49bb6936296a	4000a711-48a2-45f0-a38b-7d9388694566	225.00	2026-09-30 09:05:57.868207+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	46ca7005-6e83-4061-83da-7802e58830e4	2026-09-30 09:05:57.868207+00	\N	\N	\N	\N
59228b0a-a4e2-43b7-b85d-03c6d15f92bd	10d1d2c8-4bb1-4c16-aada-d4c26e65ec58	175.00	2026-10-01 13:26:23.046667+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	352d6a62-b298-4727-90a0-1ad588e58921	2026-10-01 13:26:23.046667+00	\N	\N	\N	\N
01adc731-819b-4109-85ec-3fec8bf4a96c	b9556919-7013-474b-8e2a-a98c4c07dbac	200.00	2026-10-01 16:56:32.145813+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	01963004-5f01-4bfe-bc02-698cc395067e	2026-10-01 16:56:32.145813+00	\N	\N	\N	\N
bc7c7783-feff-4bff-8f4b-24259f959abe	cd4a56e5-e67f-4f97-904b-74f6c263940d	225.00	2026-10-01 17:16:21.636176+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	31b94fcb-1086-4822-aa76-75100556883d	2026-10-01 17:16:21.636176+00	\N	\N	\N	\N
5b550b47-3334-48ea-b70d-0e3f8801b5db	cd4a56e5-e67f-4f97-904b-74f6c263940d	225.00	2026-10-01 17:28:33.930318+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	a538cdf9-dff4-42ba-a4d8-1de75480110c	2026-10-01 17:28:33.930318+00	\N	\N	\N	\N
7cf828dd-f1a3-4f9d-80f4-e415ac9d70c5	c712117f-2745-468c-b22a-8e6c4c6957f6	70.00	2026-10-02 15:03:46.997059+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2c7a32d9-edec-4c18-bedf-37077b749bac	2026-10-02 15:03:46.997059+00	\N	\N	\N	\N
59f0aa8b-0f9d-4e4f-b05a-64be11e6638a	95ad07a7-e8d7-47fd-852e-96f52c582149	225.00	2026-10-02 15:05:28.24931+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	8bf0c0c7-ee7c-46b4-93a6-6a0707355b76	2026-10-02 15:05:28.24931+00	\N	\N	\N	\N
aa68b11a-57a6-4120-87d4-c79dfa694030	ccd941fd-89d4-42ae-9026-71746b54c591	46.05	2026-10-02 18:51:44.978169+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	0d864d82-0a2b-43ac-9dbf-20111a6141b0	2026-10-02 18:51:44.978169+00	\N	\N	\N	\N
095a6385-41f9-460a-924f-62eb5a87806a	41b93550-8214-475c-af11-168e61131fc3	540.00	2026-10-02 19:04:42.372754+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	562b92fb-ee02-4b8a-aa25-4e11504c5a13	2026-10-02 19:04:42.372754+00	\N	\N	\N	\N
e9949708-a0cc-4cb5-bfc1-3269647d2d82	f7be6afe-9e7e-4323-8c0a-15f107f034dc	180.00	2026-10-03 17:05:54.626068+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	4f510920-9247-4e71-8081-00b1a9184749	2026-10-03 17:05:54.626068+00	\N	\N	\N	\N
1aa6241b-5b73-44db-a618-0e610a0005d4	258e66b7-d413-4945-8044-95782324f6c1	75.00	2026-10-03 19:46:43.902206+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	71bb4c48-8bec-4d27-b77f-0aab8e17535a	2026-10-03 19:46:43.902206+00	\N	\N	\N	\N
996068b1-1d92-40d1-9ff7-b6c621d654bf	70817a11-a4f4-4997-96e7-83478c1bdbcf	250.00	2026-10-03 19:48:40.627024+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	c0221155-1651-499f-ae93-7518a2e95f22	2026-10-03 19:48:40.627024+00	\N	\N	\N	\N
1a533974-6d35-48ea-9c96-3e88451b941a	ed8fdb00-392f-40e6-b5e2-869fde5971e8	275.00	2026-10-06 10:25:39.607968+00	BANK_TRANSFER	\N	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	2e0e5037-5432-4b99-a466-dfbac5312ae8	2026-10-06 10:25:39.607968+00	\N	\N	\N	\N
b23642c0-2974-43f7-b0ff-c44825ecdc37	8c6542d2-da07-4852-8ab6-e2ecf3ac0337	478500.00	2026-10-05 16:17:20.946215+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	a964bca0-6335-47e2-95c3-cbc94db603ce	2026-10-05 16:17:20.946215+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	478500.00	55.00
b22c1282-f5a5-4762-83f3-b764cb04f6b7	4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	3480000.00	2026-10-05 16:18:14.819252+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	78ae3611-b868-48b0-936c-0b04a9ea8df9	2026-10-05 16:18:14.819252+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	3480000.00	400.00
a805b8c3-e440-40de-9a94-513c18d7593c	eac12289-7a38-4c51-bfc0-1eac5d6f2533	130500.00	2026-10-05 18:43:49.777219+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	ed0fa2aa-f109-4edd-913f-15aa6e558a8d	2026-10-05 18:43:49.777219+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	130500.00	15.00
59c30c07-2f91-4e13-8c72-507e17bf5ee2	2aadb231-35cf-4fe0-b02f-99a062736230	4698000.00	2026-10-05 18:45:12.868772+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	5d8c8020-374a-4195-af85-7584ac2ce7ac	2026-10-05 18:45:12.868772+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	4698000.00	540.00
387de642-c82c-4f4a-91d4-d92c34924f46	24155e69-8f6b-4977-8f50-757efce7d852	1004850.00	2026-10-06 09:43:10.028458+00	BANK_TRANSFER	\N	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	f5d65d2f-175f-4bf1-b70a-9d0a8259519f	2026-10-06 09:43:10.028458+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1004850.00	115.50
03eec119-d386-47db-8f28-514eccfa2a84	de50fbc6-4721-4c5e-bab9-347f1c5b03e5	1174500.00	2026-10-07 12:29:28.100799+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	6934abc5-5e8a-469e-980d-65160ae1c101	2026-10-07 12:29:28.100799+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1174500.00	135.00
43c21db0-6b32-4d7c-ad2f-6445298ebda7	9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	609000.00	2026-10-07 12:31:03.588689+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	48ec6994-82d1-4570-97b7-b11e6c1a12b9	2026-10-07 12:31:03.588689+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	609000.00	70.00
0eb45567-d578-45da-aec6-701c48947f63	f56387bf-67fd-4bb2-836e-854136916311	150000.00	2026-10-07 12:52:53.141268+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	7476b9bf-fab6-4cea-8ab5-966905f73201	2026-10-07 12:52:53.141268+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	150000.00	17.24
28064ce4-c361-4aa9-bafc-87fad680a440	56f2aba1-04df-441a-84f9-d2b5200fc323	1000000.00	2026-10-07 13:00:11.585095+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	96080c1e-4f1a-477a-854b-e772d2a2cdef	2026-10-07 13:00:11.585095+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1000000.00	114.94
0d23cbb7-423a-405e-8e55-55b68c8249d2	56f2aba1-04df-441a-84f9-d2b5200fc323	1000000.00	2026-10-07 14:31:32.120478+00	CASH	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	d8071dae-e722-4eca-b8b3-6c5e796f412c	2026-10-07 14:31:32.120478+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1000000.00	114.94
00432f04-36b4-4620-a5bb-66aab36765e7	5566880c-fb25-4263-9c6c-b25b2b3e7133	600000.00	2026-10-07 14:40:03.450015+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	99b6bf1f-f212-49e4-a1ca-45b247121ff7	2026-10-07 14:40:03.450015+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	600000.00	68.97
1e26da10-0700-4db6-95a1-686d4b3b6764	d78e6f94-2b33-4c3b-9702-0af30831eb1a	600000.00	2026-10-07 14:45:22.07637+00	CASH	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	3d7bee09-1f5e-4c88-aed9-2f66086302d5	2026-10-07 14:45:22.07637+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	600000.00	68.97
a66a38a4-835b-494f-9e15-c34f04c5a50e	90313135-dbd4-4f15-97c0-8f31ba2595d3	532500.00	2026-10-07 20:05:52.576516+00	CASH	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	ed63a1ee-1af1-4951-9323-f927ac87563d	2026-10-07 20:05:52.576516+00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	532500.00	62.65
652f1e12-51fa-4759-8989-f5fecff7e561	db05a618-fcc7-407e-91bf-dc8d54248a4a	125000.00	2026-10-07 20:38:58.394635+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	c910ef61-d528-4923-b728-e6d26ba31eb8	2026-10-07 20:38:58.394635+00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	125000.00	14.71
8dd33b14-3b62-4842-ab6d-383bef8c11e3	5566880c-fb25-4263-9c6c-b25b2b3e7133	600000.00	2026-10-07 20:51:41.511133+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	3224f463-6414-4d1a-89e9-9a1ed01b86da	2026-10-07 20:51:41.511133+00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	600000.00	68.97
0c1daed0-d4f9-45e5-a193-d99c76643a81	19473229-cc56-43a7-880a-6c4ef2d53d5f	250000.00	2026-10-08 14:08:20.530981+00	CASH	\N	\N	48143da1-d832-40d6-99a0-2262bd58f2a4	717abc33-cce2-4531-a4b8-f289503fc028	2026-10-08 14:08:20.530981+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	250000.00	27.78
24e92574-c3c9-4835-9548-97e27adf8f01	067e3336-485d-4400-a3a7-34995323dd68	1475000.00	2026-10-08 16:15:26.25196+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	7961f577-ff64-4146-be9d-a047ad29f879	2026-10-08 16:15:26.25196+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	1475000.00	163.89
2ffcdb89-90cc-4236-a3aa-644509668189	cff2349a-8c70-44e0-8cd5-e5679a7d05d8	1325000.00	2026-10-08 16:48:03.816797+00	CASH	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	509b1550-2492-4a2b-a7c8-6be4e6c12ad9	2026-10-08 16:48:03.816797+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	1325000.00	147.22
38443058-6475-482c-85ac-7801e4eaac78	596812e5-b325-41d5-8999-b40ce5ccb633	499500.00	2026-10-08 16:52:40.933653+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	44a5a178-d3dd-4c18-a3b5-7473f239d399	2026-10-08 16:52:40.933653+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	499500.00	55.50
ebfd9fe1-04b2-4ef7-9047-46cbe73f7421	e6d6005b-6315-453b-9344-122572ffa2e7	175000.00	2026-10-08 17:57:26.91471+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	8204feda-15e7-4f38-9f09-66bb88477e9a	2026-10-08 17:57:26.91471+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	175000.00	19.44
b46c6b4e-c22c-48fc-afca-125cd391cdb8	19473229-cc56-43a7-880a-6c4ef2d53d5f	250000.00	2026-10-08 18:04:25.716414+00	BANK_TRANSFER	\N	\N	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	40b434cf-4b09-452e-8105-02eb91ba9d3d	2026-10-08 18:04:25.716414+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	250000.00	27.78
2f039eb2-b7fa-4aa3-b803-8d54395fc343	ad718a01-60ee-490f-987c-ba8dba3d9d20	200000.00	2026-10-08 18:14:20.347043+00	BANK_TRANSFER	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	4bba9a18-a56e-438f-8baa-45ece867fb6e	2026-10-08 18:14:20.347043+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	200000.00	22.22
b72de743-8f74-4d62-9c18-c67ac1e3e8ad	c50a83ab-1c5f-4bf4-8fac-2af23adc7448	200000.00	2026-10-08 18:24:48.874492+00	CASH	\N	\N	f25f6d4b-9b0b-43cb-b619-54fc913449ab	39269dcd-5102-4d63-9361-f3eaca5fcd9a	2026-10-08 18:24:48.874492+00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	200000.00	22.22
\.


--
-- Data for Name: sales_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_orders (id, order_number, branch_id, cashier_id, subtotal, discount_amount, tax_amount, total_amount, payment_method, payment_status, status, notes, created_at, order_type, customer_id, tailor_id, sales_journal_entry_id, cogs_journal_entry_id, completed_at, updated_at, tailoring_status, intake_date, expected_delivery_date, measurements, fabric_variant_id, fabric_quantity, tailoring_cost, tailoring_cogs_journal_entry_id, tailoring_purpose, tailoring_fabric_cost, produced_product_template_id, produced_product_variant_id, produced_quantity, production_total_cost, production_material_journal_entry_id, production_labor_journal_entry_id, production_inventory_journal_entry_id, tailoring_material_journal_entry_id, tailoring_labor_journal_entry_id, customer_advance_journal_entry_id, customer_advance_recognition_journal_entry_id, tailoring_item_name, tailoring_item_description, cancellation_reason, converted_to_product_at, subtotal_usd, total_amount_usd, exchange_rate_used, tailoring_cost_sdg, exchange_rate_id, exchange_rate_sdg_per_usd, subtotal_sdg, discount_amount_sdg, tax_amount_sdg, total_amount_sdg, discount_amount_usd, tax_amount_usd) FROM stdin;
e6d6005b-6315-453b-9344-122572ffa2e7	TLR-2026-000024	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	350000.00	0.00	0.00	350000.00	BANK_TRANSFER	PARTIAL	CANCELLED	\N	2026-10-08 17:57:26.91471+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-08 18:22:19.006868+00	CANCELLED	2026-10-08	2026-10-16	[{"unit": "M", "label": "الطول", "value": 2.5}, {"unit": "M", "label": "العرض", "value": 1.5}, {"unit": "CM", "label": "الاكمام", "value": 65}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	5.00	5.56	\N	CUSTOMER	16.95	af22a815-e7de-4720-ada3-eb1ee2866a43	66665726-b6a5-4dd8-a640-6de10b14b770	1.00	22.51	\N	80bf999c-2f1e-4031-a5ea-2456785c2227	d95effc8-1b95-4171-aeb9-be65830d0312	ed0c6cdb-901f-4590-9c53-fabd64970e62	80bf999c-2f1e-4031-a5ea-2456785c2227	8204feda-15e7-4f38-9f09-66bb88477e9a	\N	على الله	على الله باكمام مسلوبة وازرار في الجيوب وقيطان	تم تحويل الطلب إلى منتج للمخزون بعد رفض العميل	2026-10-08 18:22:19.006868+00	38.89	38.89	9000.0000	50000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	350000.00	0.00	0.00	350000.00	0.00	0.00
cff2349a-8c70-44e0-8cd5-e5679a7d05d8	INV-2026-000022	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	1350000.00	25000.00	0.00	1325000.00	CASH	PAID	COMPLETED	\N	2026-10-08 16:48:03.816797+00	POS	\N	\N	509b1550-2492-4a2b-a7c8-6be4e6c12ad9	5fed862d-246f-448d-98db-99d146bc542a	2026-10-08 16:48:03.816797+00	2026-10-08 16:48:03.816797+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	150.00	147.22	9000.0000	\N	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	1350000.00	25000.00	0.00	1325000.00	2.78	0.00
79aa7a70-cacf-48b5-942e-df55e8c43697	TLR-2026-000012	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	0.00	0.00	0.00	0.00	CASH	UNPAID	COMPLETED	\N	2026-10-02 14:58:27.29847+00	TAILORING	\N	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	2026-10-02 15:01:11.419312+00	2026-10-02 15:01:11.419312+00	RECEIVED	2026-10-02	2026-10-09	[{"unit": "CM", "label": "الطول", "value": 65}, {"unit": "CM", "label": "العرض", "value": 50}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	1.50	30.00	\N	PRODUCTION	25.13	0d8be9bf-02d8-4970-8fa9-e818f9012fbf	e5728235-0a9e-4c97-94f5-2ea336a0219d	1.00	55.13	5ba53637-1013-443b-a355-cff80e0f7b6e	e29b26c0-f7eb-483f-b1b2-6449d7bcd9db	14b4150b-6ce2-4980-8c68-ce2e737ab31e	5ba53637-1013-443b-a355-cff80e0f7b6e	e29b26c0-f7eb-483f-b1b2-6449d7bcd9db	\N	\N	سروال بلستك	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cd8a0110-c2e1-4fd7-9fdd-062cc3761ecb	INV-2026-000006	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	450.00	20.00	0.00	430.00	CARD	PAID	COMPLETED	\N	2026-09-23 11:33:20.414415+00	POS	\N	\N	9130bf2a-2238-4737-b1a1-9d54b64a9e9d	34ebc048-ab1a-4d4a-9dec-1efa232d7aa2	2026-09-23 11:33:20.414415+00	2026-09-23 11:33:20.414415+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
7cf2cb23-ce5c-4958-97b0-067c92e64d1f	INV-2026-000007	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	600.00	0.00	0.00	600.00	CASH	PAID	COMPLETED	\N	2026-09-23 11:35:11.987159+00	POS	\N	\N	225f0320-71c6-451b-bc0d-c349301de3b2	b328e7ef-af96-4627-bc5f-e7c60f88bd32	2026-09-23 11:35:11.987159+00	2026-09-23 11:35:11.987159+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
95ad07a7-e8d7-47fd-852e-96f52c582149	TLR-2026-000013	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	450.00	0.00	0.00	450.00	CASH	PARTIAL	CANCELLED	\N	2026-10-02 15:05:28.24931+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	a7cde9fd-a4da-4b3f-af45-a710b3639be9	\N	\N	\N	2026-10-02 15:05:59.675297+00	CANCELLED	2026-10-02	2026-10-09	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 1}, {"unit": "CM", "label": "الخصر", "value": 1}]	\N	\N	150.00	\N	CUSTOMER	0.00	63ae0a9d-ee2c-4004-9730-b8602c376b4b	af637885-884b-4b1c-887f-a90df270f350	1.00	150.00	\N	82d1b9eb-3e18-428e-8c07-825f967ca3ec	e3ca59e1-147e-4e40-9a95-5f72e369818d	\N	82d1b9eb-3e18-428e-8c07-825f967ca3ec	8bf0c0c7-ee7c-46b4-93a6-6a0707355b76	\N	جلابية كتان	\N	تم تحويل الطلب إلى منتج للمخزون بعد رفض العميل	2026-10-02 15:05:59.675297+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
4364a355-8a9a-49d4-ab14-b03828966fcf	INV-2026-000008	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	15.00	0.00	0.00	15.00	CASH	PAID	COMPLETED	\N	2026-09-23 11:41:55.512244+00	POS	\N	\N	cbc69ea9-9af2-4b53-a1a4-b1674fa40e72	79bf3567-57f2-433b-b2a1-e919e92a4772	2026-09-23 11:41:55.512244+00	2026-09-23 11:41:55.512244+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
ccd941fd-89d4-42ae-9026-71746b54c591	INV-2026-000010	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	46.05	0.00	0.00	46.05	CASH	PAID	COMPLETED	\N	2026-10-02 18:51:44.978169+00	POS	\N	\N	0d864d82-0a2b-43ac-9dbf-20111a6141b0	8e76b32b-88f9-4e4e-a6db-517dd550e876	2026-10-02 18:51:44.978169+00	2026-10-02 18:51:44.978169+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
bf466e39-01a5-4d6a-b43a-be4599b79932	INV-2026-000001	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	720.00	0.00	0.00	720.00	CASH	PAID	COMPLETED	\N	2026-09-19 21:37:20.801847+00	POS	\N	\N	825a8b2d-ecad-4e08-bdd2-cd13091f2542	c95f2bf7-6593-4850-ba2b-feac7a0e017e	2026-09-19 21:37:20.801847+00	2026-09-19 21:37:20.801847+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
d32de191-3239-4776-9248-cba7e9ea85ef	INV-2026-000002	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2040.00	0.00	0.00	2040.00	CASH	PAID	COMPLETED	\N	2026-09-21 13:24:33.956233+00	POS	\N	\N	d8aac907-cc90-424c-a466-6cd95efdce15	74859ad4-1e24-4955-9bb8-99715d066812	2026-09-21 13:24:33.956233+00	2026-09-21 13:24:33.956233+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
7735a69e-9ec3-4a3f-bf95-843db37d11b7	INV-2026-000003	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	3300.00	0.00	0.00	3300.00	CASH	PAID	COMPLETED	\N	2026-09-21 13:26:08.268334+00	POS	\N	\N	684cdf22-ba76-4f0b-816e-19b681075bc5	b3cd82e0-242e-4e99-9b8e-120d9fd9b9e1	2026-09-21 13:26:08.268334+00	2026-09-21 13:26:08.268334+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
6a407f0b-e422-49a1-ae65-c0c18751e0f8	INV-2026-000004	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	815.00	0.00	0.00	815.00	CASH	PAID	COMPLETED	\N	2026-09-22 12:57:31.578643+00	POS	\N	\N	b62a232b-e061-4357-bc31-d6abe2ea7628	4ab25096-931e-4de6-bc3b-46b7272fcfc2	2026-09-22 12:57:31.578643+00	2026-09-22 12:57:31.578643+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
70817a11-a4f4-4997-96e7-83478c1bdbcf	TLR-2026-000015	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	500.00	0.00	0.00	500.00	CASH	PARTIAL	PENDING	\N	2026-10-03 19:48:40.627024+00	TAILORING	e530c37a-c5a8-43e6-afc4-adc788a863b1	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-06 11:25:09.194319+00	READY_FOR_PICKUP	2026-10-03	2026-10-17	[{"unit": "M", "label": "الطول", "value": 2}, {"unit": "CM", "label": "الخصر", "value": 150}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.50	100.00	\N	CUSTOMER	58.63	\N	\N	\N	\N	\N	\N	\N	aad15d52-64b6-4773-ac9d-cf8301b5ef4c	\N	c0221155-1651-499f-ae93-7518a2e95f22	\N	جلابية قطن بني	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
9b42c995-89ab-4f6c-8023-49439102304c	INV-2026-000005	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2415.00	0.00	0.00	2415.00	CASH	PAID	COMPLETED	\N	2026-09-22 12:59:27.599953+00	POS	\N	\N	bea553ab-8cb7-4ef8-883b-36e6e00e56f2	9ccb5c18-cdee-429c-8d86-577326ffb353	2026-09-22 12:59:27.599953+00	2026-09-22 12:59:27.599953+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
ed8fdb00-392f-40e6-b5e2-869fde5971e8	TLR-2026-000001	dcc40a00-1275-463f-9cd8-caf5487100b0	\N	550.00	0.00	0.00	550.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-09-24 11:55:43.2422+00	TAILORING	76f35be8-5ab6-446d-968b-26e6430e24cd	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2e0e5037-5432-4b99-a466-dfbac5312ae8	\N	2026-10-06 10:25:39.607968+00	2026-10-06 10:25:39.607968+00	RECEIVED	2026-09-24	2026-10-10	[{"unit": "M", "label": "الطول", "value": 3}, {"unit": "M", "label": "الصدر", "value": 1.5}, {"unit": "M", "label": "الكتف", "value": 1.7}, {"unit": "M", "label": "الخصر", "value": 2.4}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	8.60	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	a093cb4a-b9b2-4ecc-b097-c507fc29f980	طلب تفصيل TLR-2026-000001	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
eac12289-7a38-4c51-bfc0-1eac5d6f2533	INV-2026-000015	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	130500.00	0.00	0.00	130500.00	CASH	PAID	COMPLETED	\N	2026-10-05 18:43:49.777219+00	POS	\N	\N	ed0fa2aa-f109-4edd-913f-15aa6e558a8d	22a13bad-53bf-46c9-bf65-8adff3ee2d18	2026-10-05 18:43:49.777219+00	2026-10-05 18:43:49.777219+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	15.00	15.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	130500.00	0.00	0.00	130500.00	0.00	0.00
2aadb231-35cf-4fe0-b02f-99a062736230	INV-2026-000016	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	4698000.00	0.00	0.00	4698000.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-05 18:45:12.868772+00	POS	\N	\N	5d8c8020-374a-4195-af85-7584ac2ce7ac	ae4ca98b-5c1d-4ed8-b839-7ebc9d4aa8c6	2026-10-05 18:45:12.868772+00	2026-10-05 18:45:12.868772+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	540.00	540.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	4698000.00	0.00	0.00	4698000.00	0.00	0.00
24155e69-8f6b-4977-8f50-757efce7d852	INV-2026-000017	dcc40a00-1275-463f-9cd8-caf5487100b0	48143da1-d832-40d6-99a0-2262bd58f2a4	1004850.00	0.00	0.00	1004850.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-06 09:43:10.028458+00	POS	\N	\N	f5d65d2f-175f-4bf1-b70a-9d0a8259519f	0a8ae29d-0b43-419b-97dd-1637f91d8cd6	2026-10-06 09:43:10.028458+00	2026-10-06 09:43:10.028458+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	115.50	115.50	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1004850.00	0.00	0.00	1004850.00	0.00	0.00
8c6542d2-da07-4852-8ab6-e2ecf3ac0337	INV-2026-000013	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	478500.00	0.00	0.00	478500.00	CASH	PAID	COMPLETED	\N	2026-10-05 16:17:20.946215+00	POS	\N	\N	a964bca0-6335-47e2-95c3-cbc94db603ce	60fb06e3-32dd-463c-8301-d96a3e05664b	2026-10-05 16:17:20.946215+00	2026-10-05 16:17:20.946215+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	55.00	55.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	478500.00	0.00	0.00	478500.00	0.00	0.00
77cc81a1-2bbf-4abb-983a-76dace9ecb78	TLR-2026-000003	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	300.00	0.00	0.00	300.00	BANK_TRANSFER	PARTIAL	PENDING	على الله مسلوبة	2026-09-25 19:33:38.401782+00	TAILORING	1e01c482-d1b6-4fdb-a096-b2318070c090	979147a7-a426-4e30-b90b-5f81f606c48b	58eaa13e-d7dd-47c9-8031-d830b9e628b1	\N	\N	2026-09-25 19:37:23.594079+00	UNDER_TAILORING	2026-09-25	2026-09-26	[{"unit": "M", "label": "الطول", "value": 3}, {"unit": "M", "label": "العرض", "value": 1.7}]	\N	\N	150.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	طلب تفصيل TLR-2026-000003	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
0bb8de45-cb81-4750-a7c4-573f2f17b31b	TLR-2026-000005	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	0.00	0.00	0.00	0.00	CASH	UNPAID	COMPLETED	\N	2026-09-26 12:03:29.667535+00	TAILORING	\N	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	2026-09-26 13:56:30.323617+00	2026-09-26 13:56:30.323617+00	RECEIVED	2026-09-26	2026-10-28	[{"unit": "M", "label": "الطول", "value": 2.85}, {"unit": "CM", "label": "الصدر", "value": 70}, {"unit": "M", "label": "الكتف", "value": 1.2}, {"unit": "M", "label": "الخصر", "value": 2}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	6.75	200.00	\N	PRODUCTION	113.06	d9f347d4-54d5-4171-a1ed-25f96686f714	0e39be16-e69f-457c-a79f-06d398dd5679	1.00	313.06	ed4c2d77-68c0-4daa-8f96-cf503c1ab01b	62f7ddbc-a866-4683-a02a-abc2f6068e06	508df3d5-d73a-4d31-9776-a51d4cf070a3	\N	\N	\N	\N	طلب تفصيل TLR-2026-000005	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	TLR-2026-000004	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	300.00	0.00	0.00	300.00	MIXED	PAID	COMPLETED	\N	2026-09-25 19:47:38.082203+00	TAILORING	1e01c482-d1b6-4fdb-a096-b2318070c090	979147a7-a426-4e30-b90b-5f81f606c48b	a0598714-801a-443f-9b13-b9a06194cbeb	8c65ea82-6da1-41cd-a719-28b4c90e87dd	2026-09-25 19:49:59.095511+00	2026-09-25 19:49:59.095511+00	RECEIVED	2026-09-25	2026-09-27	[{"unit": "M", "label": "الطول", "value": 3}, {"unit": "CM", "label": "العرض", "value": 3}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.03	150.00	3eab8dba-2f2f-46f6-a669-1a7a8f6ab1c5	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	طلب تفصيل TLR-2026-000004	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
32e76cfa-5829-449a-9042-3cca2339e394	TLR-2026-000002	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	300.00	0.00	0.00	300.00	CASH	PARTIAL	PENDING	\N	2026-09-25 11:38:42.727451+00	TAILORING	ec893243-c18f-438d-9695-da951a5c95e6	a7cde9fd-a4da-4b3f-af45-a710b3639be9	ac310993-a836-4525-9586-e0604cf8ee4b	41d488c8-7da2-4b8a-8a61-73fdbcd88267	\N	2026-09-26 13:58:13.70276+00	UNDER_TAILORING	2026-09-25	2026-10-25	[{"unit": "M", "label": "الطول", "value": 2.7}, {"unit": "CM", "label": "الصدر", "value": 85}, {"unit": "CM", "label": "الكتف", "value": 95}, {"unit": "M", "label": "الخصر", "value": 1.7}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	7.00	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	طلب تفصيل TLR-2026-000002	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
762e9bf6-78ba-4d0d-997d-4e8955bd56c3	TLR-2026-000006	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	400.00	0.00	0.00	400.00	CASH	PAID	COMPLETED	\N	2026-09-28 21:38:47.622131+00	TAILORING	1e01c482-d1b6-4fdb-a096-b2318070c090	979147a7-a426-4e30-b90b-5f81f606c48b	06c6cd7c-9576-4bc5-bab6-b599b536b9ff	\N	2026-09-28 21:40:21.688329+00	2026-09-28 21:40:21.688329+00	RECEIVED	2026-09-29	2026-10-03	[{"unit": "M", "label": "الطول", "value": 3.5}, {"unit": "M", "label": "العرض", "value": 2.7}]	\N	\N	150.00	12dc3d82-8c58-4069-8aaf-dad1bab34140	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	طلب تفصيل TLR-2026-000006	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
87cb2b64-c38d-41ae-ab5a-deef9da0cd19	TLR-2026-000007	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	100.00	0.00	0.00	100.00	MIXED	PAID	COMPLETED	\N	2026-09-29 14:27:05.462559+00	TAILORING	ca9476f4-0623-41df-b39e-527d9199ad29	979147a7-a426-4e30-b90b-5f81f606c48b	2e5179b3-aba4-4a0d-82f6-99591132ec59	abdf2351-4cb1-4e06-a786-555636421200	2026-09-29 17:11:40.014191+00	2026-09-29 17:11:40.014191+00	RECEIVED	2026-09-29	2026-10-15	[{"unit": "M", "label": "الطول", "value": 2.5}, {"unit": "CM", "label": "الصدر", "value": 50}, {"unit": "CM", "label": "الكتف", "value": 75}, {"unit": "M", "label": "الخصر", "value": 1.5}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	5.50	45.00	5a61eae5-1991-433d-b0e4-16e0f083cffe	CUSTOMER	92.13	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	طلب تفصيل TLR-2026-000007	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
4000a711-48a2-45f0-a38b-7d9388694566	TLR-2026-000008	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	450.00	0.00	0.00	450.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-09-30 08:58:44.344231+00	TAILORING	458eb845-c9c4-40df-9083-872aece41bf5	979147a7-a426-4e30-b90b-5f81f606c48b	46ca7005-6e83-4061-83da-7802e58830e4	d522d340-3405-4789-b858-9e7958277700	2026-09-30 09:05:57.868207+00	2026-09-30 09:05:57.868207+00	RECEIVED	2026-09-30	2026-10-10	[{"unit": "M", "label": "الطول", "value": 2.6}, {"unit": "CM", "label": "الصدر", "value": 80}, {"unit": "CM", "label": "الكتف", "value": 75}, {"unit": "M", "label": "الخصر", "value": 1.4}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	5.55	150.00	d522d340-3405-4789-b858-9e7958277700	CUSTOMER	92.96	\N	\N	\N	\N	\N	\N	\N	1c258ab7-351d-4250-aa34-63f56824f8fb	2b2ba72e-349c-4c1b-b13e-79c4d0737d8b	bdeeea1b-bb9e-4221-afe2-003166568125	\N	طلب تفصيل TLR-2026-000008	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
cd4a56e5-e67f-4f97-904b-74f6c263940d	TLR-2026-000011	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	450.00	0.00	0.00	450.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-01 17:16:21.636176+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	a7cde9fd-a4da-4b3f-af45-a710b3639be9	a538cdf9-dff4-42ba-a4d8-1de75480110c	f9b27bb5-ad23-4ac6-b1d9-58efa84eb398	2026-10-01 17:28:33.930318+00	2026-10-01 17:28:33.930318+00	RECEIVED	2026-10-01	2026-10-09	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "M", "label": "العرض", "value": 1}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.80	150.00	f9b27bb5-ad23-4ac6-b1d9-58efa84eb398	CUSTOMER	46.90	\N	\N	\N	\N	\N	\N	\N	9cdb0459-d885-4d53-8400-050a03732b16	475adca5-c449-46ce-a35f-fe83f82ce797	31b94fcb-1086-4822-aa76-75100556883d	24ee0694-3c6b-4fae-bb46-a9f956b0419c	جلابية كتان	جلابية كتان مسلوبة	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
10d1d2c8-4bb1-4c16-aada-d4c26e65ec58	TLR-2026-000009	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	350.00	0.00	0.00	350.00	CASH	PARTIAL	CANCELLED	\N	2026-10-01 13:26:23.046667+00	TAILORING	458eb845-c9c4-40df-9083-872aece41bf5	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-01 16:37:52.403111+00	CANCELLED	2026-10-01	2026-10-09	[{"unit": "M", "label": "الطول", "value": 1.25}, {"unit": "CM", "label": "الاكمام", "value": 50}, {"unit": "CM", "label": "العنق", "value": 35}, {"unit": "M", "label": "الخصر", "value": 0.8}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.50	50.00	\N	CUSTOMER	58.63	\N	\N	\N	\N	\N	\N	\N	\N	\N	352d6a62-b298-4727-90a0-1ad588e58921	\N	جلابية قطن بني	جلابية قطن بني باكمام مسلوبة وازرار كبيرة وقيطان	العميل ترك الطلب	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
c712117f-2745-468c-b22a-8e6c4c6957f6	INV-2026-000009	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	70.00	0.00	0.00	70.00	CASH	PAID	COMPLETED	\N	2026-10-02 15:03:46.997059+00	POS	\N	\N	2c7a32d9-edec-4c18-bedf-37077b749bac	2a7a3430-9f45-4a00-b6cc-de19a7fb2f90	2026-10-02 15:03:46.997059+00	2026-10-02 15:03:46.997059+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
b9556919-7013-474b-8e2a-a98c4c07dbac	TLR-2026-000010	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	400.00	0.00	0.00	400.00	CASH	PARTIAL	CANCELLED	\N	2026-10-01 16:56:32.145813+00	TAILORING	458eb845-c9c4-40df-9083-872aece41bf5	a7cde9fd-a4da-4b3f-af45-a710b3639be9	\N	\N	\N	2026-10-01 17:00:27.127004+00	CANCELLED	2026-10-01	2026-10-09	[{"unit": "M", "label": "الطول", "value": 1.25}, {"unit": "CM", "label": "الصدر", "value": 50}, {"unit": "CM", "label": "الكتف", "value": 35}, {"unit": "CM", "label": "الخصر", "value": 0.8}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.11	50.00	\N	CUSTOMER	35.34	\N	\N	\N	\N	\N	\N	\N	\N	\N	01963004-5f01-4bfe-bc02-698cc395067e	\N	على الله	على الله زرقاء	العميل غير رأيه	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
596812e5-b325-41d5-8999-b40ce5ccb633	INV-2026-000023	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	499500.00	0.00	0.00	499500.00	CASH	PAID	COMPLETED	\N	2026-10-08 16:52:40.933653+00	POS	\N	\N	44a5a178-d3dd-4c18-a3b5-7473f239d399	86a0fd92-aef3-4e0b-a591-7bfa99806d5c	2026-10-08 16:52:40.933653+00	2026-10-08 16:52:40.933653+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	55.50	55.50	9000.0000	\N	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	499500.00	0.00	0.00	499500.00	0.00	0.00
41b93550-8214-475c-af11-168e61131fc3	INV-2026-000011	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	540.00	0.00	0.00	540.00	CASH	PAID	COMPLETED	\N	2026-10-02 19:04:42.372754+00	POS	\N	\N	562b92fb-ee02-4b8a-aa25-4e11504c5a13	0bcf9971-2081-4d73-a68e-12333841718e	2026-10-02 19:04:42.372754+00	2026-10-02 19:04:42.372754+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
f7be6afe-9e7e-4323-8c0a-15f107f034dc	INV-2026-000012	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	180.00	0.00	0.00	180.00	CASH	PAID	COMPLETED	\N	2026-10-03 17:05:54.626068+00	POS	\N	\N	4f510920-9247-4e71-8081-00b1a9184749	684829df-d44b-4504-ba0d-767ba2eebb2e	2026-10-03 17:05:54.626068+00	2026-10-03 17:05:54.626068+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
258e66b7-d413-4945-8044-95782324f6c1	TLR-2026-000014	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	150.00	0.00	0.00	150.00	CASH	PAID	COMPLETED	ااااا	2026-10-02 18:29:45.755238+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	979147a7-a426-4e30-b90b-5f81f606c48b	71bb4c48-8bec-4d27-b77f-0aab8e17535a	daada9ef-159a-40fe-b10f-c924f7e4a731	2026-10-03 19:46:43.902206+00	2026-10-03 19:46:43.902206+00	RECEIVED	2026-10-02	2026-10-09	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 1}, {"unit": "CM", "label": "الخصر", "value": 1}]	\N	\N	200.00	daada9ef-159a-40fe-b10f-c924f7e4a731	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	e7e44d3e-c0cd-4d7e-ad1f-e81699b2f056	\N	c03fa082-0811-45f5-a0cc-e678bce15c32	جلابية كتان	اااا	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
4debb28d-0ebd-4cbf-bdbe-f608cc8a15c4	INV-2026-000014	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	3480000.00	0.00	0.00	3480000.00	CASH	PAID	COMPLETED	\N	2026-10-05 16:18:14.819252+00	POS	\N	\N	78ae3611-b868-48b0-936c-0b04a9ea8df9	4845b768-f34d-441c-99c0-435d9521ac38	2026-10-05 16:18:14.819252+00	2026-10-05 16:18:14.819252+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	400.00	400.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	3480000.00	0.00	0.00	3480000.00	0.00	0.00
56f2aba1-04df-441a-84f9-d2b5200fc323	TLR-2026-000017	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2000000.00	0.00	0.00	2000000.00	CASH	PAID	COMPLETED	\N	2026-10-07 13:00:11.585095+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	a7cde9fd-a4da-4b3f-af45-a710b3639be9	d8071dae-e722-4eca-b8b3-6c5e796f412c	59f1295c-7bb6-40e2-99e0-a2d5326b0e2e	2026-10-07 14:31:32.120478+00	2026-10-07 14:31:32.120478+00	RECEIVED	2026-10-07	2026-10-08	[{"unit": "M", "label": "الطول", "value": 1.7}, {"unit": "M", "label": "العرض", "value": 1}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.00	17.24	59f1295c-7bb6-40e2-99e0-a2d5326b0e2e	CUSTOMER	50.25	\N	\N	\N	\N	\N	\N	\N	3772a1b2-e493-4cbc-9421-54bed68d1b62	99819331-9978-47b4-a6c5-1e7e0de89da8	96080c1e-4f1a-477a-854b-e772d2a2cdef	78c957f1-aa1c-44b4-b07f-4ec01d366427	جلابية سعودية	جلابية سعودية باكمام مفتوحة	\N	\N	229.89	229.89	8700.0000	150000.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	2000000.00	0.00	0.00	2000000.00	0.00	0.00
de50fbc6-4721-4c5e-bab9-347f1c5b03e5	INV-2026-000018	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	1174500.00	0.00	0.00	1174500.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-07 12:29:28.100799+00	POS	\N	\N	6934abc5-5e8a-469e-980d-65160ae1c101	d8f27bab-9fc8-46d9-9202-3f3fecbf14b4	2026-10-07 12:29:28.100799+00	2026-10-07 12:29:28.100799+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	135.00	135.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1174500.00	0.00	0.00	1174500.00	0.00	0.00
9ead0e3e-cead-4bef-8c4f-85f73aa4d21e	INV-2026-000019	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	609000.00	0.00	0.00	609000.00	CASH	PAID	COMPLETED	\N	2026-10-07 12:31:03.588689+00	POS	\N	\N	48ec6994-82d1-4570-97b7-b11e6c1a12b9	6f9f1b66-3b29-42c1-81c7-07b31264f9a7	2026-10-07 12:31:03.588689+00	2026-10-07 12:31:03.588689+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	70.00	70.00	8700.0000	\N	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	609000.00	0.00	0.00	609000.00	0.00	0.00
f56387bf-67fd-4bb2-836e-854136916311	TLR-2026-000016	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	300000.00	0.00	0.00	300000.00	BANK_TRANSFER	PARTIAL	CANCELLED	\N	2026-10-07 12:52:53.141268+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-07 12:55:06.740969+00	CANCELLED	2026-10-07	2026-10-08	[{"unit": "M", "label": "الطول", "value": 3.5}, {"unit": "M", "label": "العرض", "value": 2}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	5.50	5.75	\N	CUSTOMER	92.13	\N	\N	\N	\N	\N	\N	\N	\N	\N	7476b9bf-fab6-4cea-8ab5-966905f73201	\N	على الله بيضاء	على الله قطن بيضاء مع ازرار سوداء فخمة وجيوب بازرار	تقدير سعر خاطيء من المدير	\N	34.48	34.48	8700.0000	50000.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	300000.00	0.00	0.00	300000.00	0.00	0.00
19473229-cc56-43a7-880a-6c4ef2d53d5f	TLR-2026-000023	dcc40a00-1275-463f-9cd8-caf5487100b0	48143da1-d832-40d6-99a0-2262bd58f2a4	500000.00	0.00	0.00	500000.00	MIXED	PAID	COMPLETED	\N	2026-10-08 14:08:20.530981+00	TAILORING	1e01c482-d1b6-4fdb-a096-b2318070c090	979147a7-a426-4e30-b90b-5f81f606c48b	40b434cf-4b09-452e-8105-02eb91ba9d3d	73c863fe-aa8c-43a3-8a0d-0d9be4d67d14	2026-10-08 18:04:25.716414+00	2026-10-08 18:04:25.716414+00	RECEIVED	2026-10-08	2026-10-16	[{"unit": "M", "label": "الطول", "value": 3.5}, {"unit": "M", "label": "العرض", "value": 2.7}]	\N	\N	3.33	73c863fe-aa8c-43a3-8a0d-0d9be4d67d14	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	d6348f87-9984-4950-b7c0-be1bf69a6699	717abc33-cce2-4531-a4b8-f289503fc028	94eb8a09-61a2-407f-b19e-b65f338fe7ae	جلابية قطن بني	\N	\N	\N	55.56	55.56	9000.0000	30000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	500000.00	0.00	0.00	500000.00	0.00	0.00
ad718a01-60ee-490f-987c-ba8dba3d9d20	TLR-2026-000025	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	400000.00	0.00	0.00	400000.00	BANK_TRANSFER	PARTIAL	CANCELLED	\N	2026-10-08 18:14:20.347043+00	TAILORING	c0d04b14-fdea-4753-bd50-0b13d5aae32f	a7cde9fd-a4da-4b3f-af45-a710b3639be9	\N	\N	\N	2026-10-08 18:18:53.347057+00	CANCELLED	2026-10-08	2026-10-16	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "العرض", "value": 45}, {"unit": "CM", "label": "الاكمام", "value": 45}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.75	1.11	\N	CUSTOMER	9.32	\N	\N	\N	\N	\N	\N	\N	\N	\N	4bba9a18-a56e-438f-8baa-45ece867fb6e	\N	ثوب كتان	\N	العميل غير رأيه	\N	44.44	44.44	9000.0000	10000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	400000.00	0.00	0.00	400000.00	0.00	0.00
90313135-dbd4-4f15-97c0-8f31ba2595d3	INV-2026-000020	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	552500.00	20000.00	0.00	532500.00	CASH	PAID	COMPLETED	\N	2026-10-07 20:05:52.576516+00	POS	\N	\N	ed63a1ee-1af1-4951-9323-f927ac87563d	540c0045-54ab-4cb5-8ab6-7775ff16fefe	2026-10-07 20:05:52.576516+00	2026-10-07 20:05:52.576516+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	65.00	62.65	8500.0000	\N	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	552500.00	20000.00	0.00	532500.00	2.35	0.00
5566880c-fb25-4263-9c6c-b25b2b3e7133	TLR-2026-000018	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	1200000.00	0.00	0.00	1200000.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-07 14:40:03.450015+00	TAILORING	b4ab1afd-105a-4ba3-9c5e-a6e376cb8a6e	979147a7-a426-4e30-b90b-5f81f606c48b	3224f463-6414-4d1a-89e9-9a1ed01b86da	89d08569-353c-41d4-86dd-7a6f38dd0124	2026-10-07 20:51:41.511133+00	2026-10-07 20:51:41.511133+00	RECEIVED	2026-10-07	2026-10-08	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "M", "label": "العرض", "value": 1}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.00	28.74	89d08569-353c-41d4-86dd-7a6f38dd0124	CUSTOMER	50.25	\N	\N	\N	\N	\N	\N	\N	04f0c266-3136-416f-b612-a86ec8f188c5	15d929ee-4b7d-438f-a001-cf67b2ea3c3f	99b6bf1f-f212-49e4-a1ca-45b247121ff7	e850db98-fdb3-4b16-962c-c666e9790573	ثوب كتان	\N	\N	\N	137.93	137.93	8700.0000	250000.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1200000.00	0.00	0.00	1200000.00	0.00	0.00
db05a618-fcc7-407e-91bf-dc8d54248a4a	TLR-2026-000020	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	250000.00	0.00	0.00	250000.00	BANK_TRANSFER	PARTIAL	CANCELLED	\N	2026-10-07 20:38:58.394635+00	TAILORING	c0d04b14-fdea-4753-bd50-0b13d5aae32f	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-07 21:01:27.978792+00	CANCELLED	2026-10-07	2026-10-16	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "العرض", "value": 70}, {"unit": "CM", "label": "الاكمام", "value": 45}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.00	4.12	\N	CUSTOMER	50.25	5512d3fe-cf9d-48e1-a925-f6e842615563	69ae184f-f5a2-4b8b-a4b3-ffe167670003	1.00	54.37	\N	441b78ab-9e6a-46fc-add7-3062b0642a52	a3255528-a3c4-4c21-ba71-ce7faee4b381	f582848b-9555-4cb3-89a7-96d4f8aeb4ba	441b78ab-9e6a-46fc-add7-3062b0642a52	c910ef61-d528-4923-b728-e6d26ba31eb8	\N	علي الله	علي الله زرقاء اكمام مسلوبة جيوب ازرار	تم تحويل الطلب إلى منتج للمخزون بعد رفض العميل	2026-10-07 21:01:27.978792+00	29.41	29.41	8500.0000	35000.00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	250000.00	0.00	0.00	250000.00	0.00	0.00
d78e6f94-2b33-4c3b-9702-0af30831eb1a	TLR-2026-000019	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	1200000.00	0.00	0.00	1200000.00	CASH	PARTIAL	CANCELLED	\N	2026-10-07 14:45:22.07637+00	TAILORING	5bb80bfb-ac62-4541-8295-9f239ccf3b41	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-07 21:06:10.8035+00	CANCELLED	2026-10-07	2026-10-08	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 100}, {"unit": "CM", "label": "الخصر", "value": 100}]	\N	\N	28.74	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	3d7bee09-1f5e-4c88-aed9-2f66086302d5	\N	ثوب كتان	\N	العميل غير فكرة المنتج	\N	137.93	137.93	8700.0000	250000.00	615c056a-931f-4bbb-9b68-707d29668b80	8700.000000	1200000.00	0.00	0.00	1200000.00	0.00	0.00
1fc23e98-e75a-4bae-a67a-5a34e6e81810	TLR-2026-000021	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	250000.00	0.00	0.00	250000.00	CASH	PARTIAL	PENDING	\N	2026-10-07 21:08:28.517514+00	TAILORING	5bb80bfb-ac62-4541-8295-9f239ccf3b41	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-07 21:15:36.887908+00	UNDER_TAILORING	2026-10-07	2026-10-16	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 100}, {"unit": "CM", "label": "الخصر", "value": 100}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	3.80	2.35	\N	CUSTOMER	63.65	\N	\N	\N	\N	\N	\N	\N	a3c3514a-38d5-4662-9e3b-5253dcf0c6ac	\N	\N	\N	ثوب كتان	\N	\N	\N	29.41	29.41	8500.0000	20000.00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	250000.00	0.00	0.00	250000.00	0.00	0.00
25a58694-8006-4bc0-b17f-4d50982eb949	TLR-2026-000022	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	0.00	0.00	0.00	0.00	CASH	UNPAID	PENDING	\N	2026-10-07 21:17:57.941004+00	TAILORING	\N	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-07 21:23:42.189508+00	UNDER_TAILORING	2026-10-07	2026-10-16	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "العرض", "value": 70}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.50	4.12	\N	PRODUCTION	41.88	\N	\N	\N	\N	68c32686-9574-4dc5-8885-60ba887e8f5d	\N	\N	68c32686-9574-4dc5-8885-60ba887e8f5d	\N	\N	\N	ثوب كتان	\N	\N	\N	0.00	0.00	8500.0000	35000.00	c62dc8fd-3223-4201-9d28-eabbac7f8b74	8500.000000	0.00	0.00	0.00	0.00	0.00	0.00
067e3336-485d-4400-a3a7-34995323dd68	INV-2026-000021	dcc40a00-1275-463f-9cd8-caf5487100b0	7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	1485000.00	10000.00	0.00	1475000.00	BANK_TRANSFER	PAID	COMPLETED	\N	2026-10-08 16:15:26.25196+00	POS	\N	\N	7961f577-ff64-4146-be9d-a047ad29f879	eda63e48-2e12-46d9-8756-741905f37c23	2026-10-08 16:15:26.25196+00	2026-10-08 16:15:26.25196+00	\N	\N	\N	\N	\N	\N	0.00	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	165.00	163.89	9000.0000	\N	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	1485000.00	10000.00	0.00	1475000.00	1.11	0.00
c50a83ab-1c5f-4bf4-8fac-2af23adc7448	TLR-2026-000026	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	400000.00	0.00	0.00	400000.00	CASH	PARTIAL	CANCELLED	\N	2026-10-08 18:24:48.874492+00	TAILORING	c0d04b14-fdea-4753-bd50-0b13d5aae32f	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-08 18:25:13.181208+00	CANCELLED	2026-10-08	2026-10-16	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 70}, {"unit": "CM", "label": "الكتف", "value": 45}]	\N	\N	1.11	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	39269dcd-5102-4d63-9361-f3eaca5fcd9a	\N	ثوب كتان	\N	الغاء	\N	44.44	44.44	9000.0000	10000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	400000.00	0.00	0.00	400000.00	0.00	0.00
1138ae15-0a08-4500-809a-9b07dc0e2fd9	TLR-2026-000027	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	100000.00	0.00	0.00	100000.00	CASH	PARTIAL	PENDING	\N	2026-10-08 18:27:13.248758+00	TAILORING	c0d04b14-fdea-4753-bd50-0b13d5aae32f	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	\N	2026-10-08 18:27:13.248758+00	NEW	2026-10-08	2026-10-20	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "الصدر", "value": 70}, {"unit": "CM", "label": "الكتف", "value": 45}]	\N	\N	0.22	\N	CUSTOMER	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	ثوب كتان	\N	\N	\N	11.11	11.11	9000.0000	2000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	100000.00	0.00	0.00	100000.00	0.00	0.00
576f7912-4ad1-436c-a955-a0b5b990f405	TLR-2026-000028	dcc40a00-1275-463f-9cd8-caf5487100b0	f25f6d4b-9b0b-43cb-b619-54fc913449ab	0.00	0.00	0.00	0.00	CASH	UNPAID	COMPLETED	\N	2026-10-08 18:30:43.71267+00	TAILORING	\N	979147a7-a426-4e30-b90b-5f81f606c48b	\N	\N	2026-10-08 18:32:24.62697+00	2026-10-08 18:32:24.62697+00	RECEIVED	2026-10-08	2026-10-17	[{"unit": "M", "label": "الطول", "value": 1.8}, {"unit": "CM", "label": "العرض", "value": 80}]	2bf556f1-2202-4fc4-be07-c646f4a263a2	2.60	3.33	\N	PRODUCTION	8.81	38d676aa-deeb-4f36-96f1-357b91e1ae61	b730c00c-0681-468f-b2d3-3b4e4a8ad92d	1.00	12.14	c9b0052d-e0e3-445c-af1c-a3ade96309ef	36cb6fd0-9663-4a25-85ad-2b70a449a5a5	27659185-64a7-4cb6-a726-65a913ff1bfe	c9b0052d-e0e3-445c-af1c-a3ade96309ef	36cb6fd0-9663-4a25-85ad-2b70a449a5a5	\N	\N	جلابية قطن بني	\N	\N	\N	0.00	0.00	9000.0000	30000.00	302ea13b-ab71-4381-b9a4-0fe7ea197bc8	9000.000000	0.00	0.00	0.00	0.00	0.00	0.00
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers (id, name, phone, email, address, "contactPerson", "isActive", "createdAt", "updatedAt", notes) FROM stdin;
86149372-b75e-442a-8a2f-97683b1efb3a	وكيل نايكي	05123	nike@shoe.store	الرياض - السعودية	ويليام مينديز	t	2026-08-31 01:42:50.058+00	2026-08-31 01:42:50.058+00	\N
3b1f5010-df2e-4556-a054-454e971f5ed9	مصنع سترة للمنسوجات	0566686324	sutra@factory.com	الرياض - شارع الملك فهد	مازن طاهر	t	2026-09-02 22:11:54.586+00	2026-09-02 22:11:54.586+00	\N
\.


--
-- Data for Name: tailor_commission_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tailor_commission_payments (id, branch_id, tailor_id, sales_order_id, amount, payment_method, notes, journal_entry_id, created_by, created_at, payment_type, currency, amount_original, exchange_rate_used, exchange_rate_id, exchange_rate_sdg_per_usd, amount_sdg, amount_usd) FROM stdin;
80b36158-d471-407e-9ec9-4c3ba2c8ddd1	dcc40a00-1275-463f-9cd8-caf5487100b0	a7cde9fd-a4da-4b3f-af45-a710b3639be9	32e76cfa-5829-449a-9042-3cca2339e394	100.00	CASH	\N	481fe134-8e9a-4ebc-b90d-80bde99ae4f1	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-25 12:23:25.422998+00	SETTLEMENT	USD	100.00	\N	\N	\N	\N	\N
d06dcd7e-44e3-4e28-a279-f511b0e9f7b8	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	7ef3ce42-888a-4a1a-8f0e-5e9052a9965b	150.00	CASH	\N	48da5733-605a-41b6-a778-b977edd84c3b	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-25 19:50:19.979723+00	SETTLEMENT	USD	150.00	\N	\N	\N	\N	\N
b8ba4341-69e2-4eeb-96cf-6d943d07a5f7	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	0bb8de45-cb81-4750-a7c4-573f2f17b31b	200.00	BANK	\N	c0970f02-3515-4cda-86fa-158b8865c27f	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-26 13:56:53.260635+00	SETTLEMENT	USD	200.00	\N	\N	\N	\N	\N
952d6b0c-0b31-44b1-b357-5e7b3e0519e3	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	762e9bf6-78ba-4d0d-997d-4e8955bd56c3	150.00	CASH	\N	d83ca70c-53f9-4138-80bd-8b205c778250	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-28 21:40:27.158171+00	SETTLEMENT	USD	150.00	\N	\N	\N	\N	\N
d20df296-55af-454f-8724-979bb46239c6	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	87cb2b64-c38d-41ae-ab5a-deef9da0cd19	45.00	CASH	\N	0f6150fe-2751-4bc1-8d97-8a0a875190be	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-29 17:11:57.608713+00	SETTLEMENT	USD	45.00	\N	\N	\N	\N	\N
e69a8a4c-1cf9-4b3d-8f54-5b1a7d97835d	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	4000a711-48a2-45f0-a38b-7d9388694566	150.00	CASH	\N	2b0479c6-6bc5-45cf-94b1-3361de4798be	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-09-30 09:01:31.333807+00	ADVANCE	USD	150.00	\N	\N	\N	\N	\N
d2bc1c4f-a646-4f30-882e-51dff350bcad	dcc40a00-1275-463f-9cd8-caf5487100b0	a7cde9fd-a4da-4b3f-af45-a710b3639be9	b9556919-7013-474b-8e2a-a98c4c07dbac	25.00	CASH	\N	423d07f1-1c12-47ad-b043-8a10312a360a	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-01 16:59:31.996733+00	ADVANCE	USD	25.00	\N	\N	\N	\N	\N
c6a76894-fc0e-4446-840d-3534c2989c44	dcc40a00-1275-463f-9cd8-caf5487100b0	a7cde9fd-a4da-4b3f-af45-a710b3639be9	cd4a56e5-e67f-4f97-904b-74f6c263940d	150.00	CASH	\N	0c43f3c8-e835-408b-a0c2-6bc5b09a12f5	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-01 17:21:09.292227+00	ADVANCE	USD	150.00	\N	\N	\N	\N	\N
857fccf5-5f0e-4c9a-8869-d1bdc414c8b8	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	79aa7a70-cacf-48b5-942e-df55e8c43697	30.00	CASH	\N	55606e1b-c4b6-4a01-b4c8-acdf367ea481	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 15:01:56.022307+00	SETTLEMENT	USD	30.00	\N	\N	\N	\N	\N
d02569f6-8f91-4304-a0f3-aa67136c1462	dcc40a00-1275-463f-9cd8-caf5487100b0	a7cde9fd-a4da-4b3f-af45-a710b3639be9	56f2aba1-04df-441a-84f9-d2b5200fc323	11.49	BANK	\N	cd9f421e-8546-4cf0-9865-eeb78574a8a9	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 13:07:38.960882+00	ADVANCE	SDG	100000.00	8700.0000	\N	\N	\N	\N
a628dbf7-7666-4b47-b7b0-22aae323a8f6	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	db05a618-fcc7-407e-91bf-dc8d54248a4a	2.35	BANK	سيستلم الباقي بعد الانتهاء	164638c8-4e0a-4874-8ad9-12a6f9c2f218	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 20:58:11.928691+00	ADVANCE	SDG	20000.00	8500.0000	\N	\N	\N	\N
c9b1f098-0e7c-4229-8191-4e5c903cb133	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	db05a618-fcc7-407e-91bf-dc8d54248a4a	1.76	CASH	\N	0cf53ae6-1af6-4abb-95e6-096cb20ef134	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 20:58:54.121807+00	ADVANCE	SDG	15000.00	8500.0000	\N	\N	\N	\N
4cebaeca-f029-4020-97e4-45dc48b79554	dcc40a00-1275-463f-9cd8-caf5487100b0	979147a7-a426-4e30-b90b-5f81f606c48b	1138ae15-0a08-4500-809a-9b07dc0e2fd9	0.22	BANK	\N	3a2d51e6-4e01-4627-9db2-36f1660e9462	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:28:10.749299+00	ADVANCE	SDG	2000.00	9000.0000	\N	\N	\N	\N
\.


--
-- Data for Name: tailoring_customer_advance_refunds; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tailoring_customer_advance_refunds (id, sales_order_id, amount, payment_method, journal_entry_id, created_by, created_at, notes) FROM stdin;
0e31ecda-76fe-4360-a85f-e7fc93c9f770	10d1d2c8-4bb1-4c16-aada-d4c26e65ec58	175.00	CASH	2b16c8a2-0431-4f5e-b7c2-20eb4c516665	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-01 16:38:33.611073+00	\N
3a591f70-0b0f-4981-941a-265153d4f758	f56387bf-67fd-4bb2-836e-854136916311	150000.00	BANK_TRANSFER	d9ad3038-ac29-4be2-b72f-3f95e4b20bd9	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 12:57:35.923315+00	\N
6d0bf133-1c85-4383-9f7a-d0a82e5f77a8	db05a618-fcc7-407e-91bf-dc8d54248a4a	125000.00	CASH	2dae0679-daac-4e86-8db9-e01456e3f814	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 21:04:20.919638+00	العميل لغى الطلب
0ee5e87e-3187-4a04-813b-8b2052d2e04b	ad718a01-60ee-490f-987c-ba8dba3d9d20	200000.00	CASH	a8726f93-73f8-4959-a5f9-dec75561503f	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:19:36.390451+00	استرد امواله
\.


--
-- Data for Name: tailoring_customer_advance_transfers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tailoring_customer_advance_transfers (id, from_order_id, to_order_id, amount, created_by, created_at, notes) FROM stdin;
2a29ea66-7d3b-425e-80b9-4094463cdf35	95ad07a7-e8d7-47fd-852e-96f52c582149	258e66b7-d413-4945-8044-95782324f6c1	75.00	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-02 18:29:45.755238+00	نقل رصيد عربون من الطلب الملغي إلى طلب بديل
6094ecb8-4424-4518-a6cd-bbdd91ee99f8	d78e6f94-2b33-4c3b-9702-0af30831eb1a	1fc23e98-e75a-4bae-a67a-5a34e6e81810	125000.00	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-07 21:08:28.517514+00	نقل رصيد عربون من الطلب الملغي إلى طلب بديل
4dcb189b-99db-4ee7-8edb-f2704fd25e36	c50a83ab-1c5f-4bf4-8fac-2af23adc7448	1138ae15-0a08-4500-809a-9b07dc0e2fd9	50000.00	f25f6d4b-9b0b-43cb-b619-54fc913449ab	2026-10-08 18:27:13.248758+00	نقل رصيد عربون من الطلب الملغي إلى طلب بديل
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password, role, "isActive", "isPasswordChanged", salary, shift, phone, "createdAt", "updatedAt", "position", "branchId", "commissionRate", "resetRequested") FROM stdin;
5caa6773-6567-4819-8327-642a3ca2ae2d	محمد الطاهر	mohammed@mail.com	$2b$10$GyTVzHuAT1AEQwWUpSziDeFJY0kOOWlo1Uf6J6.hu5dIqFSl3QGve	cashier	t	f	2000	full_time	055123547	2026-08-20 13:18:31.735	2026-08-23 14:54:46.622+00	cashier	dcc40a00-1275-463f-9cd8-caf5487100b0	0	f
a7cde9fd-a4da-4b3f-af45-a710b3639be9	admin	admin@store.sa	admin123	tailor	t	t	0	night	058666332740	2026-08-23 15:44:38.559	2026-09-25 11:09:05.722444+00	tailor	dcc40a00-1275-463f-9cd8-caf5487100b0	50	f
a1f47817-effd-4973-a935-33d4ea1edaee	خليل عبدالله	gassim@mail.com	$2b$10$ztLHJLxDkfB2U6VJ5Tvv.elO67qpIak1DSY8gjBHu.dC/m7tZSqO6	cashier	t	t	1500	morning	05866633500	2026-08-23 20:00:05.891	2026-10-03 22:04:03.432884+00	cashier	dcc40a00-1275-463f-9cd8-caf5487100b0	0	f
f25f6d4b-9b0b-43cb-b619-54fc913449ab	Super Admin	admin@store.com	$2b$10$LqhD1rl0DjLaoBe7000Fbeka7mbJguC8EXiOpYWKXEq8kUxWl6sfW	admin	t	t	0	full_time	0123458630	2026-08-19 13:09:56.504	2026-08-23 20:03:14.86+00	system_manager	dcc40a00-1275-463f-9cd8-caf5487100b0	0	f
48143da1-d832-40d6-99a0-2262bd58f2a4	المالك	owner@store.com	$2b$10$X.7Tgw3D6gnhLl.Od8S2EO9js8NbapzAy5LEuZRWnbY7r9TV6zegK	owner	t	t	\N	\N	\N	2026-10-05 21:58:54.835	2026-10-05 22:44:41.993149+00	system_manager	dcc40a00-1275-463f-9cd8-caf5487100b0	50	f
979147a7-a426-4e30-b90b-5f81f606c48b	عمر محمد	omer@gmail.com	$2b$10$eJ1.K8OG7.MTNSy.Ewi3Bu8zobwJsiaKOn7j03RBI6QRSf7pMk3H.	tailor	t	t	0	night	058666332740	2026-08-23 19:41:55.035	2026-10-06 11:12:53.510848+00	tailor	dcc40a00-1275-463f-9cd8-caf5487100b0	40	f
7bbdc948-cf5a-4017-a7cf-c3cd53e156e5	احمد طارق	ahmed@cashier.com	$2b$10$W6xNibpLvH9V2/sd4Tixd.vRNbOcChCHQdYiQ7oVCbBy62Irs8NLa	cashier	t	t	200000	full_time	+2491148489	2026-10-07 14:20:03.325	2026-10-07 14:21:14.899049+00	cashier	dcc40a00-1275-463f-9cd8-caf5487100b0	0	f
fc024d00-8f11-4994-b1da-7795345a45e2	همام عمر	cashier@store.com	$2b$10$tgZ9amUVKjGTYf3d6ioKM.V.4KyWTdKj1DBHx3QZAVdGmTZebCbAa	cashier	t	t	200000	morning	+2491148489	2026-10-09 16:40:07.104	2026-10-09 16:41:51.967566+00	cashier	dcc40a00-1275-463f-9cd8-caf5487100b0	0	f
\.


--
-- Name: branches Branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "Branch_pkey" PRIMARY KEY (id);


--
-- Name: users User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_unique UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_whatsapp_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_whatsapp_unique UNIQUE (branch_id, whatsapp_number);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: product_templates product_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_templates
    ADD CONSTRAINT product_templates_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_barcode_key UNIQUE (barcode);


--
-- Name: product_variants product_variants_pack_barcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pack_barcode_key UNIQUE ("packBarcode");


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_payments purchase_order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_order_number_key UNIQUE (order_number);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: sales_order_items sales_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);


--
-- Name: sales_order_payments sales_order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_payments
    ADD CONSTRAINT sales_order_payments_pkey PRIMARY KEY (id);


--
-- Name: sales_orders sales_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_order_number_key UNIQUE (order_number);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tailor_commission_payments tailor_commission_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_pkey PRIMARY KEY (id);


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_refunds
    ADD CONSTRAINT tailoring_customer_advance_refunds_pkey PRIMARY KEY (id);


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_transfers
    ADD CONSTRAINT tailoring_customer_advance_transfers_pkey PRIMARY KEY (id);


--
-- Name: Branch_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Branch_code_key" ON public.branches USING btree (code);


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public.users USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public.users USING btree (email);


--
-- Name: exchange_rates_branch_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_branch_effective_idx ON public.exchange_rates USING btree (branch_id, effective_at DESC);


--
-- Name: idx_assets_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_branch ON public.assets USING btree (branch_id);


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_category ON public.assets USING btree (category);


--
-- Name: idx_assets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_created_at ON public.assets USING btree (created_at DESC);


--
-- Name: idx_customers_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_branch ON public.customers USING btree (branch_id);


--
-- Name: idx_customers_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_whatsapp ON public.customers USING btree (whatsapp_number);


--
-- Name: idx_exchange_rates_branch_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_branch_effective ON public.exchange_rates USING btree (branch_id, effective_at DESC);


--
-- Name: idx_inv_mov_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_mov_created_at ON public.inventory_movements USING btree (created_at DESC);


--
-- Name: idx_inv_mov_purchase_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_mov_purchase_order ON public.inventory_movements USING btree (purchase_order_id);


--
-- Name: idx_inv_mov_sales_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_mov_sales_order ON public.inventory_movements USING btree (sales_order_id);


--
-- Name: idx_inv_mov_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_mov_variant ON public.inventory_movements USING btree (variant_id);


--
-- Name: idx_inv_mov_variant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_mov_variant_created ON public.inventory_movements USING btree (variant_id, created_at DESC);


--
-- Name: idx_inventory_movements_sales_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_sales_order ON public.inventory_movements USING btree (sales_order_id);


--
-- Name: idx_journal_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_branch ON public.journal_entries USING btree (branch_id);


--
-- Name: idx_journal_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_branch_created ON public.journal_entries USING btree (branch_id, created_at DESC);


--
-- Name: idx_journal_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_created_at ON public.journal_entries USING btree (created_at DESC);


--
-- Name: idx_journal_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_created_by ON public.journal_entries USING btree (created_by);


--
-- Name: idx_journal_entries_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_currency ON public.journal_entries USING btree (branch_id, currency);


--
-- Name: idx_journal_entry_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entry_type ON public.journal_entries USING btree (entry_type);


--
-- Name: idx_journal_purchase_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_purchase_order ON public.journal_entries USING btree (purchase_order_id);


--
-- Name: idx_journal_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_reference ON public.journal_entries USING btree (reference);


--
-- Name: idx_journal_sales_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_sales_order ON public.journal_entries USING btree (sales_order_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_key ON public.notifications USING btree (((metadata ->> 'key'::text)));


--
-- Name: idx_notifications_target_roles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_target_roles ON public.notifications USING gin (target_roles);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree ("isRead") WHERE ("isRead" = false);


--
-- Name: idx_one_default_variant_per_template; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_default_variant_per_template ON public.product_variants USING btree ("templateId") WHERE ("isDefault" = true);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_po_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_supplier ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_poi_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poi_po ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: idx_poi_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poi_template ON public.purchase_order_items USING btree (template_id);


--
-- Name: idx_poi_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poi_variant ON public.purchase_order_items USING btree (variant_id);


--
-- Name: idx_pop_purchase_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pop_purchase_order ON public.purchase_order_payments USING btree (purchase_order_id);


--
-- Name: idx_pop_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pop_reference ON public.purchase_order_payments USING btree (reference);


--
-- Name: idx_sales_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_items_order ON public.sales_order_items USING btree (sales_order_id);


--
-- Name: idx_sales_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_items_variant ON public.sales_order_items USING btree (variant_id);


--
-- Name: idx_sales_order_items_gift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_order_items_gift ON public.sales_order_items USING btree (sales_order_id, is_gift);


--
-- Name: idx_sales_orders_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_branch ON public.sales_orders USING btree (branch_id);


--
-- Name: idx_sales_orders_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_cashier ON public.sales_orders USING btree (cashier_id);


--
-- Name: idx_sales_orders_cashier_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_cashier_created ON public.sales_orders USING btree (cashier_id, created_at DESC);


--
-- Name: idx_sales_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_created_at ON public.sales_orders USING btree (created_at DESC);


--
-- Name: idx_sales_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_customer ON public.sales_orders USING btree (customer_id);


--
-- Name: idx_sales_orders_customer_advance_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_customer_advance_journal ON public.sales_orders USING btree (customer_advance_journal_entry_id);


--
-- Name: idx_sales_orders_customer_advance_recognition_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_customer_advance_recognition_journal ON public.sales_orders USING btree (customer_advance_recognition_journal_entry_id);


--
-- Name: idx_sales_orders_expected_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_expected_delivery ON public.sales_orders USING btree (expected_delivery_date);


--
-- Name: idx_sales_orders_fabric_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_fabric_variant ON public.sales_orders USING btree (fabric_variant_id);


--
-- Name: idx_sales_orders_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_order_type ON public.sales_orders USING btree (order_type);


--
-- Name: idx_sales_orders_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_payment_status ON public.sales_orders USING btree (payment_status);


--
-- Name: idx_sales_orders_produced_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_produced_variant ON public.sales_orders USING btree (produced_product_variant_id);


--
-- Name: idx_sales_orders_production_labor_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_production_labor_journal ON public.sales_orders USING btree (production_labor_journal_entry_id);


--
-- Name: idx_sales_orders_production_material_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_production_material_journal ON public.sales_orders USING btree (production_material_journal_entry_id);


--
-- Name: idx_sales_orders_production_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_production_template ON public.sales_orders USING btree (produced_product_template_id);


--
-- Name: idx_sales_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_status ON public.sales_orders USING btree (status);


--
-- Name: idx_sales_orders_tailor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailor ON public.sales_orders USING btree (tailor_id);


--
-- Name: idx_sales_orders_tailoring_cogs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_cogs ON public.sales_orders USING btree (tailoring_cogs_journal_entry_id);


--
-- Name: idx_sales_orders_tailoring_item_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_item_name ON public.sales_orders USING btree (tailoring_item_name);


--
-- Name: idx_sales_orders_tailoring_labor_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_labor_journal ON public.sales_orders USING btree (tailoring_labor_journal_entry_id);


--
-- Name: idx_sales_orders_tailoring_material_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_material_journal ON public.sales_orders USING btree (tailoring_material_journal_entry_id);


--
-- Name: idx_sales_orders_tailoring_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_purpose ON public.sales_orders USING btree (tailoring_purpose);


--
-- Name: idx_sales_orders_tailoring_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_tailoring_status ON public.sales_orders USING btree (tailoring_status);


--
-- Name: idx_sales_payments_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payments_created_by ON public.sales_order_payments USING btree (created_by);


--
-- Name: idx_sales_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payments_date ON public.sales_order_payments USING btree (payment_date DESC);


--
-- Name: idx_sales_payments_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payments_journal ON public.sales_order_payments USING btree (journal_entry_id);


--
-- Name: idx_sales_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payments_order ON public.sales_order_payments USING btree (sales_order_id);


--
-- Name: idx_sales_payments_reference_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sales_payments_reference_unique ON public.sales_order_payments USING btree (reference) WHERE (reference IS NOT NULL);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_tailor_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailor_payments_order ON public.tailor_commission_payments USING btree (sales_order_id);


--
-- Name: idx_tailor_payments_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailor_payments_order_type ON public.tailor_commission_payments USING btree (sales_order_id, payment_type);


--
-- Name: idx_tailor_payments_tailor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailor_payments_tailor ON public.tailor_commission_payments USING btree (tailor_id);


--
-- Name: idx_tailoring_customer_advance_refunds_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailoring_customer_advance_refunds_order ON public.tailoring_customer_advance_refunds USING btree (sales_order_id);


--
-- Name: idx_tailoring_customer_advance_transfers_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailoring_customer_advance_transfers_from ON public.tailoring_customer_advance_transfers USING btree (from_order_id);


--
-- Name: idx_tailoring_customer_advance_transfers_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tailoring_customer_advance_transfers_to ON public.tailoring_customer_advance_transfers USING btree (to_order_id);


--
-- Name: idx_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_category ON public.product_templates USING btree ("categoryId");


--
-- Name: idx_templates_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_supplier ON public.product_templates USING btree ("supplierId");


--
-- Name: idx_variants_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_barcode ON public.product_variants USING btree (barcode);


--
-- Name: idx_variants_pack_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_pack_barcode ON public.product_variants USING btree ("packBarcode");


--
-- Name: idx_variants_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_sku ON public.product_variants USING btree (sku);


--
-- Name: idx_variants_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_template ON public.product_variants USING btree ("templateId");


--
-- Name: idx_variants_template_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_template_active ON public.product_variants USING btree ("templateId", "isActive");


--
-- Name: idx_variants_template_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_template_default ON public.product_variants USING btree ("templateId", "isDefault");


--
-- Name: journal_entries_usd_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_usd_created_idx ON public.journal_entries USING btree (branch_id, created_at DESC) WHERE (amount_usd IS NOT NULL);


--
-- Name: sales_orders_usd_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_usd_created_idx ON public.sales_orders USING btree (branch_id, created_at DESC) WHERE (total_amount_usd IS NOT NULL);


--
-- Name: exchange_rates exchange_rates_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER exchange_rates_immutable BEFORE DELETE OR UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.prevent_exchange_rate_mutation();


--
-- Name: inventory_movements inventory_movements_usd_cost_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_movements_usd_cost_snapshot BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.snapshot_inventory_movement_cost();


--
-- Name: journal_entries journal_entries_currency_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_entries_currency_snapshot BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.snapshot_journal_currency();


--
-- Name: sales_order_items sales_order_items_currency_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_order_items_currency_snapshot BEFORE INSERT ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.snapshot_sales_item_currency();


--
-- Name: sales_order_payments sales_order_payments_currency_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_order_payments_currency_snapshot BEFORE INSERT ON public.sales_order_payments FOR EACH ROW EXECUTE FUNCTION public.snapshot_sales_payment_currency();


--
-- Name: sales_orders sales_orders_currency_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_orders_currency_snapshot BEFORE INSERT OR UPDATE OF subtotal, discount_amount, tax_amount, total_amount, exchange_rate_id, exchange_rate_used ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.snapshot_sales_order_currency();


--
-- Name: journal_entries trg_journal_settle_tailor_fx; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_journal_settle_tailor_fx AFTER INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.trg_settle_tailor_fx_from_labor();


--
-- Name: product_variants trg_product_variants_stock_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_variants_stock_notify AFTER INSERT OR UPDATE OF "stockQuantity", "minStockLevel", "isActive" ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.trg_product_variants_stock_notify();


--
-- Name: sales_orders trg_sales_orders_resolve_delay; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sales_orders_resolve_delay AFTER UPDATE OF tailoring_status, expected_delivery_date ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.trg_sales_orders_resolve_delay();


--
-- Name: tailor_commission_payments trg_tailor_payments_settle_fx; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tailor_payments_settle_fx AFTER INSERT ON public.tailor_commission_payments FOR EACH ROW EXECUTE FUNCTION public.trg_settle_tailor_fx_from_payment();


--
-- Name: product_templates update_product_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_templates_updated_at BEFORE UPDATE ON public.product_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_variants update_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_user_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: assets assets_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: exchange_rates exchange_rates_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: exchange_rates exchange_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assets fk_assets_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT fk_assets_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: assets fk_assets_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT fk_assets_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements fk_inv_mov_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_inv_mov_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_movements fk_inventory_sales_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_inventory_sales_order FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items fk_item_po; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT fk_item_po FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items fk_item_template; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT fk_item_template FOREIGN KEY (template_id) REFERENCES public.product_templates(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items fk_item_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT fk_item_variant FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: journal_entries fk_journal_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: journal_entries fk_journal_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_purchase; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_purchase FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_sales; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_sales FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_sales_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_sales_order FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_po; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_mov_po FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_sales; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_mov_sales FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_template; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_mov_template FOREIGN KEY (template_id) REFERENCES public.product_templates(id) ON DELETE RESTRICT;


--
-- Name: inventory_movements fk_mov_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT fk_mov_variant FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders fk_po_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_payments fk_pop_purchase_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT fk_pop_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: sales_orders fk_sales_branch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: sales_orders fk_sales_cashier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_cashier FOREIGN KEY (cashier_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_cogs_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_cogs_journal FOREIGN KEY (cogs_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_customer_advance_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_customer_advance_journal FOREIGN KEY (customer_advance_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_customer_advance_recognition_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_customer_advance_recognition_journal FOREIGN KEY (customer_advance_recognition_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_order_items fk_sales_item_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT fk_sales_item_order FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;


--
-- Name: sales_order_items fk_sales_item_template; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT fk_sales_item_template FOREIGN KEY (template_id) REFERENCES public.product_templates(id) ON DELETE RESTRICT;


--
-- Name: sales_order_items fk_sales_item_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT fk_sales_item_variant FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: sales_order_payments fk_sales_payment_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_payments
    ADD CONSTRAINT fk_sales_payment_journal FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_order_payments fk_sales_payment_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_payments
    ADD CONSTRAINT fk_sales_payment_order FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;


--
-- Name: sales_order_payments fk_sales_payment_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_payments
    ADD CONSTRAINT fk_sales_payment_user FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_produced_template; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_produced_template FOREIGN KEY (produced_product_template_id) REFERENCES public.product_templates(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_produced_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_produced_variant FOREIGN KEY (produced_product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_inventory_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_production_inventory_journal FOREIGN KEY (production_inventory_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_labor_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_production_labor_journal FOREIGN KEY (production_labor_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_material_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_production_material_journal FOREIGN KEY (production_material_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_sales_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_sales_journal FOREIGN KEY (sales_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_tailor FOREIGN KEY (tailor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_cogs_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_tailoring_cogs_journal FOREIGN KEY (tailoring_cogs_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_labor_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_tailoring_labor_journal FOREIGN KEY (tailoring_labor_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_material_journal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT fk_sales_tailoring_material_journal FOREIGN KEY (tailoring_material_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: product_templates product_templates_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_templates
    ADD CONSTRAINT "product_templates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: product_templates product_templates_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_templates
    ADD CONSTRAINT "product_templates_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: product_variants product_variants_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT "product_variants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.product_templates(id) ON DELETE CASCADE;


--
-- Name: purchase_order_payments purchase_order_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_payments
    ADD CONSTRAINT purchase_order_payments_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: sales_order_payments sales_order_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_payments
    ADD CONSTRAINT sales_order_payments_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales_orders sales_orders_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_fabric_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_fabric_variant_id_fkey FOREIGN KEY (fabric_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES public.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: tailor_commission_payments tailor_commission_payments_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_tailor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailor_commission_payments
    ADD CONSTRAINT tailor_commission_payments_tailor_id_fkey FOREIGN KEY (tailor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_refunds
    ADD CONSTRAINT tailoring_customer_advance_refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_refunds
    ADD CONSTRAINT tailoring_customer_advance_refunds_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_refunds
    ADD CONSTRAINT tailoring_customer_advance_refunds_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_transfers
    ADD CONSTRAINT tailoring_customer_advance_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_from_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_transfers
    ADD CONSTRAINT tailoring_customer_advance_transfers_from_order_id_fkey FOREIGN KEY (from_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_to_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tailoring_customer_advance_transfers
    ADD CONSTRAINT tailoring_customer_advance_transfers_to_order_id_fkey FOREIGN KEY (to_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;


--
-- Name: users users_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: users Allow server-side bypass; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow server-side bypass" ON public.users TO service_role USING (true) WITH CHECK (true);


--
-- Name: users Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true);


--
-- Name: _prisma_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: product_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_order_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: tailor_commission_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tailor_commission_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: tailoring_customer_advance_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tailoring_customer_advance_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: tailoring_customer_advance_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tailoring_customer_advance_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION calculate_tailoring_measurement_meters(p_measurements jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_tailoring_measurement_meters(p_measurements jsonb) TO anon;
GRANT ALL ON FUNCTION public.calculate_tailoring_measurement_meters(p_measurements jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_tailoring_measurement_meters(p_measurements jsonb) TO service_role;


--
-- Name: FUNCTION cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION check_overdue_tailoring_orders(p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_overdue_tailoring_orders(p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_overdue_tailoring_orders(p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_overdue_tailoring_orders(p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION complete_sales_checkout(p_branch_id uuid, p_cashier_id uuid, p_order_type text, p_customer_id uuid, p_tailor_id uuid, p_discount_amount numeric, p_tax_amount numeric, p_payment_method text, p_payment_splits jsonb, p_notes text, p_items jsonb, p_expected_exchange_rate numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.complete_sales_checkout(p_branch_id uuid, p_cashier_id uuid, p_order_type text, p_customer_id uuid, p_tailor_id uuid, p_discount_amount numeric, p_tax_amount numeric, p_payment_method text, p_payment_splits jsonb, p_notes text, p_items jsonb, p_expected_exchange_rate numeric) TO anon;
GRANT ALL ON FUNCTION public.complete_sales_checkout(p_branch_id uuid, p_cashier_id uuid, p_order_type text, p_customer_id uuid, p_tailor_id uuid, p_discount_amount numeric, p_tax_amount numeric, p_payment_method text, p_payment_splits jsonb, p_notes text, p_items jsonb, p_expected_exchange_rate numeric) TO authenticated;
GRANT ALL ON FUNCTION public.complete_sales_checkout(p_branch_id uuid, p_cashier_id uuid, p_order_type text, p_customer_id uuid, p_tailor_id uuid, p_discount_amount numeric, p_tax_amount numeric, p_payment_method text, p_payment_splits jsonb, p_notes text, p_items jsonb, p_expected_exchange_rate numeric) TO service_role;


--
-- Name: FUNCTION complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text) TO anon;
GRANT ALL ON FUNCTION public.complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text) TO authenticated;
GRANT ALL ON FUNCTION public.complete_tailoring_pickup(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_payment_method text) TO service_role;


--
-- Name: FUNCTION complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.complete_tailoring_production(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO service_role;


--
-- Name: FUNCTION convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.convert_tailoring_to_product(p_branch_id uuid, p_user_id uuid, p_order_id uuid, p_product_payload jsonb) TO service_role;


--
-- Name: FUNCTION create_asset_with_journal_entry(p_branch_id uuid, p_created_by uuid, p_name text, p_category text, p_purchase_value numeric, p_purchase_date text, p_payment_method text, p_reference text, p_notes text, p_entry_number text, p_currency text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_asset_with_journal_entry(p_branch_id uuid, p_created_by uuid, p_name text, p_category text, p_purchase_value numeric, p_purchase_date text, p_payment_method text, p_reference text, p_notes text, p_entry_number text, p_currency text) TO anon;
GRANT ALL ON FUNCTION public.create_asset_with_journal_entry(p_branch_id uuid, p_created_by uuid, p_name text, p_category text, p_purchase_value numeric, p_purchase_date text, p_payment_method text, p_reference text, p_notes text, p_entry_number text, p_currency text) TO authenticated;
GRANT ALL ON FUNCTION public.create_asset_with_journal_entry(p_branch_id uuid, p_created_by uuid, p_name text, p_category text, p_purchase_value numeric, p_purchase_date text, p_payment_method text, p_reference text, p_notes text, p_entry_number text, p_currency text) TO service_role;


--
-- Name: FUNCTION create_product(p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_product(p_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_product(p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_payload jsonb) TO service_role;


--
-- Name: FUNCTION create_tailoring_order(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_tailoring_purpose text, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_deposit_amount numeric, p_tailoring_cost numeric, p_payment_method text, p_customer_advance_source_order_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_tailoring_order(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_tailoring_purpose text, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_deposit_amount numeric, p_tailoring_cost numeric, p_payment_method text, p_customer_advance_source_order_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.create_tailoring_order(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_tailoring_purpose text, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_deposit_amount numeric, p_tailoring_cost numeric, p_payment_method text, p_customer_advance_source_order_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.create_tailoring_order(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_tailoring_purpose text, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_deposit_amount numeric, p_tailoring_cost numeric, p_payment_method text, p_customer_advance_source_order_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_notes text) TO service_role;


--
-- Name: FUNCTION create_tailoring_overdue_notifications(p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_tailoring_overdue_notifications(p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.create_tailoring_overdue_notifications(p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_tailoring_overdue_notifications(p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION exchange_currency(p_branch_id uuid, p_user_id uuid, p_from_currency text, p_from_account text, p_from_amount numeric, p_to_account text, p_to_amount numeric, p_notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.exchange_currency(p_branch_id uuid, p_user_id uuid, p_from_currency text, p_from_account text, p_from_amount numeric, p_to_account text, p_to_amount numeric, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.exchange_currency(p_branch_id uuid, p_user_id uuid, p_from_currency text, p_from_account text, p_from_amount numeric, p_to_account text, p_to_amount numeric, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.exchange_currency(p_branch_id uuid, p_user_id uuid, p_from_currency text, p_from_account text, p_from_amount numeric, p_to_account text, p_to_amount numeric, p_notes text) TO service_role;


--
-- Name: FUNCTION generate_overdue_tailoring_notifications(p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_overdue_tailoring_notifications(p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.generate_overdue_tailoring_notifications(p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_overdue_tailoring_notifications(p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION generate_product_barcode(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_product_barcode() TO anon;
GRANT ALL ON FUNCTION public.generate_product_barcode() TO authenticated;
GRANT ALL ON FUNCTION public.generate_product_barcode() TO service_role;


--
-- Name: FUNCTION generate_product_sku(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_product_sku() TO anon;
GRANT ALL ON FUNCTION public.generate_product_sku() TO authenticated;
GRANT ALL ON FUNCTION public.generate_product_sku() TO service_role;


--
-- Name: FUNCTION get_account_balance(p_branch_id uuid, p_account text, p_currency text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_account_balance(p_branch_id uuid, p_account text, p_currency text) TO anon;
GRANT ALL ON FUNCTION public.get_account_balance(p_branch_id uuid, p_account text, p_currency text) TO authenticated;
GRANT ALL ON FUNCTION public.get_account_balance(p_branch_id uuid, p_account text, p_currency text) TO service_role;


--
-- Name: FUNCTION get_current_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_current_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_current_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_current_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO service_role;


--
-- Name: TABLE exchange_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exchange_rates TO anon;
GRANT ALL ON TABLE public.exchange_rates TO authenticated;
GRANT ALL ON TABLE public.exchange_rates TO service_role;


--
-- Name: FUNCTION get_effective_exchange_rate(p_branch_id uuid, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_effective_exchange_rate(p_branch_id uuid, p_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_effective_exchange_rate(p_branch_id uuid, p_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_effective_exchange_rate(p_branch_id uuid, p_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_order_advance_rate(p_order_id uuid, p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_order_advance_rate(p_order_id uuid, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_order_advance_rate(p_order_id uuid, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_order_advance_rate(p_order_id uuid, p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION get_tailor_cost_sdg(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_tailor_cost_sdg(p_order_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_tailor_cost_sdg(p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_tailor_cost_sdg(p_order_id uuid) TO service_role;


--
-- Name: FUNCTION get_tailor_paid_sdg(p_order_id uuid, p_payment_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_tailor_paid_sdg(p_order_id uuid, p_payment_type text) TO anon;
GRANT ALL ON FUNCTION public.get_tailor_paid_sdg(p_order_id uuid, p_payment_type text) TO authenticated;
GRANT ALL ON FUNCTION public.get_tailor_paid_sdg(p_order_id uuid, p_payment_type text) TO service_role;


--
-- Name: FUNCTION journal_entries_apply_currency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.journal_entries_apply_currency() TO anon;
GRANT ALL ON FUNCTION public.journal_entries_apply_currency() TO authenticated;
GRANT ALL ON FUNCTION public.journal_entries_apply_currency() TO service_role;


--
-- Name: FUNCTION list_opening_stock_candidates(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_opening_stock_candidates() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_opening_stock_candidates() TO anon;
GRANT ALL ON FUNCTION public.list_opening_stock_candidates() TO authenticated;
GRANT ALL ON FUNCTION public.list_opening_stock_candidates() TO service_role;


--
-- Name: FUNCTION maintain_notifications(p_branch_id uuid, p_retention_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.maintain_notifications(p_branch_id uuid, p_retention_days integer) TO anon;
GRANT ALL ON FUNCTION public.maintain_notifications(p_branch_id uuid, p_retention_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.maintain_notifications(p_branch_id uuid, p_retention_days integer) TO service_role;


--
-- Name: FUNCTION normalize_whatsapp_number(p_number text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_whatsapp_number(p_number text) TO anon;
GRANT ALL ON FUNCTION public.normalize_whatsapp_number(p_number text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_whatsapp_number(p_number text) TO service_role;


--
-- Name: FUNCTION notify_variant_stock(p_variant_id uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_variant_stock(p_variant_id uuid, p_status text) TO anon;
GRANT ALL ON FUNCTION public.notify_variant_stock(p_variant_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.notify_variant_stock(p_variant_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION pay_tailor_commission(p_branch_id uuid, p_tailor_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_sales_order_id uuid, p_notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pay_tailor_commission(p_branch_id uuid, p_tailor_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_sales_order_id uuid, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.pay_tailor_commission(p_branch_id uuid, p_tailor_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_sales_order_id uuid, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.pay_tailor_commission(p_branch_id uuid, p_tailor_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_sales_order_id uuid, p_notes text) TO service_role;


--
-- Name: FUNCTION pay_tailor_payment(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_sales_order_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_currency text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pay_tailor_payment(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_sales_order_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_currency text) TO anon;
GRANT ALL ON FUNCTION public.pay_tailor_payment(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_sales_order_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_currency text) TO authenticated;
GRANT ALL ON FUNCTION public.pay_tailor_payment(p_branch_id uuid, p_user_id uuid, p_tailor_id uuid, p_sales_order_id uuid, p_amount numeric, p_payment_method text, p_notes text, p_currency text) TO service_role;


--
-- Name: FUNCTION prevent_exchange_rate_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_exchange_rate_mutation() TO anon;
GRANT ALL ON FUNCTION public.prevent_exchange_rate_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_exchange_rate_mutation() TO service_role;


--
-- Name: FUNCTION process_inventory_adjustment(p_variant_id uuid, p_user_id uuid, p_adjustment_type text, p_quantity numeric, p_notes text, p_entry_number text, p_amount numeric, p_payment_method text, p_branch_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_inventory_adjustment(p_variant_id uuid, p_user_id uuid, p_adjustment_type text, p_quantity numeric, p_notes text, p_entry_number text, p_amount numeric, p_payment_method text, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.process_inventory_adjustment(p_variant_id uuid, p_user_id uuid, p_adjustment_type text, p_quantity numeric, p_notes text, p_entry_number text, p_amount numeric, p_payment_method text, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.process_inventory_adjustment(p_variant_id uuid, p_user_id uuid, p_adjustment_type text, p_quantity numeric, p_notes text, p_entry_number text, p_amount numeric, p_payment_method text, p_branch_id uuid) TO service_role;


--
-- Name: FUNCTION process_purchase_order_receipt(po_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_purchase_order_receipt(po_id uuid) TO anon;
GRANT ALL ON FUNCTION public.process_purchase_order_receipt(po_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.process_purchase_order_receipt(po_id uuid) TO service_role;


--
-- Name: FUNCTION record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.record_opening_stock(p_branch_id uuid, p_user_id uuid, p_items jsonb, p_notes text) TO service_role;


--
-- Name: FUNCTION refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.refund_customer_advance(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_amount numeric, p_payment_method text, p_notes text) TO service_role;


--
-- Name: FUNCTION require_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.require_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.require_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.require_exchange_rate(p_branch_id uuid, p_as_of timestamp with time zone) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION sales_orders_apply_exchange_rate(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sales_orders_apply_exchange_rate() TO anon;
GRANT ALL ON FUNCTION public.sales_orders_apply_exchange_rate() TO authenticated;
GRANT ALL ON FUNCTION public.sales_orders_apply_exchange_rate() TO service_role;


--
-- Name: FUNCTION settle_tailor_fx(p_order_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_tailor_fx(p_order_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.settle_tailor_fx(p_order_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.settle_tailor_fx(p_order_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION snapshot_inventory_movement_cost(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snapshot_inventory_movement_cost() TO anon;
GRANT ALL ON FUNCTION public.snapshot_inventory_movement_cost() TO authenticated;
GRANT ALL ON FUNCTION public.snapshot_inventory_movement_cost() TO service_role;


--
-- Name: FUNCTION snapshot_journal_currency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snapshot_journal_currency() TO anon;
GRANT ALL ON FUNCTION public.snapshot_journal_currency() TO authenticated;
GRANT ALL ON FUNCTION public.snapshot_journal_currency() TO service_role;


--
-- Name: FUNCTION snapshot_sales_item_currency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snapshot_sales_item_currency() TO anon;
GRANT ALL ON FUNCTION public.snapshot_sales_item_currency() TO authenticated;
GRANT ALL ON FUNCTION public.snapshot_sales_item_currency() TO service_role;


--
-- Name: FUNCTION snapshot_sales_order_currency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snapshot_sales_order_currency() TO anon;
GRANT ALL ON FUNCTION public.snapshot_sales_order_currency() TO authenticated;
GRANT ALL ON FUNCTION public.snapshot_sales_order_currency() TO service_role;


--
-- Name: FUNCTION snapshot_sales_payment_currency(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snapshot_sales_payment_currency() TO anon;
GRANT ALL ON FUNCTION public.snapshot_sales_payment_currency() TO authenticated;
GRANT ALL ON FUNCTION public.snapshot_sales_payment_currency() TO service_role;


--
-- Name: FUNCTION stock_status(p_stock numeric, p_min numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.stock_status(p_stock numeric, p_min numeric) TO anon;
GRANT ALL ON FUNCTION public.stock_status(p_stock numeric, p_min numeric) TO authenticated;
GRANT ALL ON FUNCTION public.stock_status(p_stock numeric, p_min numeric) TO service_role;


--
-- Name: FUNCTION tailor_advances_exceed_cost(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tailor_advances_exceed_cost(p_order_id uuid) TO anon;
GRANT ALL ON FUNCTION public.tailor_advances_exceed_cost(p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tailor_advances_exceed_cost(p_order_id uuid) TO service_role;


--
-- Name: FUNCTION trg_product_variants_stock_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_product_variants_stock_notify() TO anon;
GRANT ALL ON FUNCTION public.trg_product_variants_stock_notify() TO authenticated;
GRANT ALL ON FUNCTION public.trg_product_variants_stock_notify() TO service_role;


--
-- Name: FUNCTION trg_sales_orders_resolve_delay(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_sales_orders_resolve_delay() TO anon;
GRANT ALL ON FUNCTION public.trg_sales_orders_resolve_delay() TO authenticated;
GRANT ALL ON FUNCTION public.trg_sales_orders_resolve_delay() TO service_role;


--
-- Name: FUNCTION trg_settle_tailor_fx_from_labor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_labor() TO anon;
GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_labor() TO authenticated;
GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_labor() TO service_role;


--
-- Name: FUNCTION trg_settle_tailor_fx_from_payment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_payment() TO anon;
GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_payment() TO authenticated;
GRANT ALL ON FUNCTION public.trg_settle_tailor_fx_from_payment() TO service_role;


--
-- Name: FUNCTION update_product(p_product_id uuid, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_product(p_product_id uuid, p_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_product(p_product_id uuid, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_product_id uuid, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.update_tailoring_order(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_tailoring_item_name text, p_tailoring_item_description text, p_tailor_id uuid, p_customer_name text, p_customer_whatsapp text, p_measurements jsonb, p_intake_date date, p_expected_delivery_date date, p_fabric_variant_id uuid, p_fabric_quantity numeric, p_total_amount numeric, p_tailoring_cost numeric, p_notes text) TO service_role;


--
-- Name: FUNCTION update_tailoring_order_status(p_order_id uuid, p_user_id uuid, p_branch_id uuid, p_new_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_tailoring_order_status(p_order_id uuid, p_user_id uuid, p_branch_id uuid, p_new_status text) TO anon;
GRANT ALL ON FUNCTION public.update_tailoring_order_status(p_order_id uuid, p_user_id uuid, p_branch_id uuid, p_new_status text) TO authenticated;
GRANT ALL ON FUNCTION public.update_tailoring_order_status(p_order_id uuid, p_user_id uuid, p_branch_id uuid, p_new_status text) TO service_role;


--
-- Name: FUNCTION update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text) TO anon;
GRANT ALL ON FUNCTION public.update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text) TO authenticated;
GRANT ALL ON FUNCTION public.update_tailoring_status(p_order_id uuid, p_branch_id uuid, p_user_id uuid, p_new_status text) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE _prisma_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._prisma_migrations TO anon;
GRANT ALL ON TABLE public._prisma_migrations TO authenticated;
GRANT ALL ON TABLE public._prisma_migrations TO service_role;


--
-- Name: TABLE assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.assets TO anon;
GRANT ALL ON TABLE public.assets TO authenticated;
GRANT ALL ON TABLE public.assets TO service_role;


--
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE inventory_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_movements TO anon;
GRANT ALL ON TABLE public.inventory_movements TO authenticated;
GRANT ALL ON TABLE public.inventory_movements TO service_role;


--
-- Name: TABLE journal_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_entries TO anon;
GRANT ALL ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE product_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_templates TO anon;
GRANT ALL ON TABLE public.product_templates TO authenticated;
GRANT ALL ON TABLE public.product_templates TO service_role;


--
-- Name: TABLE product_variants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_variants TO anon;
GRANT ALL ON TABLE public.product_variants TO authenticated;
GRANT ALL ON TABLE public.product_variants TO service_role;


--
-- Name: TABLE purchase_order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_order_items TO anon;
GRANT ALL ON TABLE public.purchase_order_items TO authenticated;
GRANT ALL ON TABLE public.purchase_order_items TO service_role;


--
-- Name: TABLE purchase_order_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_order_payments TO anon;
GRANT ALL ON TABLE public.purchase_order_payments TO authenticated;
GRANT ALL ON TABLE public.purchase_order_payments TO service_role;


--
-- Name: TABLE purchase_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;


--
-- Name: TABLE sales_order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales_order_items TO anon;
GRANT ALL ON TABLE public.sales_order_items TO authenticated;
GRANT ALL ON TABLE public.sales_order_items TO service_role;


--
-- Name: TABLE sales_order_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales_order_payments TO anon;
GRANT ALL ON TABLE public.sales_order_payments TO authenticated;
GRANT ALL ON TABLE public.sales_order_payments TO service_role;


--
-- Name: TABLE sales_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales_orders TO anon;
GRANT ALL ON TABLE public.sales_orders TO authenticated;
GRANT ALL ON TABLE public.sales_orders TO service_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suppliers TO anon;
GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;


--
-- Name: TABLE tailor_commission_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tailor_commission_payments TO anon;
GRANT ALL ON TABLE public.tailor_commission_payments TO authenticated;
GRANT ALL ON TABLE public.tailor_commission_payments TO service_role;


--
-- Name: TABLE tailoring_customer_advance_refunds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tailoring_customer_advance_refunds TO anon;
GRANT ALL ON TABLE public.tailoring_customer_advance_refunds TO authenticated;
GRANT ALL ON TABLE public.tailoring_customer_advance_refunds TO service_role;


--
-- Name: TABLE tailoring_customer_advance_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tailoring_customer_advance_transfers TO anon;
GRANT ALL ON TABLE public.tailoring_customer_advance_transfers TO authenticated;
GRANT ALL ON TABLE public.tailoring_customer_advance_transfers TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict wkd5K1gYZh9JVUP7SeAYVaRDRlEzjgm2ctM5zv9xftUNwG2xyerxe4hSusR0Itg


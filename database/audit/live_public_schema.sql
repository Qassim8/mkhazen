--
-- PostgreSQL database dump
--

-- \restrict klGpgA11uz1gMAIRheDyzxKKbtrZyVFva2boIQDdZDlBwoQYj2rUeZ8nRZroSHN

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: Role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."Role" AS ENUM (
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


ALTER TYPE "public"."Role" OWNER TO "postgres";

--
-- Name: system_manager; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."system_manager" AS ENUM (
    'manager'
);


ALTER TYPE "public"."system_manager" OWNER TO "postgres";

--
-- Name: calculate_tailoring_measurement_meters("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_tailoring_measurement_meters"("p_measurements" "jsonb") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
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


ALTER FUNCTION "public"."calculate_tailoring_measurement_meters"("p_measurements" "jsonb") OWNER TO "postgres";

--
-- Name: cancel_tailoring_order("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";

--
-- Name: check_overdue_tailoring_orders("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_overdue_tailoring_orders"("p_branch_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.generate_overdue_tailoring_notifications(p_branch_id);
$$;


ALTER FUNCTION "public"."check_overdue_tailoring_orders"("p_branch_id" "uuid") OWNER TO "postgres";

--
-- Name: complete_sales_checkout("uuid", "uuid", "text", "uuid", "uuid", numeric, numeric, "text", "jsonb", "text", "jsonb", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric) OWNER TO "postgres";

--
-- Name: complete_tailoring_pickup("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") OWNER TO "postgres";

--
-- Name: complete_tailoring_production("uuid", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") OWNER TO "postgres";

--
-- Name: convert_tailoring_to_product("uuid", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") OWNER TO "postgres";

--
-- Name: create_asset_with_journal_entry("uuid", "uuid", "text", "text", numeric, "text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text" DEFAULT 'USD'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text") OWNER TO "postgres";

--
-- Name: create_product("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_product"("p_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_product"("p_payload" "jsonb") OWNER TO "postgres";

--
-- Name: create_tailoring_order("uuid", "uuid", "uuid", "text", "text", "text", "jsonb", "date", "date", "uuid", numeric, numeric, numeric, numeric, "text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: create_tailoring_overdue_notifications("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_tailoring_overdue_notifications"("p_branch_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.generate_overdue_tailoring_notifications(p_branch_id);
$$;


ALTER FUNCTION "public"."create_tailoring_overdue_notifications"("p_branch_id" "uuid") OWNER TO "postgres";

--
-- Name: exchange_currency("uuid", "uuid", "text", "text", numeric, "text", numeric, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text") OWNER TO "postgres";

--
-- Name: generate_overdue_tailoring_notifications("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_overdue_tailoring_notifications"("p_branch_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_overdue_tailoring_notifications"("p_branch_id" "uuid") OWNER TO "postgres";

--
-- Name: generate_product_barcode(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_product_barcode"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_product_barcode"() OWNER TO "postgres";

--
-- Name: generate_product_sku(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_product_sku"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_product_sku"() OWNER TO "postgres";

--
-- Name: get_account_balance("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text") RETURNS numeric
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text") OWNER TO "postgres";

--
-- Name: get_current_exchange_rate("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone DEFAULT "now"()) RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  select rate
  from public.exchange_rates
  where branch_id = p_branch_id
    and effective_at <= p_as_of
  order by effective_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."exchange_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "rate" numeric(14,4) NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exchange_rates_rate_check" CHECK (("rate" > (0)::numeric))
);


ALTER TABLE "public"."exchange_rates" OWNER TO "postgres";

--
-- Name: TABLE "exchange_rates"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."exchange_rates" IS 'سجل يدوي غير قابل للتعديل لسعر السوق: عدد الجنيهات السودانية مقابل دولار واحد.';


--
-- Name: get_effective_exchange_rate("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."exchange_rates"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_order_advance_rate("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid") OWNER TO "postgres";

--
-- Name: get_tailor_cost_sdg("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_tailor_cost_sdg"("p_order_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  SELECT round(COALESCE(
    tailoring_cost_sdg,
    tailoring_cost * exchange_rate_used,
    0
  ), 2)
  FROM public.sales_orders
  WHERE id = p_order_id;
$$;


ALTER FUNCTION "public"."get_tailor_cost_sdg"("p_order_id" "uuid") OWNER TO "postgres";

--
-- Name: get_tailor_paid_sdg("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text" DEFAULT NULL::"text") RETURNS numeric
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text") OWNER TO "postgres";

--
-- Name: journal_entries_apply_currency(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."journal_entries_apply_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."journal_entries_apply_currency"() OWNER TO "postgres";

--
-- Name: list_opening_stock_candidates(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."list_opening_stock_candidates"() RETURNS TABLE("id" "uuid", "template_id" "uuid", "product_name" "text", "sku" "text", "barcode" "text", "color_name" "text", "size" "text", "selling_unit" "text", "selling_price" numeric, "purchase_price" numeric, "average_cost" numeric, "min_stock_level" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."list_opening_stock_candidates"() OWNER TO "postgres";

--
-- Name: maintain_notifications("uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer) OWNER TO "postgres";

--
-- Name: normalize_whatsapp_number("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."normalize_whatsapp_number"("p_number" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
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


ALTER FUNCTION "public"."normalize_whatsapp_number"("p_number" "text") OWNER TO "postgres";

--
-- Name: notify_variant_stock("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."notify_variant_stock"("p_variant_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."notify_variant_stock"("p_variant_id" "uuid", "p_status" "text") OWNER TO "postgres";

--
-- Name: pay_tailor_commission("uuid", "uuid", "uuid", numeric, "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid", "p_notes" "text") OWNER TO "postgres";

--
-- Name: pay_tailor_payment("uuid", "uuid", "uuid", "uuid", numeric, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text" DEFAULT 'SDG'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text") OWNER TO "postgres";

--
-- Name: prevent_exchange_rate_mutation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."prevent_exchange_rate_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'لا يمكن تعديل أو حذف سعر صرف مسجل. أضف سعراً جديداً بتاريخ سريان صحيح.';
end;
$$;


ALTER FUNCTION "public"."prevent_exchange_rate_mutation"() OWNER TO "postgres";

--
-- Name: process_inventory_adjustment("uuid", "uuid", "text", numeric, "text", "text", numeric, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid") OWNER TO "postgres";

--
-- Name: process_purchase_order_receipt("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") OWNER TO "postgres";

--
-- Name: record_opening_stock("uuid", "uuid", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text") OWNER TO "postgres";

--
-- Name: refund_customer_advance("uuid", "uuid", "uuid", numeric, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: require_exchange_rate("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone DEFAULT "now"()) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) OWNER TO "postgres";

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
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


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

--
-- Name: sales_orders_apply_exchange_rate(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sales_orders_apply_exchange_rate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."sales_orders_apply_exchange_rate"() OWNER TO "postgres";

--
-- Name: settle_tailor_fx("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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


ALTER FUNCTION "public"."settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: snapshot_inventory_movement_cost(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."snapshot_inventory_movement_cost"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.unit_cost_usd := COALESCE(NEW.unit_cost_usd, NEW.unit_cost, 0);
  NEW.total_cost_usd := round(NEW.quantity * NEW.unit_cost_usd, 2);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."snapshot_inventory_movement_cost"() OWNER TO "postgres";

--
-- Name: snapshot_journal_currency(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."snapshot_journal_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."snapshot_journal_currency"() OWNER TO "postgres";

--
-- Name: snapshot_sales_item_currency(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."snapshot_sales_item_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."snapshot_sales_item_currency"() OWNER TO "postgres";

--
-- Name: snapshot_sales_order_currency(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."snapshot_sales_order_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."snapshot_sales_order_currency"() OWNER TO "postgres";

--
-- Name: snapshot_sales_payment_currency(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."snapshot_sales_payment_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."snapshot_sales_payment_currency"() OWNER TO "postgres";

--
-- Name: stock_status(numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."stock_status"("p_stock" numeric, "p_min" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN COALESCE(p_stock, 0) <= 0 THEN 'OUT'
    WHEN COALESCE(p_stock, 0) <= COALESCE(p_min, 0) THEN 'LOW'
    ELSE 'OK'
  END;
$$;


ALTER FUNCTION "public"."stock_status"("p_stock" numeric, "p_min" numeric) OWNER TO "postgres";

--
-- Name: tailor_advances_exceed_cost("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."tailor_advances_exceed_cost"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.get_tailor_paid_sdg(p_order_id, 'ADVANCE')
       > public.get_tailor_cost_sdg(p_order_id) + 0.01;
$$;


ALTER FUNCTION "public"."tailor_advances_exceed_cost"("p_order_id" "uuid") OWNER TO "postgres";

--
-- Name: trg_product_variants_stock_notify(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_product_variants_stock_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_product_variants_stock_notify"() OWNER TO "postgres";

--
-- Name: trg_sales_orders_resolve_delay(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_sales_orders_resolve_delay"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_sales_orders_resolve_delay"() OWNER TO "postgres";

--
-- Name: trg_settle_tailor_fx_from_labor(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_settle_tailor_fx_from_labor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."trg_settle_tailor_fx_from_labor"() OWNER TO "postgres";

--
-- Name: trg_settle_tailor_fx_from_payment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_settle_tailor_fx_from_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.sales_order_id IS NOT NULL THEN
    PERFORM public.settle_tailor_fx(NEW.sales_order_id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_settle_tailor_fx_from_payment"() OWNER TO "postgres";

--
-- Name: update_product("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_product"("p_product_id" "uuid", "p_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_product"("p_product_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";

--
-- Name: update_tailoring_order("uuid", "uuid", "uuid", "text", "text", "uuid", "text", "text", "jsonb", "date", "date", "uuid", numeric, numeric, numeric, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") OWNER TO "postgres";

--
-- Name: update_tailoring_order_status("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") OWNER TO "postgres";

--
-- Name: update_tailoring_status("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW."updatedAt" = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
    "id" character varying(36) NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) NOT NULL,
    "logs" "text",
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_steps_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."_prisma_migrations" OWNER TO "postgres";

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" character varying(255) NOT NULL,
    "category" character varying(50) NOT NULL,
    "purchase_value" numeric(12,2) NOT NULL,
    "purchase_date" "date" NOT NULL,
    "payment_method" character varying(10) NOT NULL,
    "reference" character varying(100),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "exchange_rate_used" numeric(14,4),
    "purchase_value_usd" numeric(14,2),
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "purchase_value_sdg" numeric(20,2),
    CONSTRAINT "assets_currency_check" CHECK (("currency" = ANY (ARRAY['USD'::"text", 'SDG'::"text"]))),
    CONSTRAINT "assets_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['CASH'::character varying, 'BANK'::character varying])::"text"[]))),
    CONSTRAINT "assets_value_check" CHECK (("purchase_value" > (0)::numeric))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";

--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "createdAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE "public"."branches" OWNER TO "postgres";

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "imageUrl" "text",
    "createdAt" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "whatsapp_number" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "measurements" "jsonb",
    CONSTRAINT "customers_measurements_array_check" CHECK ((("measurements" IS NULL) OR ("jsonb_typeof"("measurements") = 'array'::"text")))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";

--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "purchase_order_id" "uuid",
    "movement_type" character varying(30) NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "reference" character varying(100),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sales_order_id" "uuid",
    "unit_cost_usd" numeric(20,6),
    "total_cost_usd" numeric(20,2),
    CONSTRAINT "inventory_movements_movement_type_check" CHECK ((("movement_type")::"text" = ANY ('{PURCHASE,SALE,PURCHASE_RETURN,SALE_RETURN,ADJUSTMENT_IN,ADJUSTMENT_OUT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,GIFT,OPENING_STOCK}'::"text"[]))),
    CONSTRAINT "inventory_movements_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "inventory_movements_single_source_check" CHECK ((NOT (("purchase_order_id" IS NOT NULL) AND ("sales_order_id" IS NOT NULL)))),
    CONSTRAINT "inventory_movements_type_check" CHECK ((("movement_type")::"text" = ANY ('{ADJUSTMENT_IN,ADJUSTMENT_OUT,GIFT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,PURCHASE,PURCHASE_RETURN,SALE,SALE_RETURN,TAILORING,OPENING_STOCK}'::"text"[]))),
    CONSTRAINT "inventory_movements_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_number" character varying(50) NOT NULL,
    "purchase_order_id" "uuid",
    "created_by" "uuid",
    "branch_id" "uuid" NOT NULL,
    "entry_type" character varying(30) NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "description" "text",
    "debit_account" character varying(100) NOT NULL,
    "credit_account" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference" character varying(100),
    "sales_order_id" "uuid",
    "currency" "text" NOT NULL,
    "exchange_rate_used" numeric(14,4),
    "amount_usd" numeric(14,2) NOT NULL,
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "source_currency" "text",
    "amount_sdg" numeric(20,2),
    CONSTRAINT "journal_entries_accounts_check" CHECK ((("debit_account")::"text" <> ("credit_account")::"text")),
    CONSTRAINT "journal_entries_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "journal_entries_currency_check" CHECK (("currency" = ANY (ARRAY['USD'::"text", 'SDG'::"text"]))),
    CONSTRAINT "journal_entries_currency_consistency_check" CHECK (((("currency" = 'USD'::"text") AND ("amount_usd" = "amount")) OR (("currency" = 'SDG'::"text") AND ("exchange_rate_used" > (0)::numeric) AND ("amount_usd" >= (0)::numeric)))),
    CONSTRAINT "journal_entries_entry_type_check" CHECK ((("entry_type")::"text" = ANY ((ARRAY['CAPITAL'::character varying, 'PURCHASE'::character varying, 'PURCHASE_PAYMENT'::character varying, 'SALE'::character varying, 'SALE_PAYMENT'::character varying, 'CUSTOMER_ADVANCE'::character varying, 'CUSTOMER_ADVANCE_REFUND'::character varying, 'TAILOR_ADVANCE'::character varying, 'TAILOR_ADVANCE_APPLICATION'::character varying, 'TAILOR_COST'::character varying, 'TAILOR_PAYMENT'::character varying, 'TAILORING_MATERIAL'::character varying, 'PRODUCTION'::character varying, 'COGS'::character varying, 'EXPENSE'::character varying, 'ASSET'::character varying, 'INVENTORY_ADJUSTMENT'::character varying, 'SALES_RETURN'::character varying, 'OTHER'::character varying, 'CURRENCY_EXCHANGE'::character varying, 'GIFT'::character varying])::"text"[]))),
    CONSTRAINT "journal_entries_source_currency_check" CHECK (("source_currency" = ANY (ARRAY['SDG'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'SYSTEM'::"text" NOT NULL,
    "link" "text",
    "isRead" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_roles" "text"[]
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: product_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "categoryId" "uuid",
    "supplierId" "uuid",
    "hasVariants" boolean DEFAULT false NOT NULL,
    "purchaseUnit" "text",
    "sellingUnit" "text",
    "conversionFactor" numeric DEFAULT 1,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "isActive" boolean DEFAULT true NOT NULL,
    "isVisible" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "updatedAt" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_templates_conversion_factor_check" CHECK ((("conversionFactor" IS NULL) OR ("conversionFactor" > (0)::numeric)))
);


ALTER TABLE "public"."product_templates" OWNER TO "postgres";

--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "templateId" "uuid" NOT NULL,
    "sku" character varying(100),
    "barcode" character varying(100),
    "packBarcode" character varying(100),
    "colorName" "text",
    "colorCode" "text",
    "size" "text",
    "length" numeric(10,2),
    "width" numeric(10,2),
    "purchasePrice" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "sellingPrice" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "minSellingPrice" numeric(12,2) DEFAULT 0.00,
    "stockQuantity" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "minStockLevel" numeric(12,2) DEFAULT 5.00,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "isDefault" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "updatedAt" timestamp with time zone DEFAULT "now"(),
    "averageCost" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "product_variants_average_cost_check" CHECK (("averageCost" >= (0)::numeric)),
    CONSTRAINT "product_variants_length_check" CHECK ((("length" IS NULL) OR ("length" >= (0)::numeric))),
    CONSTRAINT "product_variants_min_selling_le_selling_check" CHECK ((("minSellingPrice" IS NULL) OR ("minSellingPrice" <= "sellingPrice"))),
    CONSTRAINT "product_variants_min_selling_price_check" CHECK ((("minSellingPrice" IS NULL) OR ("minSellingPrice" >= (0)::numeric))),
    CONSTRAINT "product_variants_min_stock_level_check" CHECK ((("minStockLevel" IS NULL) OR ("minStockLevel" >= (0)::numeric))),
    CONSTRAINT "product_variants_purchase_price_check" CHECK (("purchasePrice" >= (0)::numeric)),
    CONSTRAINT "product_variants_selling_price_check" CHECK (("sellingPrice" >= (0)::numeric)),
    CONSTRAINT "product_variants_stock_quantity_check" CHECK (("stockQuantity" >= (0)::numeric)),
    CONSTRAINT "product_variants_width_check" CHECK ((("width" IS NULL) OR ("width" >= (0)::numeric)))
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";

--
-- Name: COLUMN "product_variants"."purchasePrice"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_variants"."purchasePrice" IS 'آخر تكلفة شراء بوحدة الشراء بالدولار (USD).';


--
-- Name: COLUMN "product_variants"."sellingPrice"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_variants"."sellingPrice" IS 'سعر البيع بالجنيه السوداني (SDG).';


--
-- Name: COLUMN "product_variants"."minSellingPrice"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_variants"."minSellingPrice" IS 'أدنى سعر بيع بالجنيه السوداني (SDG).';


--
-- Name: COLUMN "product_variants"."averageCost"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_variants"."averageCost" IS 'متوسط التكلفة المرجّح بوحدة البيع بالدولار (USD).';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "received_quantity" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "unit_cost" numeric(12,2) NOT NULL,
    "allocated_delivery_cost" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "effective_unit_cost" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "unit_cost_usd" numeric(20,6),
    "effective_unit_cost_usd" numeric(20,6),
    "subtotal_usd" numeric(20,2),
    CONSTRAINT "purchase_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "purchase_order_items_received_quantity_check" CHECK ((("received_quantity" >= (0)::numeric) AND ("received_quantity" <= "quantity"))),
    CONSTRAINT "purchase_order_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "purchase_order_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";

--
-- Name: purchase_order_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."purchase_order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "payment_method" character varying(30),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reference" character varying(100),
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "amount_usd" numeric(20,2),
    "amount_sdg" numeric(20,2),
    CONSTRAINT "purchase_order_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."purchase_order_payments" OWNER TO "postgres";

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(50) NOT NULL,
    "supplier_id" "uuid",
    "status" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    "purchase_type" character varying(20) DEFAULT 'WORKFLOW'::character varying NOT NULL,
    "order_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expected_date" "date",
    "subtotal" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "delivery_cost" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "received_by" "uuid",
    "journal_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "subtotal_usd" numeric(20,2),
    "delivery_cost_usd" numeric(20,2),
    "discount_amount_usd" numeric(20,2),
    "total_amount_usd" numeric(20,2),
    "total_amount_sdg" numeric(20,2),
    CONSTRAINT "purchase_orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['DRAFT'::character varying, 'APPROVED'::character varying, 'RECEIVED'::character varying, 'CANCELLED'::character varying])::"text"[]))),
    CONSTRAINT "purchase_orders_type_check" CHECK ((("purchase_type")::"text" = ANY ((ARRAY['DIRECT'::character varying, 'WORKFLOW'::character varying])::"text"[])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";

--
-- Name: sales_order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sales_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_order_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "total_price" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_gift" boolean DEFAULT false NOT NULL,
    "gift_note" "text",
    "unit_price_usd" numeric(14,2),
    "total_price_usd" numeric(14,2),
    "unit_price_sdg" numeric(20,2),
    "total_price_sdg" numeric(20,2),
    "revenue_usd" numeric(20,2),
    "unit_cost_usd" numeric(20,6),
    "total_cost_usd" numeric(20,2),
    CONSTRAINT "sales_order_items_gift_note_check" CHECK ((("char_length"("gift_note") <= 500) AND (("is_gift" = true) OR ("gift_note" IS NULL)))),
    CONSTRAINT "sales_order_items_gift_price_check" CHECK ((("is_gift" = false) OR (("unit_price" = (0)::numeric) AND ("total_price" = (0)::numeric)))),
    CONSTRAINT "sales_order_items_prices_check" CHECK ((("unit_price" >= (0)::numeric) AND ("unit_cost" >= (0)::numeric) AND ("total_price" >= (0)::numeric))),
    CONSTRAINT "sales_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "sales_order_items_quantity_positive_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "sales_order_items_total_price_check" CHECK (("total_price" = "round"(("quantity" * "unit_price"), 2)))
);


ALTER TABLE "public"."sales_order_items" OWNER TO "postgres";

--
-- Name: sales_order_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sales_order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" character varying(30) NOT NULL,
    "reference" character varying(100),
    "notes" "text",
    "created_by" "uuid",
    "journal_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "amount_sdg" numeric(20,2),
    "amount_usd" numeric(20,2),
    CONSTRAINT "sales_order_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "sales_order_payments_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying])::"text"[])))
);


ALTER TABLE "public"."sales_order_payments" OWNER TO "postgres";

--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(50) NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "cashier_id" "uuid",
    "subtotal" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "payment_method" character varying(30) DEFAULT 'CASH'::character varying NOT NULL,
    "payment_status" character varying(30) DEFAULT 'PAID'::character varying NOT NULL,
    "status" character varying(30) DEFAULT 'COMPLETED'::character varying NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_type" character varying(20) DEFAULT 'POS'::character varying NOT NULL,
    "customer_id" "uuid",
    "tailor_id" "uuid",
    "sales_journal_entry_id" "uuid",
    "cogs_journal_entry_id" "uuid",
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tailoring_status" "text",
    "intake_date" "date",
    "expected_delivery_date" "date",
    "measurements" "jsonb",
    "fabric_variant_id" "uuid",
    "fabric_quantity" numeric(12,2),
    "tailoring_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "tailoring_cogs_journal_entry_id" "uuid",
    "tailoring_purpose" "text" DEFAULT 'CUSTOMER'::"text" NOT NULL,
    "tailoring_fabric_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "produced_product_template_id" "uuid",
    "produced_product_variant_id" "uuid",
    "produced_quantity" numeric(12,2),
    "production_total_cost" numeric(12,2),
    "production_material_journal_entry_id" "uuid",
    "production_labor_journal_entry_id" "uuid",
    "production_inventory_journal_entry_id" "uuid",
    "tailoring_material_journal_entry_id" "uuid",
    "tailoring_labor_journal_entry_id" "uuid",
    "customer_advance_journal_entry_id" "uuid",
    "customer_advance_recognition_journal_entry_id" "uuid",
    "tailoring_item_name" "text",
    "tailoring_item_description" "text",
    "cancellation_reason" "text",
    "converted_to_product_at" timestamp with time zone,
    "subtotal_usd" numeric(14,2),
    "total_amount_usd" numeric(14,2),
    "exchange_rate_used" numeric(14,4),
    "tailoring_cost_sdg" numeric(14,2),
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "subtotal_sdg" numeric(20,2),
    "discount_amount_sdg" numeric(20,2),
    "tax_amount_sdg" numeric(20,2),
    "total_amount_sdg" numeric(20,2),
    "discount_amount_usd" numeric(20,2),
    "tax_amount_usd" numeric(20,2),
    CONSTRAINT "sales_orders_amounts_check" CHECK ((("subtotal" >= (0)::numeric) AND ("discount_amount" >= (0)::numeric) AND ("tax_amount" >= (0)::numeric) AND ("total_amount" >= (0)::numeric))),
    CONSTRAINT "sales_orders_amounts_consistency_check" CHECK (("total_amount" = (("subtotal" - "discount_amount") + "tax_amount"))),
    CONSTRAINT "sales_orders_discount_check" CHECK (("discount_amount" <= "subtotal")),
    CONSTRAINT "sales_orders_fabric_quantity_check" CHECK ((("fabric_quantity" IS NULL) OR ("fabric_quantity" > (0)::numeric))),
    CONSTRAINT "sales_orders_order_type_check" CHECK ((("order_type")::"text" = ANY ((ARRAY['POS'::character varying, 'TAILORING'::character varying])::"text"[]))),
    CONSTRAINT "sales_orders_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying, 'MIXED'::character varying])::"text"[]))),
    CONSTRAINT "sales_orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying])::"text"[]))),
    CONSTRAINT "sales_orders_produced_quantity_check" CHECK ((("produced_quantity" IS NULL) OR ("produced_quantity" > (0)::numeric))),
    CONSTRAINT "sales_orders_production_total_cost_check" CHECK ((("production_total_cost" IS NULL) OR ("production_total_cost" >= (0)::numeric))),
    CONSTRAINT "sales_orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'RETURNED'::character varying])::"text"[]))),
    CONSTRAINT "sales_orders_tailoring_cost_check" CHECK (("tailoring_cost" >= (0)::numeric)),
    CONSTRAINT "sales_orders_tailoring_fabric_cost_check" CHECK (("tailoring_fabric_cost" >= (0)::numeric)),
    CONSTRAINT "sales_orders_tailoring_purpose_check" CHECK (("tailoring_purpose" = ANY (ARRAY['CUSTOMER'::"text", 'PRODUCTION'::"text"]))),
    CONSTRAINT "sales_orders_tailoring_status_check" CHECK ((("tailoring_status" IS NULL) OR ("tailoring_status" = ANY (ARRAY['NEW'::"text", 'UNDER_TAILORING'::"text", 'READY_FOR_PICKUP'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"]))))
);


ALTER TABLE "public"."sales_orders" OWNER TO "postgres";

--
-- Name: COLUMN "sales_orders"."tailoring_material_journal_entry_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sales_orders"."tailoring_material_journal_entry_id" IS 'قيد تحويل قماش الطلب من المخزون إلى إنتاج تحت التشغيل عند بدء التفصيل';


--
-- Name: COLUMN "sales_orders"."tailoring_labor_journal_entry_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sales_orders"."tailoring_labor_journal_entry_id" IS 'قيد إثبات تكلفة الخياط كالتزام عند اكتمال الطلب أو استلام الإنتاج';


--
-- Name: COLUMN "sales_orders"."customer_advance_journal_entry_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sales_orders"."customer_advance_journal_entry_id" IS 'قيد استلام عربون العميل كالتزام CUSTOMER_ADVANCES قبل تحقق الإيراد';


--
-- Name: COLUMN "sales_orders"."customer_advance_recognition_journal_entry_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sales_orders"."customer_advance_recognition_journal_entry_id" IS 'قيد تحويل رصيد عربون العميل إلى المبيعات عند استلام الطلب';


--
-- Name: COLUMN "sales_orders"."tailoring_item_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."sales_orders"."tailoring_item_name" IS 'اسم العمل/القطعة محل التفصيل، ويجب أن يكون واضحاً للموظف والعميل';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "contactPerson" "text",
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"(),
    "updatedAt" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";

--
-- Name: tailor_commission_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tailor_commission_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "tailor_id" "uuid" NOT NULL,
    "sales_order_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "notes" "text",
    "journal_entry_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_type" "text" DEFAULT 'SETTLEMENT'::"text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "amount_original" numeric(14,2),
    "exchange_rate_used" numeric(14,4),
    "exchange_rate_id" "uuid",
    "exchange_rate_sdg_per_usd" numeric(20,6),
    "amount_sdg" numeric(20,2),
    "amount_usd" numeric(20,2),
    CONSTRAINT "tailor_commission_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "tailor_commission_payments_currency_check" CHECK (("currency" = ANY (ARRAY['USD'::"text", 'SDG'::"text"]))),
    CONSTRAINT "tailor_commission_payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'BANK'::"text"]))),
    CONSTRAINT "tailor_commission_payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['ADVANCE'::"text", 'SETTLEMENT'::"text"])))
);


ALTER TABLE "public"."tailor_commission_payments" OWNER TO "postgres";

--
-- Name: COLUMN "tailor_commission_payments"."payment_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."tailor_commission_payments"."payment_type" IS 'ADVANCE = دفع مقدم للخياط قبل إثبات تكلفة العمل; SETTLEMENT = سداد لمستحق مثبت';


--
-- Name: tailoring_customer_advance_refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tailoring_customer_advance_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "journal_entry_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "tailoring_customer_advance_refunds_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "tailoring_customer_advance_refunds_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'BANK_TRANSFER'::"text"])))
);


ALTER TABLE "public"."tailoring_customer_advance_refunds" OWNER TO "postgres";

--
-- Name: TABLE "tailoring_customer_advance_refunds"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."tailoring_customer_advance_refunds" IS 'استردادات أرصدة عربون العملاء من الطلبات الملغاة';


--
-- Name: tailoring_customer_advance_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tailoring_customer_advance_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_order_id" "uuid" NOT NULL,
    "to_order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "tailoring_customer_advance_transfers_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "tailoring_customer_advance_transfers_different_orders" CHECK (("from_order_id" <> "to_order_id"))
);


ALTER TABLE "public"."tailoring_customer_advance_transfers" OWNER TO "postgres";

--
-- Name: TABLE "tailoring_customer_advance_transfers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."tailoring_customer_advance_transfers" IS 'تخصيص رصيد عربون موجود من طلب عميل ملغي إلى طلب عميل بديل بدون حركة نقدية جديدة';


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "role" "public"."Role" DEFAULT 'CASHIER'::"public"."Role" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isPasswordChanged" boolean DEFAULT false NOT NULL,
    "salary" double precision,
    "shift" "text",
    "phone" "text",
    "createdAt" timestamp(3) without time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "position" "text",
    "branchId" "uuid",
    "commissionRate" numeric DEFAULT 50,
    "resetRequested" boolean DEFAULT false
);


ALTER TABLE "public"."users" OWNER TO "postgres";

--
-- Name: branches Branch_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "Branch_pkey" PRIMARY KEY ("id");


--
-- Name: users User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."_prisma_migrations"
    ADD CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id");


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");


--
-- Name: categories categories_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_unique" UNIQUE ("name");


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");


--
-- Name: customers customers_whatsapp_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_whatsapp_unique" UNIQUE ("branch_id", "whatsapp_number");


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");


--
-- Name: journal_entries journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_entry_number_key" UNIQUE ("entry_number");


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: product_templates product_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_pkey" PRIMARY KEY ("id");


--
-- Name: product_variants product_variants_barcode_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_barcode_key" UNIQUE ("barcode");


--
-- Name: product_variants product_variants_pack_barcode_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pack_barcode_key" UNIQUE ("packBarcode");


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");


--
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");


--
-- Name: purchase_order_payments purchase_order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "purchase_order_payments_pkey" PRIMARY KEY ("id");


--
-- Name: purchase_orders purchase_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_order_number_key" UNIQUE ("order_number");


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");


--
-- Name: sales_order_items sales_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id");


--
-- Name: sales_order_payments sales_order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_payments"
    ADD CONSTRAINT "sales_order_payments_pkey" PRIMARY KEY ("id");


--
-- Name: sales_orders sales_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_order_number_key" UNIQUE ("order_number");


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id");


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: tailor_commission_payments tailor_commission_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_pkey" PRIMARY KEY ("id");


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_refunds"
    ADD CONSTRAINT "tailoring_customer_advance_refunds_pkey" PRIMARY KEY ("id");


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_transfers"
    ADD CONSTRAINT "tailoring_customer_advance_transfers_pkey" PRIMARY KEY ("id");


--
-- Name: Branch_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Branch_code_key" ON "public"."branches" USING "btree" ("code");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_email_idx" ON "public"."users" USING "btree" ("email");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON "public"."users" USING "btree" ("email");


--
-- Name: exchange_rates_branch_effective_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "exchange_rates_branch_effective_idx" ON "public"."exchange_rates" USING "btree" ("branch_id", "effective_at" DESC);


--
-- Name: idx_assets_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assets_branch" ON "public"."assets" USING "btree" ("branch_id");


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assets_category" ON "public"."assets" USING "btree" ("category");


--
-- Name: idx_assets_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assets_created_at" ON "public"."assets" USING "btree" ("created_at" DESC);


--
-- Name: idx_customers_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_customers_branch" ON "public"."customers" USING "btree" ("branch_id");


--
-- Name: idx_customers_whatsapp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_customers_whatsapp" ON "public"."customers" USING "btree" ("whatsapp_number");


--
-- Name: idx_exchange_rates_branch_effective; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_exchange_rates_branch_effective" ON "public"."exchange_rates" USING "btree" ("branch_id", "effective_at" DESC);


--
-- Name: idx_inv_mov_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inv_mov_created_at" ON "public"."inventory_movements" USING "btree" ("created_at" DESC);


--
-- Name: idx_inv_mov_purchase_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inv_mov_purchase_order" ON "public"."inventory_movements" USING "btree" ("purchase_order_id");


--
-- Name: idx_inv_mov_sales_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inv_mov_sales_order" ON "public"."inventory_movements" USING "btree" ("sales_order_id");


--
-- Name: idx_inv_mov_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inv_mov_variant" ON "public"."inventory_movements" USING "btree" ("variant_id");


--
-- Name: idx_inv_mov_variant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inv_mov_variant_created" ON "public"."inventory_movements" USING "btree" ("variant_id", "created_at" DESC);


--
-- Name: idx_inventory_movements_sales_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_movements_sales_order" ON "public"."inventory_movements" USING "btree" ("sales_order_id");


--
-- Name: idx_journal_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_branch" ON "public"."journal_entries" USING "btree" ("branch_id");


--
-- Name: idx_journal_branch_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_branch_created" ON "public"."journal_entries" USING "btree" ("branch_id", "created_at" DESC);


--
-- Name: idx_journal_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_created_at" ON "public"."journal_entries" USING "btree" ("created_at" DESC);


--
-- Name: idx_journal_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_created_by" ON "public"."journal_entries" USING "btree" ("created_by");


--
-- Name: idx_journal_entries_currency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_entries_currency" ON "public"."journal_entries" USING "btree" ("branch_id", "currency");


--
-- Name: idx_journal_entry_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_entry_type" ON "public"."journal_entries" USING "btree" ("entry_type");


--
-- Name: idx_journal_purchase_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_purchase_order" ON "public"."journal_entries" USING "btree" ("purchase_order_id");


--
-- Name: idx_journal_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_reference" ON "public"."journal_entries" USING "btree" ("reference");


--
-- Name: idx_journal_sales_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journal_sales_order" ON "public"."journal_entries" USING "btree" ("sales_order_id");


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_notifications_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_key" ON "public"."notifications" USING "btree" ((("metadata" ->> 'key'::"text")));


--
-- Name: idx_notifications_target_roles; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_target_roles" ON "public"."notifications" USING "gin" ("target_roles");


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("isRead") WHERE ("isRead" = false);


--
-- Name: idx_one_default_variant_per_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_one_default_variant_per_template" ON "public"."product_variants" USING "btree" ("templateId") WHERE ("isDefault" = true);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_po_status" ON "public"."purchase_orders" USING "btree" ("status");


--
-- Name: idx_po_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_po_supplier" ON "public"."purchase_orders" USING "btree" ("supplier_id");


--
-- Name: idx_poi_po; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_poi_po" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id");


--
-- Name: idx_poi_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_poi_template" ON "public"."purchase_order_items" USING "btree" ("template_id");


--
-- Name: idx_poi_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_poi_variant" ON "public"."purchase_order_items" USING "btree" ("variant_id");


--
-- Name: idx_pop_purchase_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pop_purchase_order" ON "public"."purchase_order_payments" USING "btree" ("purchase_order_id");


--
-- Name: idx_pop_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pop_reference" ON "public"."purchase_order_payments" USING "btree" ("reference");


--
-- Name: idx_sales_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_items_order" ON "public"."sales_order_items" USING "btree" ("sales_order_id");


--
-- Name: idx_sales_items_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_items_variant" ON "public"."sales_order_items" USING "btree" ("variant_id");


--
-- Name: idx_sales_order_items_gift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_order_items_gift" ON "public"."sales_order_items" USING "btree" ("sales_order_id", "is_gift");


--
-- Name: idx_sales_orders_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_branch" ON "public"."sales_orders" USING "btree" ("branch_id");


--
-- Name: idx_sales_orders_cashier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_cashier" ON "public"."sales_orders" USING "btree" ("cashier_id");


--
-- Name: idx_sales_orders_cashier_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_cashier_created" ON "public"."sales_orders" USING "btree" ("cashier_id", "created_at" DESC);


--
-- Name: idx_sales_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_created_at" ON "public"."sales_orders" USING "btree" ("created_at" DESC);


--
-- Name: idx_sales_orders_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_customer" ON "public"."sales_orders" USING "btree" ("customer_id");


--
-- Name: idx_sales_orders_customer_advance_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_customer_advance_journal" ON "public"."sales_orders" USING "btree" ("customer_advance_journal_entry_id");


--
-- Name: idx_sales_orders_customer_advance_recognition_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_customer_advance_recognition_journal" ON "public"."sales_orders" USING "btree" ("customer_advance_recognition_journal_entry_id");


--
-- Name: idx_sales_orders_expected_delivery; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_expected_delivery" ON "public"."sales_orders" USING "btree" ("expected_delivery_date");


--
-- Name: idx_sales_orders_fabric_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_fabric_variant" ON "public"."sales_orders" USING "btree" ("fabric_variant_id");


--
-- Name: idx_sales_orders_order_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_order_type" ON "public"."sales_orders" USING "btree" ("order_type");


--
-- Name: idx_sales_orders_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_payment_status" ON "public"."sales_orders" USING "btree" ("payment_status");


--
-- Name: idx_sales_orders_produced_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_produced_variant" ON "public"."sales_orders" USING "btree" ("produced_product_variant_id");


--
-- Name: idx_sales_orders_production_labor_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_production_labor_journal" ON "public"."sales_orders" USING "btree" ("production_labor_journal_entry_id");


--
-- Name: idx_sales_orders_production_material_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_production_material_journal" ON "public"."sales_orders" USING "btree" ("production_material_journal_entry_id");


--
-- Name: idx_sales_orders_production_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_production_template" ON "public"."sales_orders" USING "btree" ("produced_product_template_id");


--
-- Name: idx_sales_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_status" ON "public"."sales_orders" USING "btree" ("status");


--
-- Name: idx_sales_orders_tailor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailor" ON "public"."sales_orders" USING "btree" ("tailor_id");


--
-- Name: idx_sales_orders_tailoring_cogs; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_cogs" ON "public"."sales_orders" USING "btree" ("tailoring_cogs_journal_entry_id");


--
-- Name: idx_sales_orders_tailoring_item_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_item_name" ON "public"."sales_orders" USING "btree" ("tailoring_item_name");


--
-- Name: idx_sales_orders_tailoring_labor_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_labor_journal" ON "public"."sales_orders" USING "btree" ("tailoring_labor_journal_entry_id");


--
-- Name: idx_sales_orders_tailoring_material_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_material_journal" ON "public"."sales_orders" USING "btree" ("tailoring_material_journal_entry_id");


--
-- Name: idx_sales_orders_tailoring_purpose; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_purpose" ON "public"."sales_orders" USING "btree" ("tailoring_purpose");


--
-- Name: idx_sales_orders_tailoring_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_orders_tailoring_status" ON "public"."sales_orders" USING "btree" ("tailoring_status");


--
-- Name: idx_sales_payments_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_payments_created_by" ON "public"."sales_order_payments" USING "btree" ("created_by");


--
-- Name: idx_sales_payments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_payments_date" ON "public"."sales_order_payments" USING "btree" ("payment_date" DESC);


--
-- Name: idx_sales_payments_journal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_payments_journal" ON "public"."sales_order_payments" USING "btree" ("journal_entry_id");


--
-- Name: idx_sales_payments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sales_payments_order" ON "public"."sales_order_payments" USING "btree" ("sales_order_id");


--
-- Name: idx_sales_payments_reference_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_sales_payments_reference_unique" ON "public"."sales_order_payments" USING "btree" ("reference") WHERE ("reference" IS NOT NULL);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_suppliers_name" ON "public"."suppliers" USING "btree" ("name");


--
-- Name: idx_tailor_payments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailor_payments_order" ON "public"."tailor_commission_payments" USING "btree" ("sales_order_id");


--
-- Name: idx_tailor_payments_order_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailor_payments_order_type" ON "public"."tailor_commission_payments" USING "btree" ("sales_order_id", "payment_type");


--
-- Name: idx_tailor_payments_tailor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailor_payments_tailor" ON "public"."tailor_commission_payments" USING "btree" ("tailor_id");


--
-- Name: idx_tailoring_customer_advance_refunds_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailoring_customer_advance_refunds_order" ON "public"."tailoring_customer_advance_refunds" USING "btree" ("sales_order_id");


--
-- Name: idx_tailoring_customer_advance_transfers_from; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailoring_customer_advance_transfers_from" ON "public"."tailoring_customer_advance_transfers" USING "btree" ("from_order_id");


--
-- Name: idx_tailoring_customer_advance_transfers_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tailoring_customer_advance_transfers_to" ON "public"."tailoring_customer_advance_transfers" USING "btree" ("to_order_id");


--
-- Name: idx_templates_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_templates_category" ON "public"."product_templates" USING "btree" ("categoryId");


--
-- Name: idx_templates_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_templates_supplier" ON "public"."product_templates" USING "btree" ("supplierId");


--
-- Name: idx_variants_barcode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_barcode" ON "public"."product_variants" USING "btree" ("barcode");


--
-- Name: idx_variants_pack_barcode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_pack_barcode" ON "public"."product_variants" USING "btree" ("packBarcode");


--
-- Name: idx_variants_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_sku" ON "public"."product_variants" USING "btree" ("sku");


--
-- Name: idx_variants_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_template" ON "public"."product_variants" USING "btree" ("templateId");


--
-- Name: idx_variants_template_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_template_active" ON "public"."product_variants" USING "btree" ("templateId", "isActive");


--
-- Name: idx_variants_template_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_variants_template_default" ON "public"."product_variants" USING "btree" ("templateId", "isDefault");


--
-- Name: journal_entries_usd_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "journal_entries_usd_created_idx" ON "public"."journal_entries" USING "btree" ("branch_id", "created_at" DESC) WHERE ("amount_usd" IS NOT NULL);


--
-- Name: sales_orders_usd_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "sales_orders_usd_created_idx" ON "public"."sales_orders" USING "btree" ("branch_id", "created_at" DESC) WHERE ("total_amount_usd" IS NOT NULL);


--
-- Name: exchange_rates exchange_rates_immutable; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "exchange_rates_immutable" BEFORE DELETE OR UPDATE ON "public"."exchange_rates" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_exchange_rate_mutation"();


--
-- Name: inventory_movements inventory_movements_usd_cost_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "inventory_movements_usd_cost_snapshot" BEFORE INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_inventory_movement_cost"();


--
-- Name: journal_entries journal_entries_currency_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "journal_entries_currency_snapshot" BEFORE INSERT ON "public"."journal_entries" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_journal_currency"();


--
-- Name: sales_order_items sales_order_items_currency_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sales_order_items_currency_snapshot" BEFORE INSERT ON "public"."sales_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_sales_item_currency"();


--
-- Name: sales_order_payments sales_order_payments_currency_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sales_order_payments_currency_snapshot" BEFORE INSERT ON "public"."sales_order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_sales_payment_currency"();


--
-- Name: sales_orders sales_orders_currency_snapshot; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sales_orders_currency_snapshot" BEFORE INSERT OR UPDATE OF "subtotal", "discount_amount", "tax_amount", "total_amount", "exchange_rate_id", "exchange_rate_used" ON "public"."sales_orders" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_sales_order_currency"();


--
-- Name: journal_entries trg_journal_settle_tailor_fx; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_journal_settle_tailor_fx" AFTER INSERT ON "public"."journal_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_settle_tailor_fx_from_labor"();


--
-- Name: product_variants trg_product_variants_stock_notify; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_product_variants_stock_notify" AFTER INSERT OR UPDATE OF "stockQuantity", "minStockLevel", "isActive" ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_product_variants_stock_notify"();


--
-- Name: sales_orders trg_sales_orders_resolve_delay; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sales_orders_resolve_delay" AFTER UPDATE OF "tailoring_status", "expected_delivery_date" ON "public"."sales_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sales_orders_resolve_delay"();


--
-- Name: tailor_commission_payments trg_tailor_payments_settle_fx; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_tailor_payments_settle_fx" AFTER INSERT ON "public"."tailor_commission_payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_settle_tailor_fx_from_payment"();


--
-- Name: product_templates update_product_templates_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_product_templates_updated_at" BEFORE UPDATE ON "public"."product_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: product_variants update_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_product_variants_updated_at" BEFORE UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: users update_user_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_user_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: assets assets_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: exchange_rates exchange_rates_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");


--
-- Name: exchange_rates exchange_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: assets fk_assets_branch; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "fk_assets_branch" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;


--
-- Name: assets fk_assets_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "fk_assets_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: inventory_movements fk_inv_mov_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_inv_mov_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: inventory_movements fk_inventory_sales_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_inventory_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE RESTRICT;


--
-- Name: purchase_order_items fk_item_po; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "fk_item_po" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;


--
-- Name: purchase_order_items fk_item_template; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "fk_item_template" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id") ON DELETE RESTRICT;


--
-- Name: purchase_order_items fk_item_variant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "fk_item_variant" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT;


--
-- Name: journal_entries fk_journal_branch; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "fk_journal_branch" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;


--
-- Name: journal_entries fk_journal_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "fk_journal_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_purchase; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "fk_journal_purchase" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_sales; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "fk_journal_sales" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_sales_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "fk_journal_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_po; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_mov_po" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_sales; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_mov_sales" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE SET NULL;


--
-- Name: inventory_movements fk_mov_template; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_mov_template" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id") ON DELETE RESTRICT;


--
-- Name: inventory_movements fk_mov_variant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "fk_mov_variant" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT;


--
-- Name: purchase_orders fk_po_supplier; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "fk_po_supplier" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE RESTRICT;


--
-- Name: purchase_order_payments fk_pop_purchase_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "fk_pop_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;


--
-- Name: sales_orders fk_sales_branch; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_branch" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;


--
-- Name: sales_orders fk_sales_cashier; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_cashier" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_cogs_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_cogs_journal" FOREIGN KEY ("cogs_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_customer_advance_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_customer_advance_journal" FOREIGN KEY ("customer_advance_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_customer_advance_recognition_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_customer_advance_recognition_journal" FOREIGN KEY ("customer_advance_recognition_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_order_items fk_sales_item_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "fk_sales_item_order" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;


--
-- Name: sales_order_items fk_sales_item_template; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "fk_sales_item_template" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id") ON DELETE RESTRICT;


--
-- Name: sales_order_items fk_sales_item_variant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "fk_sales_item_variant" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE RESTRICT;


--
-- Name: sales_order_payments fk_sales_payment_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_payments"
    ADD CONSTRAINT "fk_sales_payment_journal" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_order_payments fk_sales_payment_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_payments"
    ADD CONSTRAINT "fk_sales_payment_order" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;


--
-- Name: sales_order_payments fk_sales_payment_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_payments"
    ADD CONSTRAINT "fk_sales_payment_user" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_produced_template; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_produced_template" FOREIGN KEY ("produced_product_template_id") REFERENCES "public"."product_templates"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_produced_variant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_produced_variant" FOREIGN KEY ("produced_product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_inventory_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_production_inventory_journal" FOREIGN KEY ("production_inventory_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_labor_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_production_labor_journal" FOREIGN KEY ("production_labor_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_production_material_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_production_material_journal" FOREIGN KEY ("production_material_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_sales_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_sales_journal" FOREIGN KEY ("sales_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_tailor" FOREIGN KEY ("tailor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_cogs_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_tailoring_cogs_journal" FOREIGN KEY ("tailoring_cogs_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_labor_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_tailoring_labor_journal" FOREIGN KEY ("tailoring_labor_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: sales_orders fk_sales_tailoring_material_journal; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "fk_sales_tailoring_material_journal" FOREIGN KEY ("tailoring_material_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: product_templates product_templates_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE SET NULL;


--
-- Name: product_templates product_templates_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;


--
-- Name: product_variants product_variants_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."product_templates"("id") ON DELETE CASCADE;


--
-- Name: purchase_order_payments purchase_order_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "purchase_order_payments_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: sales_order_payments sales_order_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_order_payments"
    ADD CONSTRAINT "sales_order_payments_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;


--
-- Name: sales_orders sales_orders_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: sales_orders sales_orders_fabric_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_fabric_variant_id_fkey" FOREIGN KEY ("fabric_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE RESTRICT;


--
-- Name: tailor_commission_payments tailor_commission_payments_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE SET NULL;


--
-- Name: tailor_commission_payments tailor_commission_payments_tailor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailor_commission_payments"
    ADD CONSTRAINT "tailor_commission_payments_tailor_id_fkey" FOREIGN KEY ("tailor_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_refunds"
    ADD CONSTRAINT "tailoring_customer_advance_refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_refunds"
    ADD CONSTRAINT "tailoring_customer_advance_refunds_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_refunds tailoring_customer_advance_refunds_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_refunds"
    ADD CONSTRAINT "tailoring_customer_advance_refunds_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_transfers"
    ADD CONSTRAINT "tailoring_customer_advance_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_from_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_transfers"
    ADD CONSTRAINT "tailoring_customer_advance_transfers_from_order_id_fkey" FOREIGN KEY ("from_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE RESTRICT;


--
-- Name: tailoring_customer_advance_transfers tailoring_customer_advance_transfers_to_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tailoring_customer_advance_transfers"
    ADD CONSTRAINT "tailoring_customer_advance_transfers_to_order_id_fkey" FOREIGN KEY ("to_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE RESTRICT;


--
-- Name: users users_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id");


--
-- Name: users Allow server-side bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow server-side bypass" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: users Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON "public"."users" FOR SELECT USING (true);


--
-- Name: _prisma_migrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."exchange_rates" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."purchase_order_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sales_order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sales_order_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sales_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: tailor_commission_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tailor_commission_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tailoring_customer_advance_refunds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tailoring_customer_advance_refunds" ENABLE ROW LEVEL SECURITY;

--
-- Name: tailoring_customer_advance_transfers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tailoring_customer_advance_transfers" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "calculate_tailoring_measurement_meters"("p_measurements" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_tailoring_measurement_meters"("p_measurements" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_tailoring_measurement_meters"("p_measurements" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_tailoring_measurement_meters"("p_measurements" "jsonb") TO "service_role";


--
-- Name: FUNCTION "cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "check_overdue_tailoring_orders"("p_branch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_overdue_tailoring_orders"("p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_overdue_tailoring_orders"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_overdue_tailoring_orders"("p_branch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_sales_checkout"("p_branch_id" "uuid", "p_cashier_id" "uuid", "p_order_type" "text", "p_customer_id" "uuid", "p_tailor_id" "uuid", "p_discount_amount" numeric, "p_tax_amount" numeric, "p_payment_method" "text", "p_payment_splits" "jsonb", "p_notes" "text", "p_items" "jsonb", "p_expected_exchange_rate" numeric) TO "service_role";


--
-- Name: FUNCTION "complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_tailoring_pickup"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_payment_method" "text") TO "service_role";


--
-- Name: FUNCTION "complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_tailoring_production"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_tailoring_to_product"("p_branch_id" "uuid", "p_user_id" "uuid", "p_order_id" "uuid", "p_product_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_asset_with_journal_entry"("p_branch_id" "uuid", "p_created_by" "uuid", "p_name" "text", "p_category" "text", "p_purchase_value" numeric, "p_purchase_date" "text", "p_payment_method" "text", "p_reference" "text", "p_notes" "text", "p_entry_number" "text", "p_currency" "text") TO "service_role";


--
-- Name: FUNCTION "create_product"("p_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_product"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_product"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_product"("p_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tailoring_order"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_tailoring_purpose" "text", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_deposit_amount" numeric, "p_tailoring_cost" numeric, "p_payment_method" "text", "p_customer_advance_source_order_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "create_tailoring_overdue_notifications"("p_branch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_tailoring_overdue_notifications"("p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tailoring_overdue_notifications"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tailoring_overdue_notifications"("p_branch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exchange_currency"("p_branch_id" "uuid", "p_user_id" "uuid", "p_from_currency" "text", "p_from_account" "text", "p_from_amount" numeric, "p_to_account" "text", "p_to_amount" numeric, "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "generate_overdue_tailoring_notifications"("p_branch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_overdue_tailoring_notifications"("p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_overdue_tailoring_notifications"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_overdue_tailoring_notifications"("p_branch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "generate_product_barcode"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_product_barcode"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_product_barcode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_product_barcode"() TO "service_role";


--
-- Name: FUNCTION "generate_product_sku"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_product_sku"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_product_sku"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_product_sku"() TO "service_role";


--
-- Name: FUNCTION "get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_balance"("p_branch_id" "uuid", "p_account" "text", "p_currency" "text") TO "service_role";


--
-- Name: FUNCTION "get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "service_role";


--
-- Name: TABLE "exchange_rates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."exchange_rates" TO "service_role";


--
-- Name: FUNCTION "get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_exchange_rate"("p_branch_id" "uuid", "p_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_advance_rate"("p_order_id" "uuid", "p_branch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_tailor_cost_sdg"("p_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_tailor_cost_sdg"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tailor_cost_sdg"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tailor_cost_sdg"("p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tailor_paid_sdg"("p_order_id" "uuid", "p_payment_type" "text") TO "service_role";


--
-- Name: FUNCTION "journal_entries_apply_currency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."journal_entries_apply_currency"() TO "anon";
GRANT ALL ON FUNCTION "public"."journal_entries_apply_currency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."journal_entries_apply_currency"() TO "service_role";


--
-- Name: FUNCTION "list_opening_stock_candidates"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."list_opening_stock_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_opening_stock_candidates"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_opening_stock_candidates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_opening_stock_candidates"() TO "service_role";


--
-- Name: FUNCTION "maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."maintain_notifications"("p_branch_id" "uuid", "p_retention_days" integer) TO "service_role";


--
-- Name: FUNCTION "normalize_whatsapp_number"("p_number" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."normalize_whatsapp_number"("p_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_whatsapp_number"("p_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_whatsapp_number"("p_number" "text") TO "service_role";


--
-- Name: FUNCTION "notify_variant_stock"("p_variant_id" "uuid", "p_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."notify_variant_stock"("p_variant_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_variant_stock"("p_variant_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_variant_stock"("p_variant_id" "uuid", "p_status" "text") TO "service_role";


--
-- Name: FUNCTION "pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_tailor_commission"("p_branch_id" "uuid", "p_tailor_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_sales_order_id" "uuid", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_tailor_payment"("p_branch_id" "uuid", "p_user_id" "uuid", "p_tailor_id" "uuid", "p_sales_order_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text", "p_currency" "text") TO "service_role";


--
-- Name: FUNCTION "prevent_exchange_rate_mutation"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."prevent_exchange_rate_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_exchange_rate_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_exchange_rate_mutation"() TO "service_role";


--
-- Name: FUNCTION "process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_inventory_adjustment"("p_variant_id" "uuid", "p_user_id" "uuid", "p_adjustment_type" "text", "p_quantity" numeric, "p_notes" "text", "p_entry_number" "text", "p_amount" numeric, "p_payment_method" "text", "p_branch_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "process_purchase_order_receipt"("po_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_opening_stock"("p_branch_id" "uuid", "p_user_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_customer_advance"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_exchange_rate"("p_branch_id" "uuid", "p_as_of" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "rls_auto_enable"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


--
-- Name: FUNCTION "sales_orders_apply_exchange_rate"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sales_orders_apply_exchange_rate"() TO "anon";
GRANT ALL ON FUNCTION "public"."sales_orders_apply_exchange_rate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sales_orders_apply_exchange_rate"() TO "service_role";


--
-- Name: FUNCTION "settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_tailor_fx"("p_order_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "snapshot_inventory_movement_cost"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."snapshot_inventory_movement_cost"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_inventory_movement_cost"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_inventory_movement_cost"() TO "service_role";


--
-- Name: FUNCTION "snapshot_journal_currency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."snapshot_journal_currency"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_journal_currency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_journal_currency"() TO "service_role";


--
-- Name: FUNCTION "snapshot_sales_item_currency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."snapshot_sales_item_currency"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_sales_item_currency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_sales_item_currency"() TO "service_role";


--
-- Name: FUNCTION "snapshot_sales_order_currency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."snapshot_sales_order_currency"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_sales_order_currency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_sales_order_currency"() TO "service_role";


--
-- Name: FUNCTION "snapshot_sales_payment_currency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."snapshot_sales_payment_currency"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_sales_payment_currency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_sales_payment_currency"() TO "service_role";


--
-- Name: FUNCTION "stock_status"("p_stock" numeric, "p_min" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."stock_status"("p_stock" numeric, "p_min" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."stock_status"("p_stock" numeric, "p_min" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_status"("p_stock" numeric, "p_min" numeric) TO "service_role";


--
-- Name: FUNCTION "tailor_advances_exceed_cost"("p_order_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tailor_advances_exceed_cost"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tailor_advances_exceed_cost"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tailor_advances_exceed_cost"("p_order_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "trg_product_variants_stock_notify"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_product_variants_stock_notify"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_product_variants_stock_notify"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_product_variants_stock_notify"() TO "service_role";


--
-- Name: FUNCTION "trg_sales_orders_resolve_delay"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_sales_orders_resolve_delay"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_sales_orders_resolve_delay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_sales_orders_resolve_delay"() TO "service_role";


--
-- Name: FUNCTION "trg_settle_tailor_fx_from_labor"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_labor"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_labor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_labor"() TO "service_role";


--
-- Name: FUNCTION "trg_settle_tailor_fx_from_payment"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_settle_tailor_fx_from_payment"() TO "service_role";


--
-- Name: FUNCTION "update_product"("p_product_id" "uuid", "p_payload" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_product"("p_product_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_product"("p_product_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product"("p_product_id" "uuid", "p_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tailoring_order"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_tailoring_item_name" "text", "p_tailoring_item_description" "text", "p_tailor_id" "uuid", "p_customer_name" "text", "p_customer_whatsapp" "text", "p_measurements" "jsonb", "p_intake_date" "date", "p_expected_delivery_date" "date", "p_fabric_variant_id" "uuid", "p_fabric_quantity" numeric, "p_total_amount" numeric, "p_tailoring_cost" numeric, "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") TO "service_role";


--
-- Name: FUNCTION "update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tailoring_status"("p_order_id" "uuid", "p_branch_id" "uuid", "p_user_id" "uuid", "p_new_status" "text") TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: TABLE "_prisma_migrations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."_prisma_migrations" TO "anon";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "service_role";


--
-- Name: TABLE "assets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";


--
-- Name: TABLE "branches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "customers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";


--
-- Name: TABLE "inventory_movements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";


--
-- Name: TABLE "journal_entries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "product_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_templates" TO "anon";
GRANT ALL ON TABLE "public"."product_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."product_templates" TO "service_role";


--
-- Name: TABLE "product_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";


--
-- Name: TABLE "purchase_order_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";


--
-- Name: TABLE "purchase_order_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."purchase_order_payments" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_payments" TO "service_role";


--
-- Name: TABLE "purchase_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";


--
-- Name: TABLE "sales_order_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sales_order_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_order_items" TO "service_role";


--
-- Name: TABLE "sales_order_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sales_order_payments" TO "anon";
GRANT ALL ON TABLE "public"."sales_order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_order_payments" TO "service_role";


--
-- Name: TABLE "sales_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sales_orders" TO "anon";
GRANT ALL ON TABLE "public"."sales_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_orders" TO "service_role";


--
-- Name: TABLE "suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


--
-- Name: TABLE "tailor_commission_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tailor_commission_payments" TO "anon";
GRANT ALL ON TABLE "public"."tailor_commission_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."tailor_commission_payments" TO "service_role";


--
-- Name: TABLE "tailoring_customer_advance_refunds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tailoring_customer_advance_refunds" TO "anon";
GRANT ALL ON TABLE "public"."tailoring_customer_advance_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."tailoring_customer_advance_refunds" TO "service_role";


--
-- Name: TABLE "tailoring_customer_advance_transfers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tailoring_customer_advance_transfers" TO "anon";
GRANT ALL ON TABLE "public"."tailoring_customer_advance_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."tailoring_customer_advance_transfers" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict klGpgA11uz1gMAIRheDyzxKKbtrZyVFva2boIQDdZDlBwoQYj2rUeZ8nRZroSHN


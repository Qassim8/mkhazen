-- =====================================================================
-- 20261022_01_tailoring_open_fabric_quantity.sql
--
-- كمية القماش في طلبات التفصيل أصبحت مفتوحة: حُذف شرط (لا تقل عن مجموع
-- المقاسات ولا تتجاوز المقاسات + 1 متر). الشروط الباقية: الكمية > 0 ولا
-- تتجاوز المخزون المتاح من القماش.
--
-- create_tailoring_order: آخر تعريف في 20261014_01_deposit_gifts_opening_payroll.sql
-- update_tailoring_order: آخر تعريف في database/audit/live_public_schema.sql
-- لا تغيير آخر في الدالتين.
-- =====================================================================

BEGIN;

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
  v_extra_deposit numeric(12,2) := 0;
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

  SELECT id, name, phone, role, "branchId" AS branch_id, "isActive" AS is_active
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

  -- isActive للخياط = متاح لإسناد طلبات جديدة
  IF NOT COALESCE(v_tailor.is_active, false) THEN
    RAISE EXCEPTION 'الخياط % غير نشط ولا يمكن إسناد طلبات جديدة له', v_tailor.name;
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

      -- يُنقل كامل الرصيد المتاح من الطلب الملغي
      v_transfer_amount := v_source_available_advance;
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

    IF p_deposit_amount IS NOT NULL AND round(p_deposit_amount, 2) <> p_deposit_amount THEN
      RAISE EXCEPTION 'مبلغ العربون يجب ألا يتجاوز منزلتين عشريتين';
    END IF;

    IF p_customer_advance_source_order_id IS NULL THEN
      -- العربون يُكتب يدويًا: أكبر من صفر ولا يتجاوز الإجمالي
      IF p_deposit_amount IS NULL OR p_deposit_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ العربون يجب أن يكون أكبر من صفر';
      END IF;

      IF p_deposit_amount > p_total_amount THEN
        RAISE EXCEPTION 'مبلغ العربون لا يمكن أن يتجاوز المبلغ الإجمالي';
      END IF;

      IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK_TRANSFER') THEN
        RAISE EXCEPTION 'طريقة دفع العربون غير صالحة';
      END IF;

      v_extra_deposit := round(p_deposit_amount, 2);
    ELSE
      -- الطلب البديل: سعر جديد حر، العربون = كامل الرصيد المنقول + عربون إضافي اختياري
      IF v_transfer_amount > round(p_total_amount, 2) THEN
        RAISE EXCEPTION
          'العربون المنقول (% ج.س) أكبر من إجمالي الطلب الجديد (% ج.س). استرد الفرق (% ج.س) من الطلب الملغي أولًا ثم أعد المحاولة.',
          v_transfer_amount,
          round(p_total_amount, 2),
          round(v_transfer_amount - p_total_amount, 2);
      END IF;

      v_extra_deposit := round(COALESCE(p_deposit_amount, 0), 2);

      IF v_extra_deposit < 0 THEN
        RAISE EXCEPTION 'العربون الإضافي غير صالح';
      END IF;

      IF v_transfer_amount + v_extra_deposit > round(p_total_amount, 2) THEN
        RAISE EXCEPTION
          'مجموع العربون المنقول والإضافي (% ج.س) يتجاوز إجمالي الطلب (% ج.س)',
          v_transfer_amount + v_extra_deposit,
          round(p_total_amount, 2);
      END IF;

      IF v_extra_deposit > 0 AND (p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK_TRANSFER')) THEN
        RAISE EXCEPTION 'طريقة دفع العربون الإضافي غير صالحة';
      END IF;
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
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN COALESCE(CASE WHEN p_customer_advance_source_order_id IS NOT NULL AND v_extra_deposit = 0 THEN v_source_payment_method ELSE p_payment_method END, 'CASH') ELSE 'CASH' END,
    CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN CASE WHEN round(v_transfer_amount + v_extra_deposit, 2) >= round(p_total_amount, 2) THEN 'PAID' ELSE 'PARTIAL' END ELSE 'UNPAID' END,
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
     not exceed the new total; an optional extra deposit is collected
     as a normal customer advance entry.
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
    END IF;

    -- العربون المحصّل نقدًا/تحويلًا (العادي، أو الإضافي في الطلب البديل)
    IF v_extra_deposit > 0 THEN
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
        v_extra_deposit,
        CASE WHEN p_customer_advance_source_order_id IS NOT NULL
          THEN 'استلام عربون إضافي من العميل لطلب تفصيل '
          ELSE 'استلام عربون من العميل لطلب تفصيل '
        END || v_order_number,
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
        v_extra_deposit,
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
    'deposit_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(v_transfer_amount + v_extra_deposit, 2) ELSE 0 END,
    'additional_deposit_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN v_extra_deposit ELSE 0 END,
    'remaining_amount', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN round(p_total_amount - v_transfer_amount - v_extra_deposit, 2) ELSE 0 END,
    'tailoring_cost', round(p_tailoring_cost / v_tlr_rate, 2),
    'tailoring_cost_sdg', round(p_tailoring_cost, 2),
    'exchange_rate_used', v_tlr_rate,
    'tailoring_fabric_cost', round(v_fabric_cost, 2),
    'payment_method', CASE WHEN p_tailoring_purpose = 'CUSTOMER' THEN COALESCE(CASE WHEN p_customer_advance_source_order_id IS NOT NULL AND v_extra_deposit = 0 THEN v_source_payment_method ELSE p_payment_method END, 'CASH') ELSE NULL END,
    'customer_advance_source_order_id', p_customer_advance_source_order_id,
    'customer_advance_transferred_amount', CASE WHEN p_customer_advance_source_order_id IS NOT NULL THEN v_transfer_amount ELSE 0 END,
    'tailoring_status', 'NEW',
    'measurement_meters', v_measurement_meters
  );
END;
$_$;

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


-- الصلاحيات: السيرفر فقط
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_tailoring_order(uuid, uuid, uuid, text, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, numeric, text, uuid, text, text, text)',
    'public.update_tailoring_order(uuid, uuid, uuid, text, text, uuid, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMIT;

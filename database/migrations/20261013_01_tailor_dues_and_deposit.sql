/* =====================================================================
   20261013_01 — العربون اليدوي + مستحقات وسلف الخياطين
   =====================================================================
   1) create_tailoring_order: العربون يُكتب يدويًا بدل 50% الإلزامية
      (أكبر من صفر ولا يتجاوز الإجمالي). في الطلب البديل، المنقول من
      الطلب الملغي = العربون المكتوب (لا يتجاوز الرصيد المتاح).

   2) مستحقات الخياط = مجموع أجرة طلباته التي ثُبتت تكلفتها
      (قيد TAILOR_COST دائن TAILORS_PAYABLE) − ما دُفع له عليها.
        • get_tailor_dues_orders(branch, tailor)  — تفصيل لكل طلب
        • get_tailor_dues(branch, tailor|NULL)    — ملخص لكل خياط
        • pay_tailor_dues(...)                    — سداد كامل أو سلفة

      السداد / السلفة ليسا مصروفًا (التكلفة سُجلت عند تثبيتها):
        مدين TAILORS_PAYABLE / دائن CASH|BANK — بالجنيه.
      الدفعة تُوزّع على طلبات الخياط من الأقدم للأحدث؛ لكل طلب سطر قيد
      (sales_order_id = الطلب) + صف في tailor_commission_payments، وكل
      الأسطر تحمل نفس المرجع (reference) للعملية. بذلك يظل
      settle_tailor_fx (يقرأ القيود لكل طلب) صحيحًا ويُسوّي فرق الصرف
      تلقائيًا عند اكتمال سداد أجرة أي طلب — بدون تعديل عليه.

   تغييرات الجداول (توسيع فقط، الصفوف الحالية لا تتأثر):
     • journal_entries_entry_type_check   += TAILOR_DUES_PAYMENT, TAILOR_DUES_ADVANCE
     • tailor_commission_payments_payment_type_check += DUES_ADVANCE

   قابل لإعادة التشغيل. يُطبّق بعد 20261010_* ثم يُعاد تشغيل
   20261010_06_reassert_api_acl.sql كالمعتاد.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) توسيع قيود CHECK
--------------------------------------------------------------------- */

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_entry_type_check
  CHECK ((entry_type)::text = ANY (ARRAY[
    'CAPITAL', 'PURCHASE', 'PURCHASE_PAYMENT', 'SALE', 'SALE_PAYMENT',
    'CUSTOMER_ADVANCE', 'CUSTOMER_ADVANCE_REFUND',
    'TAILOR_ADVANCE', 'TAILOR_ADVANCE_APPLICATION', 'TAILOR_COST', 'TAILOR_PAYMENT',
    'TAILOR_DUES_PAYMENT', 'TAILOR_DUES_ADVANCE',
    'TAILORING_MATERIAL', 'PRODUCTION', 'COGS', 'EXPENSE', 'ASSET',
    'INVENTORY_ADJUSTMENT', 'SALES_RETURN', 'OTHER', 'CURRENCY_EXCHANGE', 'GIFT'
  ]::text[]));

ALTER TABLE public.tailor_commission_payments DROP CONSTRAINT IF EXISTS tailor_commission_payments_payment_type_check;
ALTER TABLE public.tailor_commission_payments ADD CONSTRAINT tailor_commission_payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['ADVANCE', 'SETTLEMENT', 'DUES_ADVANCE']::text[]));

COMMENT ON COLUMN public.tailor_commission_payments.payment_type IS
  'ADVANCE = دفع مقدم للخياط قبل إثبات تكلفة العمل; SETTLEMENT = سداد لمستحق مثبت; DUES_ADVANCE = سلفة مخصومة من مستحق مثبت';

/* ---------------------------------------------------------------------
   2) create_tailoring_order — العربون اليدوي
      (نفس الدالة الحالية؛ تغيّر فقط شرط العربون ومبلغ النقل)
--------------------------------------------------------------------- */

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

      -- العربون المنقول = العربون المكتوب يدويًا (بدل 50% الإلزامية)
      v_transfer_amount := round(COALESCE(p_deposit_amount, 0), 2);

      IF v_transfer_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ العربون يجب أن يكون أكبر من صفر';
      END IF;

      IF v_source_available_advance < v_transfer_amount THEN
        RAISE EXCEPTION
          'عربون الطلب المصدر غير كافٍ لتغطية عربون الطلب الجديد. المتاح: % ج.س، المطلوب: % ج.س',
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

    -- العربون يُكتب يدويًا: أكبر من صفر ولا يتجاوز الإجمالي
    IF p_deposit_amount IS NULL OR p_deposit_amount <= 0 THEN
      RAISE EXCEPTION 'مبلغ العربون يجب أن يكون أكبر من صفر';
    END IF;

    IF round(p_deposit_amount, 2) <> p_deposit_amount THEN
      RAISE EXCEPTION 'مبلغ العربون يجب ألا يتجاوز منزلتين عشريتين';
    END IF;

    IF p_deposit_amount > p_total_amount THEN
      RAISE EXCEPTION 'مبلغ العربون لا يمكن أن يتجاوز المبلغ الإجمالي';
    END IF;

    IF p_customer_advance_source_order_id IS NULL THEN

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
     cover the (manually entered) deposit of the new order.
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


/* ---------------------------------------------------------------------
   3) مستحقات الخياط لكل طلب (ثُبتت تكلفته فقط)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_tailor_dues_orders(p_branch_id uuid, p_tailor_id uuid)
RETURNS TABLE (
  sales_order_id uuid,
  order_number text,
  tailoring_item_name text,
  tailoring_purpose text,
  order_created_at timestamptz,
  cost_recognized_at timestamptz,
  cost_sdg numeric,
  paid_sdg numeric,
  advances_sdg numeric,
  remaining_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH recognized AS (
    SELECT o.id, o.order_number::text AS order_number, o.tailoring_item_name,
           o.tailoring_purpose, o.created_at,
           min(j.created_at) AS recognized_at
    FROM public.sales_orders o
    JOIN public.journal_entries j
      ON j.sales_order_id = o.id
     AND j.entry_type = 'TAILOR_COST'
     AND j.credit_account = 'TAILORS_PAYABLE'
    WHERE o.branch_id = p_branch_id
      AND o.order_type = 'TAILORING'
      AND o.tailor_id = p_tailor_id
    GROUP BY o.id
  ),
  totals AS (
    SELECT r.*,
           public.get_tailor_cost_sdg(r.id) AS cost_sdg,
           public.get_tailor_paid_sdg(r.id) AS paid_all_sdg,
           public.get_tailor_paid_sdg(r.id, 'DUES_ADVANCE') AS advances_sdg
    FROM recognized r
  )
  SELECT t.id, t.order_number, t.tailoring_item_name, t.tailoring_purpose,
         t.created_at, t.recognized_at,
         t.cost_sdg,
         round(t.paid_all_sdg - t.advances_sdg, 2),
         t.advances_sdg,
         round(greatest(t.cost_sdg - t.paid_all_sdg, 0), 2)
  FROM totals t
  ORDER BY t.created_at, t.order_number;
$$;

/* ---------------------------------------------------------------------
   4) ملخص المستحقات لكل خياط (p_tailor_id NULL = كل الخياطين)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_tailor_dues(p_branch_id uuid, p_tailor_id uuid DEFAULT NULL)
RETURNS TABLE (
  tailor_id uuid,
  tailor_name text,
  tailor_phone text,
  orders_count integer,
  open_orders_count integer,
  cost_sdg numeric,
  paid_sdg numeric,
  advances_sdg numeric,
  remaining_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.name::text, u.phone::text,
         count(d.sales_order_id)::integer,
         (count(d.sales_order_id) FILTER (WHERE d.remaining_sdg > 0))::integer,
         round(COALESCE(sum(d.cost_sdg), 0), 2),
         round(COALESCE(sum(d.paid_sdg), 0), 2),
         round(COALESCE(sum(d.advances_sdg), 0), 2),
         round(COALESCE(sum(d.remaining_sdg), 0), 2)
  FROM public.users u
  LEFT JOIN LATERAL public.get_tailor_dues_orders(p_branch_id, u.id) d ON true
  WHERE u."branchId" = p_branch_id
    AND lower(u.role::text) = 'tailor'
    AND (p_tailor_id IS NULL OR u.id = p_tailor_id)
  GROUP BY u.id, u.name, u.phone
  ORDER BY round(COALESCE(sum(d.remaining_sdg), 0), 2) DESC, u.name;
$$;

/* ---------------------------------------------------------------------
   5) سداد مستحقات خياط (كامل) أو سلفة خياط (لا تتجاوز المتبقي)
      p_kind  : 'SETTLEMENT' | 'ADVANCE'
      p_amount: في السداد = المستحق المعروض على الشاشة (للتأكد أنه لم
                يتغير؛ NULL = المستحق الحالي)، في السلفة = مبلغ السلفة.
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.pay_tailor_dues(
  p_branch_id uuid,
  p_user_id uuid,
  p_tailor_id uuid,
  p_kind text,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
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
  v_left numeric(14,2);
  v_alloc numeric(14,2);
  v_alloc_usd numeric(14,2);
  v_rate numeric(14,4);
  v_account text;
  v_balance numeric(14,2);
  v_reference text;
  v_entry_id uuid;
  v_allocations jsonb := '[]'::jsonb;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_is_advance boolean;
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

  IF p_kind IS NULL OR p_kind NOT IN ('SETTLEMENT', 'ADVANCE') THEN
    RAISE EXCEPTION 'نوع العملية غير صالح';
  END IF;
  v_is_advance := p_kind = 'ADVANCE';

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
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

  SELECT round(COALESCE(sum(d.remaining_sdg), 0), 2) INTO v_total_remaining
  FROM public.get_tailor_dues_orders(p_branch_id, p_tailor_id) d;

  IF v_total_remaining <= 0 THEN
    RAISE EXCEPTION 'لا توجد مستحقات متبقية لهذا الخياط';
  END IF;

  IF v_is_advance THEN
    IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
      RAISE EXCEPTION 'مبلغ السلفة غير صالح';
    END IF;
    IF p_amount > v_total_remaining THEN
      RAISE EXCEPTION 'السلفة تتجاوز مستحقات الخياط المتبقية. المتبقي: % ج.س', v_total_remaining;
    END IF;
    v_amount := p_amount;
  ELSE
    IF p_amount IS NOT NULL AND round(p_amount, 2) <> v_total_remaining THEN
      RAISE EXCEPTION 'تغيّر مستحق الخياط. المستحق الحالي: % ج.س — حدّث الصفحة وأعد المحاولة', v_total_remaining;
    END IF;
    v_amount := v_total_remaining;
  END IF;

  v_account := p_payment_method;
  v_balance := public.get_account_balance(p_branch_id, v_account, 'SDG');
  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
      CASE WHEN v_account = 'CASH' THEN 'الخزينة' ELSE 'البنك' END, v_balance;
  END IF;

  v_rate := public.require_exchange_rate(p_branch_id);
  v_reference :=
    CASE WHEN v_is_advance THEN 'TLR-LOAN-' ELSE 'TLR-DUES-' END ||
    to_char(v_now AT TIME ZONE 'Africa/Khartoum', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_left := v_amount;

  -- التوزيع على الطلبات من الأقدم للأحدث
  FOR v_order IN
    SELECT d.sales_order_id, d.order_number, d.remaining_sdg
    FROM public.get_tailor_dues_orders(p_branch_id, p_tailor_id) d
    WHERE d.remaining_sdg > 0
    ORDER BY d.order_created_at, d.order_number
  LOOP
    EXIT WHEN v_left <= 0;

    v_alloc := least(v_order.remaining_sdg, v_left);
    v_alloc_usd := round(v_alloc / v_rate, 2);

    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
      description, debit_account, credit_account,
      branch_id, created_by, reference, sales_order_id, created_at
    ) VALUES (
      CASE WHEN v_is_advance THEN 'JE-TLR-LOAN-' ELSE 'JE-TLR-DUES-' END ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      CASE WHEN v_is_advance THEN 'TAILOR_DUES_ADVANCE' ELSE 'TAILOR_DUES_PAYMENT' END,
      v_alloc, 'SDG', v_rate, v_alloc_usd,
      CASE WHEN v_is_advance
        THEN 'سلفة للخياط ' || v_tailor.name || ' (من مستحق طلب ' || v_order.order_number || ')'
        ELSE 'سداد مستحقات الخياط ' || v_tailor.name || ' — طلب ' || v_order.order_number
      END || COALESCE(' - ' || v_notes, ''),
      'TAILORS_PAYABLE', v_account,
      p_branch_id, p_user_id, v_reference, v_order.sales_order_id, v_now
    )
    RETURNING id INTO v_entry_id;

    -- trigger الجدول ده بيشغّل settle_tailor_fx (يسوّي فرق الصرف لما أجرة الطلب تتسدد بالكامل)
    INSERT INTO public.tailor_commission_payments (
      branch_id, tailor_id, sales_order_id, amount, payment_method, payment_type,
      notes, journal_entry_id, created_by, created_at, currency, amount_original, exchange_rate_used
    ) VALUES (
      p_branch_id, p_tailor_id, v_order.sales_order_id,
      greatest(v_alloc_usd, 0.01), p_payment_method,
      CASE WHEN v_is_advance THEN 'DUES_ADVANCE' ELSE 'SETTLEMENT' END,
      COALESCE(v_notes || ' — ', '') || v_reference, v_entry_id, p_user_id, v_now,
      'SDG', v_alloc, v_rate
    );

    v_allocations := v_allocations || jsonb_build_object(
      'sales_order_id', v_order.sales_order_id,
      'order_number', v_order.order_number,
      'amount', v_alloc,
      'amount_usd', v_alloc_usd,
      'journal_entry_id', v_entry_id
    );

    v_left := round(v_left - v_alloc, 2);
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'تعذر توزيع كامل المبلغ على طلبات الخياط';
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
    'allocations', v_allocations,
    'remaining_sdg', round(v_total_remaining - v_amount, 2)
  );
END;
$$;

/* ---------------------------------------------------------------------
   6) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.create_tailoring_order(uuid, uuid, uuid, text, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, numeric, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tailor_dues_orders(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tailor_dues(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_tailor_dues(uuid, uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tailoring_order(uuid, uuid, uuid, text, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, numeric, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tailor_dues_orders(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tailor_dues(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_tailor_dues(uuid, uuid, uuid, text, numeric, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

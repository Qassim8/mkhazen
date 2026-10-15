/* =====================================================================
   20261014_01 — نقل العربون + عربون إضافي، فاتورة هدايا، canLogin،
                 الأرصدة الافتتاحية المتكررة، الرواتب والسلف
   =====================================================================
   1) users."canLogin" (افتراضي true، والخياطين false عند إضافة العمود).
      isActive للخياط = متاح لإسناد طلبات جديدة (create_tailoring_order يرفض غير النشط).
   2) create_tailoring_order: الطلب البديل يأخذ كامل رصيد العربون المنقول
      + عربون إضافي اختياري (p_deposit_amount = الإضافي، بقيد عربون عادي).
      المجموع لا يتجاوز الإجمالي، والمنقول الأكبر من الإجمالي يُرفض مع طلب استرداد الفرق.
   3) complete_sales_checkout: فاتورة كل بنودها هدايا (إجمالي صفر، بدون دفعات
      أو قيود إيراد)؛ المخزون يُخصم والتكلفة على GIFTS كما هو.
   4) inventory_movements: نوع حركة OPENING.
      record_opening_cash / record_opening_inventory — متكررة، للمالك والمدير.
   5) employee_payments + get_payroll / pay_employee (مدين SALARIES / دائن
      الخزينة أو البنك، جنيه) + get_tailor_month_summary.

   قابل لإعادة التشغيل. يُطبّق بعد 20261013_01 ثم يُعاد تشغيل
   20261010_06_reassert_api_acl.sql.
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) users."canLogin"
--------------------------------------------------------------------- */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'canLogin'
  ) THEN
    ALTER TABLE public.users ADD COLUMN "canLogin" boolean NOT NULL DEFAULT true;
    -- أول مرة فقط: الخياطين لا يدخلون النظام
    UPDATE public.users SET "canLogin" = false WHERE lower(role::text) = 'tailor';
  END IF;
END $$;

COMMENT ON COLUMN public.users."canLogin" IS 'السماح بتسجيل الدخول للنظام (منفصل عن isActive)';
COMMENT ON COLUMN public.users."isActive" IS 'نشط؛ للخياط = متاح لإسناد طلبات جديدة';

/* ---------------------------------------------------------------------
   2) نوع حركة المخزون OPENING
--------------------------------------------------------------------- */

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK ((movement_type)::text = ANY ('{PURCHASE,SALE,PURCHASE_RETURN,SALE_RETURN,ADJUSTMENT_IN,ADJUSTMENT_OUT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,GIFT,OPENING_STOCK,OPENING}'::text[]));

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
  CHECK ((movement_type)::text = ANY ('{ADJUSTMENT_IN,ADJUSTMENT_OUT,GIFT,PRODUCTION_ISSUE,PRODUCTION_RECEIPT,PURCHASE,PURCHASE_RETURN,SALE,SALE_RETURN,TAILORING,OPENING_STOCK,OPENING}'::text[]));

/* ---------------------------------------------------------------------
   3) جدول دفعات الموظفين (سلف ورواتب)
--------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.employee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  period date NOT NULL,
  type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_method text NOT NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_payments_period_check CHECK (period = date_trunc('month', period)::date),
  CONSTRAINT employee_payments_type_check CHECK (type = ANY (ARRAY['ADVANCE', 'SALARY'])),
  CONSTRAINT employee_payments_amount_check CHECK (amount > 0),
  CONSTRAINT employee_payments_payment_method_check CHECK (payment_method = ANY (ARRAY['CASH', 'BANK']))
);

CREATE INDEX IF NOT EXISTS idx_employee_payments_user_period ON public.employee_payments (user_id, period);
CREATE INDEX IF NOT EXISTS idx_employee_payments_branch_period ON public.employee_payments (branch_id, period);

COMMENT ON TABLE public.employee_payments IS 'سلف ورواتب الموظفين بالجنيه؛ كل دفعة = قيد مدين SALARIES / دائن CASH|BANK';

ALTER TABLE public.employee_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.employee_payments TO service_role;

/* ---------------------------------------------------------------------
   4) create_tailoring_order — نقل العربون + عربون إضافي، والخياط النشط فقط
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
    'measurement_meters', v_measurement_meters,
    'max_fabric_quantity', v_max_fabric_quantity
  );
END;
$_$;




/* ---------------------------------------------------------------------
   5) complete_sales_checkout — فاتورة هدايا فقط
      (نفس الدالة الحالية؛ تغيّر شرط "هدايا فقط" وشرط الإجمالي، وتخطي الدفعات عند صفر)
--------------------------------------------------------------------- */

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


/* ---------------------------------------------------------------------
   6) الأرصدة الافتتاحية المتكررة (المالك والمدير)
--------------------------------------------------------------------- */

-- فلوس: مدين الخزينة/البنك (بالعملة) / دائن رأس المال
CREATE OR REPLACE FUNCTION public.record_opening_cash(
  p_branch_id uuid,
  p_user_id uuid,
  p_account text,
  p_currency text,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_rate numeric(14,4);
  v_amount_usd numeric(14,2);
  v_entry_id uuid;
  v_entry_number text;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
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
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك أو المدير فقط';
  END IF;

  IF p_account IS NULL OR p_account NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'الحساب يجب أن يكون الخزينة أو البنك';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('SDG', 'USD') THEN
    RAISE EXCEPTION 'العملة غير صالحة';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  IF p_currency = 'SDG' THEN
    v_rate := public.require_exchange_rate(p_branch_id);
    v_amount_usd := round(p_amount / v_rate, 2);
  ELSE
    v_rate := NULL;
    v_amount_usd := p_amount;
  END IF;

  v_entry_number := 'JE-OPENCASH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference
  ) VALUES (
    v_entry_number, 'CAPITAL', p_amount, p_currency, v_rate, v_amount_usd,
    'رصيد افتتاحي — ' || CASE WHEN p_account = 'CASH' THEN 'الخزينة' ELSE 'البنك' END
      || ' (' || CASE WHEN p_currency = 'SDG' THEN 'جنيه' ELSE 'دولار' END || ')'
      || COALESCE(' — ' || v_notes, ''),
    p_account, 'CAPITAL', p_branch_id, p_user_id, 'OPENING-BALANCE'
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'journal_entry_id', v_entry_id,
    'entry_number', v_entry_number,
    'account', p_account,
    'currency', p_currency,
    'amount', p_amount,
    'amount_usd', v_amount_usd
  );
END;
$$;

-- مخزون: يزيد الرصيد، متوسط مرجح للتكلفة، حركة OPENING، مدين INVENTORY / دائن CAPITAL
CREATE OR REPLACE FUNCTION public.record_opening_inventory(
  p_branch_id uuid,
  p_user_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_user record;
  v_variant record;
  v_old_stock numeric(14,2);
  v_old_cost numeric(14,6);
  v_new_stock numeric(14,2);
  v_new_cost numeric(14,2);
  v_total numeric(14,2);
  v_entry_id uuid;
  v_entry_number text;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
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
    RAISE EXCEPTION 'الأرصدة الافتتاحية متاحة للمالك أو المدير فقط';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 OR round(p_quantity, 2) <> p_quantity THEN
    RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 OR round(p_unit_cost, 2) <> p_unit_cost THEN
    RAISE EXCEPTION 'تكلفة الوحدة بالدولار يجب أن تكون أكبر من صفر وبمنزلتين عشريتين كحد أقصى';
  END IF;

  SELECT v.id, v."templateId" AS template_id, v."stockQuantity" AS stock,
         v."averageCost" AS average_cost, v."purchasePrice" AS purchase_price,
         COALESCE(v."isActive", true) AS is_active, pt.name AS product_name
  INTO v_variant
  FROM public.product_variants v
  JOIN public.product_templates pt ON pt.id = v."templateId"
  WHERE v.id = p_variant_id
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;
  IF NOT v_variant.is_active THEN
    RAISE EXCEPTION 'الصنف % غير نشط', v_variant.product_name;
  END IF;

  v_total := round(p_quantity * p_unit_cost, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'قيمة المخزون الافتتاحي يجب أن تكون أكبر من صفر';
  END IF;

  -- متوسط مرجح على الرصيد الموجب الحالي
  v_old_stock := greatest(COALESCE(v_variant.stock, 0), 0);
  v_old_cost := COALESCE(NULLIF(v_variant.average_cost, 0), NULLIF(v_variant.purchase_price, 0), p_unit_cost);
  v_new_stock := round(COALESCE(v_variant.stock, 0) + p_quantity, 2);
  v_new_cost := CASE
    WHEN v_old_stock <= 0 THEN p_unit_cost
    ELSE round((v_old_stock * v_old_cost + p_quantity * p_unit_cost) / (v_old_stock + p_quantity), 2)
  END;

  v_entry_number := 'JE-OPENINV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  UPDATE public.product_variants
  SET "stockQuantity" = v_new_stock,
      "averageCost" = v_new_cost,
      "purchasePrice" = CASE WHEN COALESCE("purchasePrice", 0) = 0 THEN p_unit_cost ELSE "purchasePrice" END,
      "updatedAt" = v_now
  WHERE id = v_variant.id;

  INSERT INTO public.inventory_movements (
    movement_type, quantity, unit_cost, unit_cost_usd, reference, notes,
    template_id, variant_id, created_by, created_at
  ) VALUES (
    'OPENING', p_quantity, p_unit_cost, p_unit_cost, v_entry_number,
    COALESCE(v_notes, 'رصيد افتتاحي'),
    v_variant.template_id, v_variant.id, p_user_id, v_now
  );

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference, created_at
  ) VALUES (
    v_entry_number, 'CAPITAL', v_total, 'USD', v_total,
    'مخزون افتتاحي: ' || v_variant.product_name || ' × ' || p_quantity || COALESCE(' — ' || v_notes, ''),
    'INVENTORY', 'CAPITAL', p_branch_id, p_user_id, v_entry_number, v_now
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'journal_entry_id', v_entry_id,
    'entry_number', v_entry_number,
    'variant_id', v_variant.id,
    'product_name', v_variant.product_name,
    'quantity', p_quantity,
    'unit_cost', p_unit_cost,
    'total_cost_usd', v_total,
    'stock_quantity', v_new_stock,
    'average_cost', v_new_cost
  );
END;
$$;

/* ---------------------------------------------------------------------
   7) الرواتب والسلف (موظفين بالراتب، غير الخياطين)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_payroll(p_branch_id uuid, p_period date)
RETURNS TABLE (
  user_id uuid,
  name text,
  role text,
  "position" text,
  is_active boolean,
  salary_sdg numeric,
  advances_sdg numeric,
  salary_paid_sdg numeric,
  taken_sdg numeric,
  remaining_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH params AS (SELECT date_trunc('month', p_period)::date AS period),
  paid AS (
    SELECT ep.user_id,
           sum(ep.amount) FILTER (WHERE ep.type = 'ADVANCE') AS advances,
           sum(ep.amount) FILTER (WHERE ep.type = 'SALARY') AS salaries
    FROM public.employee_payments ep, params
    WHERE ep.branch_id = p_branch_id AND ep.period = params.period
    GROUP BY ep.user_id
  )
  SELECT u.id, u.name::text, lower(u.role::text), u.position::text, u."isActive",
         round(COALESCE(u.salary, 0)::numeric, 2),
         round(COALESCE(p.advances, 0), 2),
         round(COALESCE(p.salaries, 0), 2),
         round(COALESCE(p.advances, 0) + COALESCE(p.salaries, 0), 2),
         round(greatest(COALESCE(u.salary, 0)::numeric - COALESCE(p.advances, 0) - COALESCE(p.salaries, 0), 0), 2)
  FROM public.users u
  LEFT JOIN paid p ON p.user_id = u.id
  WHERE u."branchId" = p_branch_id
    AND lower(u.role::text) <> 'tailor'
    AND (COALESCE(u.salary, 0) > 0 OR p.user_id IS NOT NULL)
  ORDER BY u.name;
$$;

CREATE OR REPLACE FUNCTION public.pay_employee(
  p_branch_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_period date,
  p_type text,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_employee record;
  v_period date := date_trunc('month', p_period)::date;
  v_salary numeric(14,2);
  v_taken numeric(14,2);
  v_remaining numeric(14,2);
  v_balance numeric(14,2);
  v_rate numeric(14,4);
  v_entry_id uuid;
  v_payment_id uuid;
  v_reference text;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
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
    RAISE EXCEPTION 'صرف الرواتب والسلف متاح للمالك أو المدير فقط';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('ADVANCE', 'SALARY') THEN
    RAISE EXCEPTION 'نوع الدفعة غير صالح';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع غير صالحة';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'المبلغ غير صالح';
  END IF;
  IF v_period IS NULL
     OR v_period > date_trunc('month', now() AT TIME ZONE 'Africa/Khartoum')::date THEN
    RAISE EXCEPTION 'لا يمكن الصرف لشهر مستقبلي';
  END IF;

  SELECT id, name, role, "branchId" AS branch_id, salary INTO v_employee
  FROM public.users WHERE id = p_employee_id;
  IF NOT FOUND OR v_employee.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا الفرع';
  END IF;
  IF lower(COALESCE(v_employee.role::text, '')) = 'tailor' THEN
    RAISE EXCEPTION 'الخياطين يُصرف لهم من مستحقات الخياطين وليس من الرواتب';
  END IF;

  v_salary := round(COALESCE(v_employee.salary, 0)::numeric, 2);
  IF v_salary <= 0 THEN
    RAISE EXCEPTION 'لا يوجد راتب مسجل للموظف %', v_employee.name;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('payroll-' || p_employee_id::text || '-' || v_period::text));

  SELECT round(COALESCE(sum(amount), 0), 2) INTO v_taken
  FROM public.employee_payments
  WHERE user_id = p_employee_id AND period = v_period;

  v_remaining := round(v_salary - v_taken, 2);
  IF p_amount > v_remaining THEN
    IF p_type = 'ADVANCE' THEN
      RAISE EXCEPTION 'السلفة مع المأخوذ في نفس الشهر تتجاوز الراتب. المتبقي: % ج.س', greatest(v_remaining, 0);
    END IF;
    RAISE EXCEPTION 'المبلغ يتجاوز المتبقي من راتب الشهر. المتبقي: % ج.س', greatest(v_remaining, 0);
  END IF;

  v_balance := public.get_account_balance(p_branch_id, p_payment_method, 'SDG');
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (جنيه). الرصيد الحالي: % ج.س',
      CASE WHEN p_payment_method = 'CASH' THEN 'الخزينة' ELSE 'البنك' END, v_balance;
  END IF;

  v_rate := public.require_exchange_rate(p_branch_id);
  v_reference := 'SAL-' || to_char(v_period, 'YYYYMM') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference
  ) VALUES (
    'JE-' || v_reference,
    'EXPENSE', p_amount, 'SDG', v_rate, round(p_amount / v_rate, 2),
    CASE WHEN p_type = 'ADVANCE' THEN 'سلفة راتب — ' ELSE 'صرف راتب — ' END
      || v_employee.name || ' — ' || to_char(v_period, 'YYYY-MM')
      || COALESCE(' - ' || v_notes, ''),
    'SALARIES', p_payment_method, p_branch_id, p_user_id, v_reference
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.employee_payments (
    branch_id, user_id, period, type, amount, payment_method,
    journal_entry_id, notes, created_by
  ) VALUES (
    p_branch_id, p_employee_id, v_period, p_type, p_amount, p_payment_method,
    v_entry_id, v_notes, p_user_id
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'id', v_payment_id,
    'journal_entry_id', v_entry_id,
    'reference', v_reference,
    'employee_id', p_employee_id,
    'period', v_period,
    'type', p_type,
    'amount', p_amount,
    'salary', v_salary,
    'taken', round(v_taken + p_amount, 2),
    'remaining', round(v_remaining - p_amount, 2)
  );
END;
$$;

/* ---------------------------------------------------------------------
   8) ملخص الخياطين في شهر: مستحقات الشهر، المأخوذ، المتبقي (الحالي)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.get_tailor_month_summary(p_branch_id uuid, p_period date)
RETURNS TABLE (
  tailor_id uuid,
  tailor_name text,
  tailor_phone text,
  is_active boolean,
  month_dues_sdg numeric,
  month_advances_sdg numeric,
  month_paid_sdg numeric,
  month_taken_sdg numeric,
  remaining_sdg numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', p_period)::timestamp AT TIME ZONE 'Africa/Khartoum') AS start_at,
           ((date_trunc('month', p_period) + interval '1 month')::timestamp AT TIME ZONE 'Africa/Khartoum') AS end_at
  ),
  tailors AS (
    SELECT u.id, u.name, u.phone, u."isActive"
    FROM public.users u
    WHERE u."branchId" = p_branch_id AND lower(u.role::text) = 'tailor'
  ),
  dues AS (
    SELECT t.id AS tailor_id, round(COALESCE(sum(d.cost_sdg), 0), 2) AS month_dues
    FROM tailors t
    CROSS JOIN bounds b
    LEFT JOIN LATERAL public.get_tailor_dues_orders(p_branch_id, t.id) d
      ON d.cost_recognized_at >= b.start_at AND d.cost_recognized_at < b.end_at
    GROUP BY t.id
  ),
  taken AS (
    SELECT p.tailor_id,
           round(COALESCE(sum(COALESCE(p.amount_original, p.amount * p.exchange_rate_used)) FILTER (WHERE p.payment_type = 'DUES_ADVANCE'), 0), 2) AS advances,
           round(COALESCE(sum(COALESCE(p.amount_original, p.amount * p.exchange_rate_used)) FILTER (WHERE p.payment_type <> 'DUES_ADVANCE'), 0), 2) AS paid
    FROM public.tailor_commission_payments p, bounds b
    WHERE p.branch_id = p_branch_id AND p.created_at >= b.start_at AND p.created_at < b.end_at
    GROUP BY p.tailor_id
  )
  SELECT t.id, t.name::text, t.phone::text, t."isActive",
         COALESCE(d.month_dues, 0),
         COALESCE(k.advances, 0),
         COALESCE(k.paid, 0),
         round(COALESCE(k.advances, 0) + COALESCE(k.paid, 0), 2),
         COALESCE(g.remaining_sdg, 0)
  FROM tailors t
  LEFT JOIN dues d ON d.tailor_id = t.id
  LEFT JOIN taken k ON k.tailor_id = t.id
  LEFT JOIN public.get_tailor_dues(p_branch_id, NULL) g ON g.tailor_id = t.id
  ORDER BY t."isActive" DESC, t.name;
$$;

/* ---------------------------------------------------------------------
   9) الصلاحيات: السيرفر فقط
--------------------------------------------------------------------- */

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_tailoring_order(uuid, uuid, uuid, text, text, text, jsonb, date, date, uuid, numeric, numeric, numeric, numeric, text, uuid, text, text, text)',
    'public.complete_sales_checkout(uuid, uuid, text, uuid, uuid, numeric, numeric, text, jsonb, text, jsonb, numeric)',
    'public.record_opening_cash(uuid, uuid, text, text, numeric, text)',
    'public.record_opening_inventory(uuid, uuid, uuid, numeric, numeric, text)',
    'public.get_payroll(uuid, date)',
    'public.pay_employee(uuid, uuid, uuid, date, text, numeric, text, text)',
    'public.get_tailor_month_summary(uuid, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

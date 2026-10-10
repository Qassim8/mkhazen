-- =====================================================================
-- SUPERSEDED — DO NOT APPLY. Never applied to production.
-- Replaced by the 20261010_* sequence (see docs/release-plan.md).
-- Kept only for review history.
-- =====================================================================

/* =====================================================================
   20261009_01 — استلام المشتريات ودفعات الموردين بعملية ذرّية + منع التكرار
   =====================================================================
   المشكلة اللي بيحلها:
   (1) استلام طلب الشراء كان بيتنفذ من التطبيق كخطوات منفصلة (تحديث رصيد كل
       صنف ← حركة مخزون ← تحديث البند ← القيد ← تغيير الحالة). أي فشل في النص
       كان بيسيب المخزون زايد من غير قيد محاسبي، والطلب "معلّق" للأبد لأن أي
       محاولة تانية بترفض ("تم استلام بنود هذا الطلب مسبقًا").
   (2) دفعة المورد: الفحص (المتبقي/الرصيد) والإدخال كانوا في طلبات منفصلة،
       فدفعتين متزامنتين ممكن تعدّي المتبقي أو تسحب الخزينة لتحت الصفر.
   (3) مفيش منع لتكرار العمليات المالية عند إعادة الإرسال (نقرتين / انقطاع
       الشبكة بعد الحفظ) → جدول api_idempotency_keys.

   الضمانات:
   • كل دالة = معاملة واحدة: يا كل التغييرات تتحفظ يا ولا حاجة.
   • قفل صف طلب الشراء (FOR UPDATE) → استلامين/دفعتين متزامنتين بيتسلسلوا.
   • قفل استشاري لكل (فرع + حساب) قبل فحص الرصيد → مفيش سحب مزدوج.
   • منطق توزيع التوصيل/الخصم ومتوسط التكلفة مطابق لكود التطبيق القديم
     (app/api/purchases/_lib/purchase-order.ts) — مع تقريب numeric دقيق.

   آمن:
   • ما بيمسحش ولا بيعدّل أي بيانات موجودة. بيضيف جدول ودالتين بس.
   • قابل لإعادة التشغيل (CREATE OR REPLACE / IF NOT EXISTS).
   • الرجوع: 20261009_01_atomic_purchases_and_idempotency.rollback.sql

   ترتيب التطبيق: على نسخة staging الأول، شغّل database/tests/run-db-tests،
   وبعدين على الإنتاج قبل نشر نسخة التطبيق الجديدة (التطبيق بيرجع رسالة
   "تحديث قاعدة البيانات مطلوب" لو الدوال مش موجودة، وما بيرجعش للمسار القديم).
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) جدول منع التكرار (Idempotency)
   key = scope:user:client-key  — بيتملى من التطبيق قبل تنفيذ العملية.
   PENDING  = العملية بدأت (أو انقطعت في النص → بنمنع إعادة التنفيذ)
   COMPLETED = العملية نجحت والرد متخزن → إعادة الإرسال بترجع نفس الرد
--------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  key             text PRIMARY KEY,
  scope           text NOT NULL,
  user_id         uuid,
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS api_idempotency_keys_created_at_idx
  ON public.api_idempotency_keys (created_at);

COMMENT ON TABLE public.api_idempotency_keys IS
  'منع تكرار العمليات المالية عند إعادة الإرسال. آمن للحذف للسجلات الأقدم من 30 يوم.';

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

/* ---------------------------------------------------------------------
   2) استلام طلب شراء (ذرّي)
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id  uuid,
  p_user_id   uuid,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order               record;
  v_user_role           text;
  v_item                record;
  v_variant             record;
  v_items_count         integer := 0;
  v_total_subtotal      numeric := 0;
  v_total_selling_qty   numeric := 0;
  v_delivery            numeric;
  v_discount            numeric;
  v_delivery_per_unit   numeric;
  v_factor              numeric;
  v_raw_selling_qty     numeric;
  v_selling_qty         numeric;
  v_line_subtotal       numeric;
  v_base_cost           numeric;
  v_allocated_delivery  numeric;
  v_discount_share      numeric;
  v_discount_per_unit   numeric;
  v_effective_cost      numeric;
  v_current_stock       numeric;
  v_current_avg         numeric;
  v_new_stock           numeric;
  v_new_avg             numeric;
  v_journal_id          uuid;
  v_entry_number        text;
  v_total               numeric;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  SELECT lower(role::text) INTO v_user_role FROM public.users WHERE id = p_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'استلام طلبات الشراء متاح للمالك أو المدير فقط';
  END IF;

  -- القفل: أي استلام متزامن لنفس الطلب بيستنى هنا ويلاقي الحالة اتغيرت
  SELECT id, order_number, status::text AS status, delivery_cost, discount_amount,
         total_amount, journal_entry_id
  INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب الشراء غير موجود';
  END IF;

  IF v_order.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'لا يمكن استلام هذا الطلب في حالته الحالية';
  END IF;

  v_total := round(COALESCE(v_order.total_amount, 0), 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء قيد شراء بمبلغ صفر';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id AND COALESCE(received_quantity, 0) > 0
  ) THEN
    RAISE EXCEPTION 'تم استلام بنود هذا الطلب مسبقًا';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE purchase_order_id = p_order_id AND movement_type::text = 'PURCHASE'
  ) THEN
    RAISE EXCEPTION 'تم تسجيل حركة استلام لهذا الطلب مسبقًا';
  END IF;

  /* --- إجماليات التوزيع (نفس allocateDeliveryCost في التطبيق) --- */
  SELECT
    count(*),
    COALESCE(sum(COALESCE(i.quantity, 0) * COALESCE(i.unit_cost, 0)), 0),
    COALESCE(sum(
      COALESCE(i.quantity, 0) *
      CASE WHEN COALESCE(t."conversionFactor", 0) > 0 THEN t."conversionFactor" ELSE 1 END
    ), 0)
  INTO v_items_count, v_total_subtotal, v_total_selling_qty
  FROM public.purchase_order_items i
  LEFT JOIN public.product_templates t ON t.id = i.template_id
  WHERE i.purchase_order_id = p_order_id;

  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'لم يتم العثور على بنود لطلب الشراء هذا';
  END IF;

  v_delivery := greatest(0, COALESCE(v_order.delivery_cost, 0));
  v_discount := greatest(0, COALESCE(v_order.discount_amount, 0));
  v_delivery_per_unit := CASE WHEN v_total_selling_qty > 0 THEN v_delivery / v_total_selling_qty ELSE 0 END;

  /* --- البنود: ترتيب ثابت بمعرّف الصنف لتقليل احتمال الـ deadlock --- */
  FOR v_item IN
    SELECT i.id, i.template_id, i.variant_id,
           COALESCE(i.quantity, 0)  AS quantity,
           COALESCE(i.unit_cost, 0) AS unit_cost,
           i.unit_cost              AS unit_cost_raw,
           CASE WHEN COALESCE(t."conversionFactor", 0) > 0 THEN t."conversionFactor" ELSE 1 END AS factor
    FROM public.purchase_order_items i
    LEFT JOIN public.product_templates t ON t.id = i.template_id
    WHERE i.purchase_order_id = p_order_id
    ORDER BY i.variant_id, i.id
  LOOP
    v_factor := v_item.factor;
    v_raw_selling_qty := v_item.quantity * v_factor;
    v_selling_qty := round(v_raw_selling_qty, 2);

    IF v_selling_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية المحولة إلى وحدة البيع غير صالحة';
    END IF;

    v_line_subtotal := v_item.quantity * v_item.unit_cost;
    v_base_cost := v_item.unit_cost / v_factor;
    v_allocated_delivery := round(v_delivery_per_unit * v_raw_selling_qty, 2);
    v_discount_share := CASE WHEN v_total_subtotal > 0 THEN (v_line_subtotal / v_total_subtotal) * v_discount ELSE 0 END;
    v_discount_per_unit := CASE WHEN v_raw_selling_qty > 0 THEN v_discount_share / v_raw_selling_qty ELSE 0 END;
    -- تكلفة وحدة البيع الفعلية (شاملة نصيبها من التوصيل وناقص نصيبها من الخصم)
    v_effective_cost := round(greatest(0, v_base_cost + v_delivery_per_unit - v_discount_per_unit), 2);

    SELECT id, "stockQuantity", "averageCost", "purchasePrice"
    INTO v_variant
    FROM public.product_variants
    WHERE id = v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'تعذر العثور على متغيّر المنتج (%)', v_item.variant_id;
    END IF;

    v_current_stock := COALESCE(v_variant."stockQuantity", 0);
    v_current_avg := CASE
      WHEN v_current_stock > 0
        THEN COALESCE(v_variant."averageCost", COALESCE(v_variant."purchasePrice", 0) / v_factor)
      ELSE 0
    END;
    v_new_stock := v_current_stock + v_selling_qty;
    v_new_avg := CASE
      WHEN v_new_stock > 0
        THEN round((v_current_stock * v_current_avg + v_selling_qty * v_effective_cost) / v_new_stock, 2)
      ELSE v_effective_cost
    END;

    -- purchasePrice يفضل بوحدة الشراء (آخر سعر شراء)، averageCost بوحدة البيع
    UPDATE public.product_variants
    SET "stockQuantity" = v_new_stock,
        "averageCost"   = v_new_avg,
        "purchasePrice" = COALESCE(v_item.unit_cost_raw, "purchasePrice"),
        "updatedAt"     = now()
    WHERE id = v_item.variant_id;

    INSERT INTO public.inventory_movements (
      template_id, variant_id, purchase_order_id, movement_type,
      quantity, unit_cost, reference, created_by
    ) VALUES (
      v_item.template_id, v_item.variant_id, p_order_id, 'PURCHASE',
      v_selling_qty, v_effective_cost, 'PO-' || v_order.order_number, p_user_id
    );

    UPDATE public.purchase_order_items
    SET received_quantity       = v_item.quantity,
        allocated_delivery_cost = v_allocated_delivery,
        effective_unit_cost     = v_effective_cost
    WHERE id = v_item.id;
  END LOOP;

  /* --- قيد الشراء: مدين المخزون / دائن الموردين بإجمالي الفاتورة الفعلي --- */
  v_journal_id := v_order.journal_entry_id;

  IF v_journal_id IS NULL THEN
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE purchase_order_id = p_order_id
      AND entry_type::text = 'PURCHASE'
      AND branch_id = p_branch_id
    LIMIT 1;
  END IF;

  IF v_journal_id IS NULL THEN
    v_entry_number := 'JE-' || to_char(now(), 'YYYY') || '-' ||
                      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

    -- العملة وسعر الصرف بيتحددوا من الـ trigger الموجود على journal_entries
    -- (نفس سلوك التطبيق القديم اللي ما كانش بيبعت currency لقيد الشراء)
    INSERT INTO public.journal_entries (
      entry_number, purchase_order_id, created_by, branch_id, entry_type,
      amount, description, reference, debit_account, credit_account
    ) VALUES (
      v_entry_number, p_order_id, p_user_id, p_branch_id, 'PURCHASE',
      v_total, 'شراء ' || v_order.order_number, 'PO-' || v_order.order_number,
      'INVENTORY', 'SUPPLIERS'
    )
    RETURNING id INTO v_journal_id;
  END IF;

  UPDATE public.purchase_orders
  SET status           = 'RECEIVED',
      received_by      = p_user_id,
      journal_entry_id = v_journal_id,
      updated_at       = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'order_number',     v_order.order_number,
    'status',           'RECEIVED',
    'items_count',      v_items_count,
    'journal_entry_id', v_journal_id,
    'total_amount',     v_total
  );
END;
$$;

/* ---------------------------------------------------------------------
   3) دفعة لمورد عن طلب شراء (ذرّية)
   الرصيد بنفس معادلة الواجهة (app/api/accounting/_lib/ledger.ts → moneyBalance):
   مجموع amount للقيود بعملة USD على الحساب مدينًا − دائنًا.
--------------------------------------------------------------------- */

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
  v_order        record;
  v_user_role    text;
  v_amount       numeric;
  v_paid         numeric;
  v_remaining    numeric;
  v_account      text;
  v_balance      numeric;
  v_payment      jsonb;
  v_journal_id   uuid;
  v_entry_number text;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الدفعة غير مكتملة';
  END IF;

  SELECT lower(role::text) INTO v_user_role FROM public.users WHERE id = p_user_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'تسجيل دفعات الموردين متاح للمالك أو المدير فقط';
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

  SELECT id, order_number, status::text AS status, total_amount
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

  v_remaining := greatest(0, round(COALESCE(v_order.total_amount, 0) - v_paid, 2));

  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'مبلغ الدفعة أكبر من المبلغ المتبقي (% $)', to_char(v_remaining, 'FM999999999990.00');
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

  -- أي سحب متزامن من نفس الحساب بيستنى هنا لحد ما المعاملة دي تخلص
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':USD'));

  SELECT COALESCE(sum(
    CASE
      WHEN debit_account::text = v_account THEN amount
      WHEN credit_account::text = v_account THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_balance
  FROM public.journal_entries
  WHERE branch_id = p_branch_id
    AND currency::text = 'USD'
    AND (debit_account::text = v_account OR credit_account::text = v_account);

  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (دولار). الرصيد الحالي % $ — يمكنك تحويل جنيه إلى دولار من صفحة المحاسبة',
      CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      to_char(v_balance, 'FM999999999990.00');
  END IF;

  -- القيم اللي ممكن أعمدتها تكون enum بتتبعت كـ literal (عشان التحويل يشتغل في الحالتين)
  EXECUTE format(
    'INSERT INTO public.purchase_order_payments
       (purchase_order_id, amount, payment_date, payment_method, reference, notes, created_by)
     VALUES ($1, $2, $3, %L, $4, $5, $6)
     RETURNING to_jsonb(purchase_order_payments.*)',
    p_payment_method
  )
  INTO v_payment
  USING p_order_id, v_amount, p_payment_date, NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''), p_user_id;

  v_entry_number := 'JE-' || to_char(now(), 'YYYY') || '-' ||
                    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  EXECUTE format(
    'INSERT INTO public.journal_entries
       (entry_number, purchase_order_id, created_by, branch_id, entry_type,
        amount, description, reference, debit_account, credit_account)
     VALUES ($1, $2, $3, $4, %L, $5, $6, $7, %L, %L)
     RETURNING id',
    'PURCHASE_PAYMENT', 'SUPPLIERS', v_account
  )
  INTO v_journal_id
  USING v_entry_number, p_order_id, p_user_id, p_branch_id, v_amount,
        'دفعة للمورد عن طلب الشراء ' || v_order.order_number,
        NULLIF(btrim(p_reference), '');

  RETURN v_payment || jsonb_build_object('journal_entry_id', v_journal_id);
END;
$$;

/* ---------------------------------------------------------------------
   4) الصلاحيات: للسيرفر بس (service_role). anon/authenticated ممنوعين.
--------------------------------------------------------------------- */

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM PUBLIC;
REVOKE ALL ON TABLE public.api_idempotency_keys FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.api_idempotency_keys FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.api_idempotency_keys FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_idempotency_keys TO service_role';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- 20261023_01_cashier_operator_permissions.sql
--
-- الكاشير هو المشغّل الفعلي للمتجر: يُسمح له بدور cashier في الدوال التي تفحص
-- الدور داخليًا — فقط ما يلزم وبدون أي تغيير آخر في منطقها:
--
--   1) receive_purchase_order    استلام أمر الشراء       (owner, admin) -> + cashier
--   2) record_purchase_payment   دفعة المورد             (owner, admin) -> + cashier
--   3) notify_variant_stock      إشعارات النواقص/النفاد تُوجَّه إلى المالك والمدير
--                                والكاشير (target_roles) بدل null
--   4) الإشعارات القائمة (LOW_STOCK / OUT_OF_STOCK) تُضاف لها cashier (idempotent)
--
-- لا تغيير مطلوب في: process_inventory_adjustment و create_asset_with_journal_entry
-- (لا يفحصان الدور داخليًا)، وتسجيل المصروف وتحديث سعر الصرف (يُنفَّذان من الـ API
-- مباشرة بلا فحص دور في قاعدة البيانات). اعتماد أمر الشراء يبقى للمالك فقط في الـ API.
--
-- التعريفات مبنية على آخر نسخة في المشروع:
--   receive_purchase_order / record_purchase_payment : 20261010_02_atomic_purchases_and_idempotency.sql
--   notify_variant_stock                             : database/audit/live_public_schema.sql
-- Idempotent: CREATE OR REPLACE + UPDATE بشرط عدم وجود cashier.
-- =====================================================================

BEGIN;

/* ---------------------------------------------------------------------
   1) receive_purchase_order
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
  v_user                record;
  v_order               record;
  v_item                record;
  v_variant             record;
  v_items_count         integer := 0;
  v_total_subtotal      numeric := 0;
  v_total_selling_qty   numeric := 0;
  v_delivery            numeric;
  v_discount            numeric;
  v_delivery_per_unit   numeric;
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
  v_total               numeric;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active OR v_user.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح لهذا الفرع';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin', 'cashier') THEN
    RAISE EXCEPTION 'استلام طلبات الشراء متاح للمالك أو المدير أو الكاشير فقط';
  END IF;

  -- Concurrent receipts of the same order wait here, then see RECEIVED
  SELECT id, order_number, status, delivery_cost, discount_amount, total_amount, journal_entry_id
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

  v_total := round(v_order.total_amount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء قيد شراء بمبلغ صفر';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'تم استلام بنود هذا الطلب مسبقًا';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE purchase_order_id = p_order_id AND movement_type = 'PURCHASE'
  ) THEN
    RAISE EXCEPTION 'تم تسجيل حركة استلام لهذا الطلب مسبقًا';
  END IF;

  /* Allocation totals — same as allocateDeliveryCost() in
     app/api/purchases/_lib/purchase-costs.ts */
  SELECT
    count(*),
    COALESCE(sum(i.quantity * i.unit_cost), 0),
    COALESCE(sum(i.quantity * COALESCE(NULLIF(t."conversionFactor", 0), 1)), 0)
  INTO v_items_count, v_total_subtotal, v_total_selling_qty
  FROM public.purchase_order_items i
  JOIN public.product_templates t ON t.id = i.template_id
  WHERE i.purchase_order_id = p_order_id;

  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'لم يتم العثور على بنود لطلب الشراء هذا';
  END IF;

  v_delivery := greatest(0, v_order.delivery_cost);
  v_discount := greatest(0, v_order.discount_amount);
  v_delivery_per_unit := CASE WHEN v_total_selling_qty > 0 THEN v_delivery / v_total_selling_qty ELSE 0 END;

  -- Stable lock order (variant_id) to reduce deadlock risk with checkout
  FOR v_item IN
    SELECT i.id, i.template_id, i.variant_id, i.quantity, i.unit_cost,
           COALESCE(NULLIF(t."conversionFactor", 0), 1) AS factor
    FROM public.purchase_order_items i
    JOIN public.product_templates t ON t.id = i.template_id
    WHERE i.purchase_order_id = p_order_id
    ORDER BY i.variant_id, i.id
  LOOP
    v_raw_selling_qty := v_item.quantity * v_item.factor;
    v_selling_qty := round(v_raw_selling_qty, 2);

    IF v_selling_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية المحولة إلى وحدة البيع غير صالحة';
    END IF;

    v_line_subtotal := v_item.quantity * v_item.unit_cost;
    v_base_cost := v_item.unit_cost / v_item.factor;
    v_allocated_delivery := round(v_delivery_per_unit * v_raw_selling_qty, 2);
    v_discount_share := CASE WHEN v_total_subtotal > 0 THEN (v_line_subtotal / v_total_subtotal) * v_discount ELSE 0 END;
    v_discount_per_unit := CASE WHEN v_raw_selling_qty > 0 THEN v_discount_share / v_raw_selling_qty ELSE 0 END;
    -- effective cost per selling unit (incl. delivery share, net of discount share)
    v_effective_cost := round(greatest(0, v_base_cost + v_delivery_per_unit - v_discount_per_unit), 2);

    SELECT id, "stockQuantity", "averageCost", "purchasePrice"
    INTO v_variant
    FROM public.product_variants
    WHERE id = v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'تعذر العثور على متغيّر المنتج (%)', v_item.variant_id;
    END IF;

    v_current_stock := v_variant."stockQuantity";
    -- Same cost basis as complete_sales_checkout / process_inventory_adjustment:
    -- averageCost 0 means "unknown" → purchasePrice per selling unit
    v_current_avg := CASE
      WHEN v_current_stock > 0
        THEN COALESCE(NULLIF(v_variant."averageCost", 0), v_variant."purchasePrice" / v_item.factor)
      ELSE 0
    END;
    v_new_stock := v_current_stock + v_selling_qty;
    v_new_avg := round((v_current_stock * v_current_avg + v_selling_qty * v_effective_cost) / v_new_stock, 2);

    -- purchasePrice stays per PURCHASE unit (last cost); averageCost per SELLING unit
    UPDATE public.product_variants
    SET "stockQuantity" = v_new_stock,
        "averageCost"   = v_new_avg,
        "purchasePrice" = v_item.unit_cost,
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

  /* Purchase journal: DR INVENTORY / CR SUPPLIERS for the actual invoice total.
     currency/amount_usd come from snapshot_journal_currency() (→ USD). */
  v_journal_id := v_order.journal_entry_id;

  IF v_journal_id IS NULL THEN
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE purchase_order_id = p_order_id
      AND entry_type = 'PURCHASE'
      AND branch_id = p_branch_id
    LIMIT 1;
  END IF;

  IF v_journal_id IS NULL THEN
    INSERT INTO public.journal_entries (
      entry_number, purchase_order_id, created_by, branch_id, entry_type,
      amount, description, reference, debit_account, credit_account
    ) VALUES (
      'JE-' || to_char(now(), 'YYYY') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      p_order_id, p_user_id, p_branch_id, 'PURCHASE',
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
   2) record_purchase_payment
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
  v_user       record;
  v_order      record;
  v_amount     numeric;
  v_paid       numeric;
  v_remaining  numeric;
  v_account    text;
  v_balance    numeric;
  v_payment    public.purchase_order_payments;
  v_journal_id uuid;
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
    RAISE EXCEPTION 'تسجيل دفعات الموردين متاح للمالك أو المدير أو الكاشير فقط';
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

  SELECT id, order_number, status, total_amount
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

  v_remaining := greatest(0, round(v_order.total_amount - v_paid, 2));

  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'مبلغ الدفعة أكبر من المبلغ المتبقي (% $)', to_char(v_remaining, 'FM999999999990.00');
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

  -- Concurrent cash-outs from the same account wait here
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':USD'));

  -- Same balance the UI shows (live function, USD entries only)
  v_balance := public.get_account_balance(p_branch_id, v_account, 'USD');

  IF v_amount > v_balance THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ في % (دولار). الرصيد الحالي % $ — يمكنك تحويل جنيه إلى دولار من صفحة المحاسبة',
      CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      to_char(v_balance, 'FM999999999990.00');
  END IF;

  INSERT INTO public.purchase_order_payments (
    purchase_order_id, amount, payment_date, payment_method, reference, notes, created_by
  ) VALUES (
    p_order_id, v_amount, p_payment_date, p_payment_method,
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''), p_user_id
  )
  RETURNING * INTO v_payment;

  -- currency/amount_usd come from snapshot_journal_currency() (→ USD)
  INSERT INTO public.journal_entries (
    entry_number, purchase_order_id, created_by, branch_id, entry_type,
    amount, description, reference, debit_account, credit_account
  ) VALUES (
    'JE-' || to_char(now(), 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_order_id, p_user_id, p_branch_id, 'PURCHASE_PAYMENT',
    v_amount, 'دفعة للمورد عن طلب الشراء ' || v_order.order_number,
    NULLIF(btrim(p_reference), ''), 'SUPPLIERS', v_account
  )
  RETURNING id INTO v_journal_id;

  RETURN to_jsonb(v_payment) || jsonb_build_object('journal_entry_id', v_journal_id);
END;
$$;

/* ---------------------------------------------------------------------
   3) notify_variant_stock
--------------------------------------------------------------------- */

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

  INSERT INTO public.notifications (title, message, type, link, metadata, target_roles)
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
    jsonb_build_object('key', v_key, 'variant_id', p_variant_id, 'status', p_status),
    ARRAY['owner', 'admin', 'cashier']
  );
END;
$$;

-- 4) إشعارات المخزون القائمة: تظهر للكاشير أيضًا (المالك والمدير كما هم)
UPDATE public.notifications
SET target_roles = CASE
  WHEN target_roles IS NULL THEN ARRAY['owner', 'admin', 'cashier']
  ELSE array_append(target_roles, 'cashier')
END
WHERE type IN ('LOW_STOCK', 'OUT_OF_STOCK')
  AND (target_roles IS NULL OR NOT ('cashier' = ANY (target_roles)));

COMMIT;

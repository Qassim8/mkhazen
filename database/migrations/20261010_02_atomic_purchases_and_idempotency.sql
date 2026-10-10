/* =====================================================================
   20261010_02 — Atomic purchase receipt + supplier payment + idempotency
   =====================================================================
   Supersedes the never-applied 20261009_01 (moved to migrations/superseded/).
   Reconciled against database/audit/live_public_schema.sql — see
   docs/live-database-audit.md §5 for every difference.

   New objects (none exist in the live schema):
     • table    public.api_idempotency_keys
     • function public.receive_purchase_order(uuid, uuid, uuid)
     • function public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text)

   Live objects this depends on (unchanged):
     • purchase_orders / purchase_order_items / purchase_order_payments,
       product_variants ("averageCost" numeric(12,2) NOT NULL DEFAULT 0),
       product_templates ("conversionFactor"), inventory_movements, users ("Role" enum)
     • trigger journal_entries_currency_snapshot → snapshot_journal_currency()
       (PURCHASE and SUPPLIERS↔CASH/BANK entries resolve to USD, amount_usd = amount)
     • trigger inventory_movements_usd_cost_snapshot, trg_product_variants_stock_notify,
       update_product_variants_updated_at (fire as before)
     • function get_account_balance(uuid, text, text) — same balance the UI shows

   Guarantees:
     • each function is one transaction: all changes or none;
     • purchase_orders row locked FOR UPDATE → concurrent receipts/payments serialize;
     • variants locked FOR UPDATE in variant_id order;
     • transaction-scoped advisory lock per (branch, account, USD) around the
       balance check → no concurrent overdraft from this path;
     • caller checks mirror the existing RPCs: user exists, active, role
       owner/admin, users."branchId" = p_branch_id;
     • SECURITY INVOKER + fixed search_path; EXECUTE only for service_role.

   Idempotent. Touches no existing rows. Rollback: 20261010_02_….rollback.sql
   ===================================================================== */

BEGIN;

/* ---------------------------------------------------------------------
   1) Idempotency keys (written by lib/idempotency.ts through service_role)
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
  'Duplicate-submission guard for money operations. Rows older than 30 days are safe to delete.';

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

/* ---------------------------------------------------------------------
   2) Atomic purchase receipt
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

  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'استلام طلبات الشراء متاح للمالك أو المدير فقط';
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
   3) Atomic supplier payment (USD, from CASH or BANK)
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

  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
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
   4) Privileges: server only. No GRANT to anon/authenticated/PUBLIC anywhere.
--------------------------------------------------------------------- */

REVOKE ALL ON TABLE public.api_idempotency_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_idempotency_keys TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

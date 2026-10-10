/* =====================================================================
   Rollback of 20261010_04_legacy_function_cleanup.sql
   =====================================================================
   Re-creates the four legacy functions exactly as in
   database/audit/live_public_schema.sql (bodies copied verbatim by
   scripts in the release; do not edit by hand), with TWO deliberate
   differences that keep the rollback safe for production:
     • the two SECURITY DEFINER functions get SET search_path = public, pg_temp
       (the live originals had none — a privilege-escalation risk);
     • EXECUTE is granted to service_role only — never to anon/authenticated/PUBLIC.
   The trigger functions are NOT attached to any trigger (they were not
   attached in the live schema either).
   ===================================================================== */

BEGIN;

-- process_purchase_order_receipt(uuid) — verbatim from live_public_schema.sql
CREATE OR REPLACE FUNCTION "public"."process_purchase_order_receipt"("po_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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

ALTER FUNCTION "public"."process_purchase_order_receipt"(uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_purchase_order_receipt"(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."process_purchase_order_receipt"(uuid) TO service_role;

-- journal_entries_apply_currency() — verbatim from live_public_schema.sql
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
REVOKE ALL ON FUNCTION "public"."journal_entries_apply_currency"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."journal_entries_apply_currency"() TO service_role;

-- sales_orders_apply_exchange_rate() — verbatim from live_public_schema.sql
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
REVOKE ALL ON FUNCTION "public"."sales_orders_apply_exchange_rate"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."sales_orders_apply_exchange_rate"() TO service_role;

-- update_tailoring_order_status(uuid, uuid, uuid, text) — verbatim from live_public_schema.sql
CREATE OR REPLACE FUNCTION "public"."update_tailoring_order_status"("p_order_id" "uuid", "p_user_id" "uuid", "p_branch_id" "uuid", "p_new_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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

ALTER FUNCTION "public"."update_tailoring_order_status"(uuid, uuid, uuid, text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."update_tailoring_order_status"(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."update_tailoring_order_status"(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

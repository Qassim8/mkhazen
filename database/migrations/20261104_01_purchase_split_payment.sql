/* =====================================================================
   دفع مزدوج (خزنة + بنك) في المشتريات: عند الاستلام وفي الدفعات اللاحقة للمورد

   دالتان جديدتان فوق الدوال الحالية (لا تعديل على أي دالة موجودة، ولا على بنية الجداول):

   • public.record_purchase_payment_split(order, user, branch, cash, bank, date, reference, notes)
       دفعة لاحقة للمورد: مبلغ من الخزنة ومبلغ من البنك. مجموعهما هو مبلغ الدفعة وقد يكون أقل
       من المتبقي (الباقي يبقى دينًا على المورد كما الآن). تفحص رصيد كل حساب بالدولار بنفس
       الفحص المسبق (check_purchase_payment_funds) قبل أي تسجيل، ثم تسجّل كل جزء بـ
       record_purchase_payment نفسها: صف في purchase_order_payments وقيد
       (SUPPLIERS / CASH) وآخر (SUPPLIERS / BANK) — كله في معاملة واحدة.
   • public.receive_purchase_order_with_split_payment(...)
       الاستلام مع الدفع المزدوج في معاملة واحدة: فحص الحسابين أولًا ثم الاستلام ثم الدفعتين.
       أي جزء غير مغطى أو أي فشل يرفض العملية كلها (لا مخزون ولا حركة ولا قيد ولا دفعة).

   تعتمد على 20261103_01_purchase_receive_with_payment.sql (check_purchase_payment_funds)،
   فشغّله قبلها. شغّل هذا الملف على staging ثم production بعد النسخ الاحتياطي. آمن لإعادة التشغيل.
   ===================================================================== */

CREATE OR REPLACE FUNCTION public.record_purchase_payment_split(
  p_order_id     uuid,
  p_user_id      uuid,
  p_branch_id    uuid,
  p_cash_amount  numeric,
  p_bank_amount  numeric,
  p_payment_date timestamptz,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash      numeric := round(COALESCE(p_cash_amount, 0), 2);
  v_bank      numeric := round(COALESCE(p_bank_amount, 0), 2);
  v_order     record;
  v_paid      numeric;
  v_remaining numeric;
  v_cash_res  jsonb;
  v_bank_res  jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الدفعة غير مكتملة';
  END IF;

  IF v_cash < 0 OR v_bank < 0 THEN
    RAISE EXCEPTION 'مبلغ الخزينة ومبلغ البنك لا يمكن أن يكونا سالبين';
  END IF;

  IF v_cash + v_bank <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- مجموع الجزأين لا يتجاوز المتبقي (حالة الطلب نفسها تفحصها record_purchase_payment)
  SELECT id, status, total_amount INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF FOUND AND v_order.status IN ('APPROVED', 'RECEIVED') THEN
    SELECT COALESCE(sum(amount), 0) INTO v_paid
    FROM public.purchase_order_payments
    WHERE purchase_order_id = p_order_id;

    v_remaining := greatest(0, round(v_order.total_amount - v_paid, 2));

    IF v_cash + v_bank > v_remaining THEN
      RAISE EXCEPTION 'مجموع الدفعة أكبر من المبلغ المتبقي (% $)', to_char(v_remaining, 'FM999999999990.00');
    END IF;
  END IF;

  -- قبل أي تسجيل: كل جزء يجب أن يكون مغطى برصيد حسابه
  PERFORM public.check_purchase_payment_funds(p_branch_id, 'CASH', v_cash);
  PERFORM public.check_purchase_payment_funds(p_branch_id, 'BANK', v_bank);

  IF v_cash > 0 THEN
    v_cash_res := public.record_purchase_payment(
      p_order_id, p_user_id, p_branch_id, v_cash, p_payment_date, 'CASH', p_reference, p_notes
    );
  END IF;

  IF v_bank > 0 THEN
    v_bank_res := public.record_purchase_payment(
      p_order_id, p_user_id, p_branch_id, v_bank, p_payment_date, 'BANK', p_reference, p_notes
    );
  END IF;

  RETURN jsonb_build_object(
    'amount', v_cash + v_bank,
    'cash',   v_cash_res,
    'bank',   v_bank_res
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_with_split_payment(
  p_order_id     uuid,
  p_user_id      uuid,
  p_branch_id    uuid,
  p_cash_amount  numeric,
  p_bank_amount  numeric,
  p_payment_date timestamptz,
  p_reference    text DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash    numeric := round(COALESCE(p_cash_amount, 0), 2);
  v_bank    numeric := round(COALESCE(p_bank_amount, 0), 2);
  v_status  text;
  v_receipt jsonb;
  v_payment jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  IF v_cash < 0 OR v_bank < 0 THEN
    RAISE EXCEPTION 'مبلغ الخزينة ومبلغ البنك لا يمكن أن يكونا سالبين';
  END IF;

  IF v_cash + v_bank <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- لو الطلب ليس جاهزًا للاستلام ترفضه receive_purchase_order برسالتها المعتادة
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id = p_order_id;

  IF v_status = 'APPROVED' THEN
    -- قبل أي تعديل: لو أي حساب لا يكفي يُرفض الاستلام كله
    PERFORM public.check_purchase_payment_funds(p_branch_id, 'CASH', v_cash);
    PERFORM public.check_purchase_payment_funds(p_branch_id, 'BANK', v_bank);
  END IF;

  v_receipt := public.receive_purchase_order(p_order_id, p_user_id, p_branch_id);

  v_payment := public.record_purchase_payment_split(
    p_order_id, p_user_id, p_branch_id, v_cash, v_bank, p_payment_date, p_reference, p_notes
  );

  RETURN v_receipt || jsonb_build_object('payment', v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.record_purchase_payment_split(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order_with_split_payment(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_payment_split(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_with_split_payment(uuid, uuid, uuid, numeric, numeric, timestamptz, text, text) TO service_role;

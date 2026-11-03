/* =====================================================================
   استلام أمر الشراء مع الدفع: لا استلام جزئي ناجح

   المشكلة: الاستلام ثم الدفع كانا استدعاءين منفصلين؛ لو رصيد الحساب لا يكفي
   يُضاف المخزون ثم يفشل الدفع ("تمت إضافة الشحنة ولم يُسجل الدفع").

   الحل (دالتان جديدتان، لا تعديل على الدوال الحالية):
   • public.check_purchase_payment_funds(branch, method, amount)
       يفحص رصيد الخزينة/البنك بالدولار (عملة المشتريات) بنفس منطق record_purchase_payment
       (نفس القفل ونفس get_account_balance)، ويرفض برسالة عربية فيها المتاح والمطلوب،
       وتُضاف جملة التحويل لو الحساب فيه رصيد جنيه يكفي بسعر الصرف الحالي.
   • public.receive_purchase_order_with_payment(...)
       في معاملة واحدة: فحص الرصيد أولًا (قبل أي تعديل) ثم receive_purchase_order ثم
       record_purchase_payment. أي فشل يُرجع كل شيء: لا مخزون ولا حركة ولا قيد
       ولا تغيير في حالة الأمر.

   الاستلام بدون دفع، والدفع على مراحل لاحقًا (record_purchase_payment)، لم يتغيرا.
   شغّله على staging ثم production بعد النسخ الاحتياطي. آمن لإعادة التشغيل.
   ===================================================================== */

CREATE OR REPLACE FUNCTION public.check_purchase_payment_funds(
  p_branch_id      uuid,
  p_payment_method text,
  p_amount         numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account text;
  v_amount  numeric;
  v_balance numeric;
  v_sdg     numeric;
  v_rate    numeric;
  v_hint    boolean := false;
BEGIN
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK') THEN
    RAISE EXCEPTION 'طريقة الدفع يجب أن تكون خزينة أو بنك';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  v_account := CASE WHEN p_payment_method = 'BANK' THEN 'BANK' ELSE 'CASH' END;

  -- نفس القفل الذي تستخدمه record_purchase_payment: الصرف المتزامن من نفس الحساب ينتظر
  PERFORM pg_advisory_xact_lock(hashtext('cash-out:' || p_branch_id::text || ':' || v_account || ':USD'));

  v_balance := public.get_account_balance(p_branch_id, v_account, 'USD');

  IF v_amount > v_balance THEN
    v_sdg  := public.get_account_balance(p_branch_id, v_account, 'SDG');
    v_rate := public.get_current_exchange_rate(p_branch_id);
    v_hint := v_rate IS NOT NULL AND v_rate > 0 AND round(v_sdg / v_rate, 2) >= v_amount;

    RAISE EXCEPTION 'رصيد % غير كافٍ: المتاح % دولار، والمطلوب % دولار. موّل الحساب أولًا أو أدخل مبلغ دفع أقل%.',
      CASE WHEN v_account = 'BANK' THEN 'البنك' ELSE 'الخزينة' END,
      to_char(v_balance, 'FM999999999990.00'),
      to_char(v_amount, 'FM999999999990.00'),
      CASE WHEN v_hint THEN ' أو حوّل العملة من صفحة تحويل العملة' ELSE '' END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_with_payment(
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
  v_status  text;
  v_receipt jsonb;
  v_payment jsonb;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الاستلام غير مكتملة';
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر';
  END IF;

  -- لو الطلب ليس جاهزًا للاستلام ترفضه receive_purchase_order برسالتها المعتادة
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id = p_order_id;

  IF v_status = 'APPROVED' THEN
    -- قبل أي تعديل: لو الرصيد لا يكفي يُرفض الاستلام كله
    PERFORM public.check_purchase_payment_funds(p_branch_id, p_payment_method, p_amount);
  END IF;

  v_receipt := public.receive_purchase_order(p_order_id, p_user_id, p_branch_id);

  v_payment := public.record_purchase_payment(
    p_order_id, p_user_id, p_branch_id, p_amount, p_payment_date, p_payment_method, p_reference, p_notes
  );

  RETURN v_receipt || jsonb_build_object('payment', v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.check_purchase_payment_funds(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order_with_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_purchase_payment_funds(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_with_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text) TO service_role;

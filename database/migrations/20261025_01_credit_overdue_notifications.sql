/* =====================================================================
   20261025_01 — إشعار الذمم المتأخرة (البيع بالتقسيط)
   =====================================================================
   بنفس أسلوب إشعارات تأخر التفصيل الحالية:
   • generate_overdue_credit_notifications(branch): إشعار واحد لكل فاتورة آجلة مفتوحة
     تجاوزت تاريخ الاستحقاق (مفتاح CREDIT_OVERDUE:<id> يمنع التكرار)، موجّه للإدارة
     (target_roles = NULL = المالك والمدير)، ويُقفل (isRead) تلقائيًا بعد سداد/إغلاق الفاتورة.
   • maintain_notifications(branch, retention): مبنية على آخر تعريف (live_public_schema.sql)
     وتستدعي الدالة الجديدة بعد إشعارات التفصيل؛ يبقى مفتاح overdue_created كما هو
     ويُضاف credit_overdue_created.

   قابل لإعادة التشغيل. لا تغيير في أي جدول.
   ===================================================================== */

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_overdue_credit_notifications(p_branch_id uuid)
RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_order record;
  v_count integer := 0;
  v_today date := (now() AT TIME ZONE 'Africa/Khartoum')::date;
BEGIN
  -- إقفال إشعارات الفواتير التي سُدّدت أو أُغلقت
  UPDATE public.notifications n
  SET "isRead" = true
  FROM public.sales_orders so
  WHERE n.type = 'CREDIT_OVERDUE'
    AND n."isRead" = false
    AND so.id::text = n.metadata ->> 'sales_order_id'
    AND (so.credit_closed_reason IS NOT NULL OR COALESCE(so.remaining_amount, 0) <= 0);

  FOR v_order IN
    SELECT so.id, so.order_number, so.credit_customer_name, so.credit_customer_phone,
           so.due_date, so.remaining_amount
    FROM public.sales_orders so
    WHERE so.branch_id = p_branch_id
      AND so.is_credit = true
      AND so.credit_closed_reason IS NULL
      AND COALESCE(so.remaining_amount, 0) > 0
      AND so.due_date IS NOT NULL
      AND so.due_date < v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.metadata ->> 'key' = 'CREDIT_OVERDUE:' || so.id::text
      )
  LOOP
    INSERT INTO public.notifications (title, message, type, link, metadata)
    VALUES (
      'فاتورة آجلة متأخرة',
      'الفاتورة ' || v_order.order_number
        || COALESCE(' (' || v_order.credit_customer_name || COALESCE(' - ' || v_order.credit_customer_phone, '') || ')', '')
        || ' كان موعد استحقاقها ' || to_char(v_order.due_date, 'YYYY-MM-DD')
        || ' — متأخرة ' || (v_today - v_order.due_date) || ' يوم، والمتبقي '
        || trim_scale(round(v_order.remaining_amount, 2)) || ' ج.س.',
      'CREDIT_OVERDUE',
      '/dashboard/receivables?overdue=true',
      jsonb_build_object('key', 'CREDIT_OVERDUE:' || v_order.id::text, 'sales_order_id', v_order.id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintain_notifications(p_branch_id uuid, p_retention_days integer DEFAULT 30)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_overdue integer;
  v_credit_overdue integer;
  v_deleted integer;
BEGIN
  v_overdue := public.generate_overdue_tailoring_notifications(p_branch_id);
  v_credit_overdue := public.generate_overdue_credit_notifications(p_branch_id);

  DELETE FROM public.notifications
  WHERE "isRead" = true
    AND created_at < now() - make_interval(days => GREATEST(p_retention_days, 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'overdue_created', v_overdue,
    'credit_overdue_created', v_credit_overdue,
    'deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_overdue_credit_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_overdue_credit_notifications(uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

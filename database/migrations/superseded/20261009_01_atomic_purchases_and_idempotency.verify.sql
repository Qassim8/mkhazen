-- =====================================================================
-- SUPERSEDED — DO NOT APPLY. Never applied to production.
-- Replaced by the 20261010_* sequence (see docs/release-plan.md).
-- Kept only for review history.
-- =====================================================================

/* =====================================================================
   تحقق بعد تطبيق 20261009_01 — قراءة فقط، ما بيعدّلش أي حاجة
   كل الصفوف لازم تطلع "سليم".
   ===================================================================== */

SELECT 'دالة الاستلام' AS "الفحص",
       CASE WHEN to_regprocedure('public.receive_purchase_order(uuid, uuid, uuid)') IS NOT NULL
            THEN 'سليم' ELSE 'غير موجودة — مشكلة' END AS "النتيجة"
UNION ALL
SELECT 'دالة دفعة المورد',
       CASE WHEN to_regprocedure('public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text)') IS NOT NULL
            THEN 'سليم' ELSE 'غير موجودة — مشكلة' END
UNION ALL
SELECT 'جدول منع التكرار',
       CASE WHEN to_regclass('public.api_idempotency_keys') IS NOT NULL
            THEN 'سليم' ELSE 'غير موجود — مشكلة' END
UNION ALL
SELECT 'RLS على جدول منع التكرار',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_idempotency_keys'::regclass)
            THEN 'سليم' ELSE 'RLS مقفول — مشكلة' END
UNION ALL
SELECT 'anon لا يستطيع تنفيذ الاستلام',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
              OR NOT has_function_privilege('anon', 'public.receive_purchase_order(uuid, uuid, uuid)', 'EXECUTE')
            THEN 'سليم' ELSE 'anon يقدر ينفذ — مشكلة' END
UNION ALL
SELECT 'anon لا يستطيع تنفيذ الدفع',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
              OR NOT has_function_privilege('anon', 'public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text)', 'EXECUTE')
            THEN 'سليم' ELSE 'anon يقدر ينفذ — مشكلة' END
UNION ALL
-- طلبات شراء "معلّقة" من المشكلة القديمة: بنود مستلمة جزئيًا والطلب لسه APPROVED
SELECT 'طلبات شراء معلّقة من الاستلام القديم (راجعها يدويًا)',
       CASE WHEN count(*) = 0 THEN 'سليم' ELSE count(*)::text || ' طلب — راجع docs/production-audit.md' END
FROM (
  SELECT po.id
  FROM public.purchase_orders po
  JOIN public.purchase_order_items i ON i.purchase_order_id = po.id
  WHERE po.status::text = 'APPROVED'
  GROUP BY po.id
  HAVING bool_or(COALESCE(i.received_quantity, 0) > 0)
) stuck
UNION ALL
-- طلبات مستلمة من غير قيد شراء
SELECT 'طلبات مستلمة بدون قيد شراء',
       CASE WHEN count(*) = 0 THEN 'سليم' ELSE count(*)::text || ' طلب — مشكلة' END
FROM public.purchase_orders po
WHERE po.status::text = 'RECEIVED'
  AND po.journal_entry_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.purchase_order_id = po.id AND je.entry_type::text = 'PURCHASE'
  );

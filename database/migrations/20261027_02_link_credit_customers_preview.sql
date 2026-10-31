/* =====================================================================
   20261027_02 — معاينة (قراءة فقط): ربط فواتير التقسيط القديمة بالعملاء
   =====================================================================
   لا يغيّر شيئًا. يعرض ما سيفعله 20261027_03_link_credit_customers_apply.sql:
   • كل فاتورة آجلة customer_id فيها فارغ: نطابق credit_customer_phone مع
     customers.phone_normalized (الأقدم عند التكرار) وإلا يُنشأ عميل جديد لكل رقم
     (الاسم من أحدث فاتورة بهذا الرقم).
   • فواتير بلا رقم صالح لا تُربط (تظهر في SKIPPED).

   يلزم أن يكون 20261026_01_customers_hub.sql مُطبَّقًا (phone_normalized).
   شغّله على staging ثم production، وراجع الجدولين قبل تشغيل apply.
   ===================================================================== */

-- 1) الملخص
WITH pending AS (
  SELECT
    o.id,
    o.order_number,
    o.branch_id,
    o.created_at,
    o.credit_customer_name,
    o.credit_customer_phone,
    public.normalize_customer_phone(o.credit_customer_phone) AS norm
  FROM public.sales_orders o
  WHERE o.is_credit = true
    AND o.customer_id IS NULL
), matched AS (
  SELECT p.*,
    (SELECT c.id FROM public.customers c
      WHERE c.branch_id = p.branch_id AND c.phone_normalized = p.norm
      ORDER BY c.created_at, c.id LIMIT 1) AS customer_id
  FROM pending p
)
SELECT
  count(*)                                                        AS pending_invoices,
  count(*) FILTER (WHERE norm = '')                               AS skipped_no_valid_phone,
  count(*) FILTER (WHERE norm <> '' AND customer_id IS NOT NULL)  AS will_link_to_existing_customer,
  count(*) FILTER (WHERE norm <> '' AND customer_id IS NULL)      AS will_link_to_new_customer,
  count(DISTINCT (branch_id, norm)) FILTER (WHERE norm <> '' AND customer_id IS NULL) AS customers_to_create
FROM matched;

-- 2) التفصيل لكل فاتورة
WITH pending AS (
  SELECT
    o.id,
    o.order_number,
    o.branch_id,
    o.created_at,
    o.credit_customer_name,
    o.credit_customer_phone,
    o.remaining_amount,
    public.normalize_customer_phone(o.credit_customer_phone) AS norm
  FROM public.sales_orders o
  WHERE o.is_credit = true
    AND o.customer_id IS NULL
)
SELECT
  p.order_number,
  p.credit_customer_name,
  p.credit_customer_phone,
  p.norm AS phone_normalized,
  p.remaining_amount,
  CASE
    WHEN p.norm = '' THEN 'SKIPPED'
    WHEN c.id IS NOT NULL THEN 'LINK_EXISTING'
    ELSE 'CREATE_NEW'
  END AS action,
  c.name AS existing_customer_name,
  c.whatsapp_number AS existing_customer_phone,
  (c.name IS NOT NULL AND c.name <> p.credit_customer_name) AS name_differs
FROM pending p
LEFT JOIN LATERAL (
  SELECT c.id, c.name, c.whatsapp_number
  FROM public.customers c
  WHERE c.branch_id = p.branch_id AND c.phone_normalized = p.norm
  ORDER BY c.created_at, c.id
  LIMIT 1
) c ON true
ORDER BY action, p.norm, p.created_at;

-- 3) العملاء الذين سيُنشؤون (اسم أحدث فاتورة لكل رقم)
SELECT
  t.norm AS phone_normalized,
  (array_agg(t.credit_customer_name ORDER BY t.created_at DESC))[1] AS name,
  (array_agg(t.credit_customer_phone ORDER BY t.created_at DESC))[1] AS phone_on_latest_invoice,
  count(*) AS invoices
FROM (
  SELECT o.branch_id, o.created_at, o.credit_customer_name, o.credit_customer_phone,
         public.normalize_customer_phone(o.credit_customer_phone) AS norm
  FROM public.sales_orders o
  WHERE o.is_credit = true AND o.customer_id IS NULL
) t
WHERE t.norm <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.branch_id = t.branch_id AND c.phone_normalized = t.norm
  )
GROUP BY t.branch_id, t.norm
ORDER BY t.norm;

/* =====================================================================
   فحوص سلامة البيانات المالية والمخزنية — قراءة فقط
   =====================================================================
   شغّلها على الإنتاج (Supabase → SQL Editor) قبل الاعتماد وبعد كل تحديث،
   وكمان دوريًا (أسبوعيًا مثلًا). كل استعلام المفروض يرجع صفر صفوف؛ أي صف
   = حالة لازم تتراجع يدويًا (مش بالضرورة خطأ: بيانات قديمة قبل النظام مثلًا).

   اصطلاح الحركات (من الواجهة MovementsTable.tsx): الكمية موجبة والاتجاه من النوع
   داخل: PURCHASE, SALE_RETURN, OPENING_STOCK, ADJUSTMENT_IN, PRODUCTION_RECEIPT
   خارج: SALE, PURCHASE_RETURN, ADJUSTMENT_OUT, PRODUCTION_ISSUE, GIFT
   ===================================================================== */

-- (1) رصيد الصنف ≠ مجموع حركاته (مخزون اتغير من غير حركة، أو حركة مكررة)
WITH movement_totals AS (
  SELECT variant_id,
         sum(CASE
               WHEN movement_type::text IN ('PURCHASE', 'SALE_RETURN', 'OPENING_STOCK', 'ADJUSTMENT_IN', 'PRODUCTION_RECEIPT')
                 THEN abs(quantity)
               WHEN movement_type::text IN ('SALE', 'PURCHASE_RETURN', 'ADJUSTMENT_OUT', 'PRODUCTION_ISSUE', 'GIFT')
                 THEN -abs(quantity)
               ELSE 0
             END) AS net_movements,
         count(*) FILTER (WHERE movement_type::text NOT IN (
           'PURCHASE', 'SALE_RETURN', 'OPENING_STOCK', 'ADJUSTMENT_IN', 'PRODUCTION_RECEIPT',
           'SALE', 'PURCHASE_RETURN', 'ADJUSTMENT_OUT', 'PRODUCTION_ISSUE', 'GIFT')) AS unknown_types
  FROM public.inventory_movements
  GROUP BY variant_id
)
SELECT v.id AS variant_id, v.sku, t.name AS product,
       v."stockQuantity" AS stock, COALESCE(m.net_movements, 0) AS net_movements,
       v."stockQuantity" - COALESCE(m.net_movements, 0) AS difference,
       COALESCE(m.unknown_types, 0) AS movements_with_unknown_type
FROM public.product_variants v
JOIN public.product_templates t ON t.id = v."templateId"
LEFT JOIN movement_totals m ON m.variant_id = v.id
WHERE abs(v."stockQuantity" - COALESCE(m.net_movements, 0)) > 0.001
   OR COALESCE(m.unknown_types, 0) > 0
ORDER BY abs(v."stockQuantity" - COALESCE(m.net_movements, 0)) DESC;

-- (2) مخزون بالسالب
SELECT v.id, v.sku, t.name, v."stockQuantity"
FROM public.product_variants v
JOIN public.product_templates t ON t.id = v."templateId"
WHERE v."stockQuantity" < 0;

-- (3) فواتير POS مكتملة: الإجمالي ≠ المجموع − الخصم + الضريبة، أو الدفعات ≠ الإجمالي
SELECT so.id, so.order_number, so.subtotal, so.discount_amount, so.tax_amount, so.total_amount,
       COALESCE(p.paid, 0) AS paid
FROM public.sales_orders so
LEFT JOIN (
  SELECT sales_order_id, sum(amount) AS paid FROM public.sales_order_payments GROUP BY sales_order_id
) p ON p.sales_order_id = so.id
WHERE so.order_type::text = 'POS' AND so.status::text = 'COMPLETED'
  AND (abs(so.total_amount - (so.subtotal - so.discount_amount + so.tax_amount)) > 0.01
       OR abs(COALESCE(p.paid, 0) - so.total_amount) > 0.01);

-- (4) مجموع بنود الفاتورة ≠ المجموع الفرعي (الهدايا بصفر)
SELECT so.id, so.order_number, so.subtotal, sum(i.total_price) AS items_total
FROM public.sales_orders so
JOIN public.sales_order_items i ON i.sales_order_id = so.id
WHERE so.order_type::text = 'POS' AND so.status::text = 'COMPLETED'
GROUP BY so.id, so.order_number, so.subtotal
HAVING abs(so.subtotal - sum(i.total_price)) > 0.01;

-- (5) هدايا بسعر غير صفر
SELECT i.id, i.sales_order_id, i.unit_price, i.total_price
FROM public.sales_order_items i
WHERE COALESCE(i.is_gift, false) AND (i.unit_price <> 0 OR i.total_price <> 0);

-- (6) مبيعات مكررة محتملة (نفس الكاشير ونفس الإجمالي ونفس البنود خلال دقيقتين)
--     — ضحايا محتملين للنقر المزدوج/إعادة الإرسال قبل إضافة منع التكرار
WITH sale_fingerprints AS (
  SELECT so.id, so.order_number, so.cashier_id, so.total_amount, so.created_at,
         string_agg(i.variant_id::text || 'x' || i.quantity::text || CASE WHEN COALESCE(i.is_gift, false) THEN 'g' ELSE '' END,
                    ',' ORDER BY i.variant_id, i.quantity) AS items
  FROM public.sales_orders so
  JOIN public.sales_order_items i ON i.sales_order_id = so.id
  WHERE so.order_type::text = 'POS' AND so.status::text = 'COMPLETED'
  GROUP BY so.id
)
SELECT a.order_number AS first_order, b.order_number AS second_order, a.total_amount,
       a.created_at AS first_at, b.created_at AS second_at
FROM sale_fingerprints a
JOIN sale_fingerprints b
  ON b.cashier_id IS NOT DISTINCT FROM a.cashier_id
 AND b.items = a.items
 AND b.total_amount = a.total_amount
 AND b.created_at > a.created_at
 AND b.created_at - a.created_at < interval '2 minutes'
ORDER BY a.created_at DESC;

-- (7) طلبات شراء: الدفعات أكبر من الإجمالي، أو أكتر من قيد شراء لنفس الطلب
SELECT po.id, po.order_number, po.total_amount, sum(p.amount) AS paid
FROM public.purchase_orders po
JOIN public.purchase_order_payments p ON p.purchase_order_id = po.id
GROUP BY po.id
HAVING sum(p.amount) > po.total_amount + 0.01;

SELECT purchase_order_id, count(*) AS purchase_journals
FROM public.journal_entries
WHERE entry_type::text = 'PURCHASE' AND purchase_order_id IS NOT NULL
GROUP BY purchase_order_id
HAVING count(*) > 1;

-- (8) قيود غير سليمة: مبلغ ≤ 0، نفس الحساب مدين ودائن، عملة أو قيمة دولارية فاضية
SELECT id, entry_number, entry_type, amount, debit_account, credit_account, currency, amount_usd
FROM public.journal_entries
WHERE amount <= 0
   OR debit_account::text = credit_account::text
   OR currency IS NULL
   OR amount_usd IS NULL;

-- (9) أرصدة الخزينة/البنك لكل عملة (لازم ما تكونش بالسالب)
SELECT account, currency::text AS currency, round(sum(delta), 2) AS balance
FROM (
  SELECT debit_account::text AS account, currency, amount AS delta FROM public.journal_entries
  WHERE debit_account::text IN ('CASH', 'BANK')
  UNION ALL
  SELECT credit_account::text AS account, currency, -amount FROM public.journal_entries
  WHERE credit_account::text IN ('CASH', 'BANK')
) movements
GROUP BY account, currency
HAVING sum(delta) < 0;

-- (10) قفزات كبيرة في سعر الصرف (> 30% بين سعرين متتاليين) — احتمال خطأ إدخال
SELECT effective_at, rate, previous_rate,
       round(100 * (rate - previous_rate) / NULLIF(previous_rate, 0), 1) AS change_percent
FROM (
  SELECT effective_at, rate, lag(rate) OVER (PARTITION BY branch_id ORDER BY effective_at) AS previous_rate
  FROM public.exchange_rates
) r
WHERE previous_rate IS NOT NULL AND abs(rate - previous_rate) / NULLIF(previous_rate, 0) > 0.3
ORDER BY effective_at DESC;

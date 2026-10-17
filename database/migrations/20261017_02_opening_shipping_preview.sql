/* =====================================================================
   20261017_02 — معاينة توزيع شحن المخزون الافتتاحي (قراءة فقط)
   =====================================================================
   ما وجدته في المشروع عن طريقة تسجيل المخزون الافتتاحي:
   • الدالة record_opening_stock (صفحة المخزون ← المخزون الافتتاحي):
       - تضبط "stockQuantity" = الكمية، و"averageCost" = تكلفة الوحدة المُدخلة
         (سعر الشراء بدون شحن)، و"purchasePrice" إن كان صفرًا.
       - حركة مخزون inventory_movements نوعها 'OPENING_STOCK' (unit_cost = التكلفة).
       - قيد واحد للعملية: entry_number 'JE-OPEN-…'، entry_type 'CAPITAL'، USD،
         مدين INVENTORY / دائن CAPITAL.
   • الدالة record_opening_inventory (20261014_01، استُخدمت فترة قصيرة):
       حركة 'OPENING' + قيد 'JE-OPENINV-…' (CAPITAL، مدين INVENTORY / دائن CAPITAL).
   ⇒ الكميات الافتتاحية = حركات 'OPENING_STOCK' و'OPENING'، والحساب الدائن = CAPITAL.

   طريقة التوزيع (نفس apply):
   • PER_UNIT    : شحن الوحدة = v_total_shipping ÷ مجموع الكميات الافتتاحية.
   • PER_VARIANT : نصيب كل متغير = v_total_shipping ÷ عدد المتغيرات، وشحن الوحدة = النصيب ÷ كميته الافتتاحية.
   • المباع من الافتتاحي = min(الافتتاحي، الخارج منذ الافتتاح)
       (الخارج = SALE, GIFT, ADJUSTMENT_OUT, PRODUCTION_ISSUE, PURCHASE_RETURN, TAILORING).
   • المتبقي من الافتتاحي = min(الافتتاحي − المباع، المخزون الحالي) — حتى لا يُحمَّل
     على المخزون أكثر مما هو موجود فعلًا؛ والباقي يذهب لتكلفة المبيعات.
   • المبلغ على المخزون = شحن الوحدة × المتبقي، والمبلغ على المباع = نصيب المتغير − المبلغ على المخزون.
   • فرق التقريب يُضاف لآخر سطر حتى يساوي الإجمالي v_total_shipping.

   الإعدادات: عدّل القيمتين في settings أدناه فقط.
   ===================================================================== */

WITH settings AS (
  SELECT  
  426.00::numeric    AS v_total_shipping,   -- إجمالي الشحن بالدولار
  'PER_UNIT'::text   AS v_mode             -- 'PER_UNIT' أو 'PER_VARIANT'
),
opening AS (
  SELECT m.variant_id,
         round(sum(m.quantity), 2) AS opening_qty,
         min(m.created_at)         AS opened_at
  FROM public.inventory_movements m
  WHERE m.movement_type IN ('OPENING_STOCK', 'OPENING')
  GROUP BY m.variant_id
  HAVING sum(m.quantity) > 0
),
outflow AS (
  SELECT o.variant_id,
         round(COALESCE(sum(m.quantity) FILTER (
           WHERE m.movement_type IN ('SALE', 'GIFT', 'ADJUSTMENT_OUT', 'PRODUCTION_ISSUE', 'PURCHASE_RETURN', 'TAILORING')
         ), 0), 2) AS out_qty
  FROM opening o
  LEFT JOIN public.inventory_movements m
    ON m.variant_id = o.variant_id AND m.created_at >= o.opened_at
  GROUP BY o.variant_id
),
base AS (
  SELECT o.variant_id, o.opening_qty, o.opened_at, f.out_qty,
         least(o.opening_qty, f.out_qty)                          AS sold_from_opening,
         v."stockQuantity"                                        AS current_stock,
         v."averageCost"                                          AS current_avg_cost,
         pt.name                                                  AS product_name,
         v.sku,
         count(*) OVER ()                                         AS n_variants,
         sum(o.opening_qty) OVER ()                               AS total_opening_qty,
         row_number() OVER (ORDER BY pt.name, v.id)               AS rn
  FROM opening o
  JOIN outflow f USING (variant_id)
  JOIN public.product_variants v ON v.id = o.variant_id
  JOIN public.product_templates pt ON pt.id = v."templateId"
),
alloc AS (
  SELECT b.*, s.v_total_shipping, s.v_mode,
         CASE WHEN s.v_mode = 'PER_VARIANT'
              THEN (s.v_total_shipping / b.n_variants) / b.opening_qty
              ELSE s.v_total_shipping / b.total_opening_qty
         END AS ship_unit,
         least(b.opening_qty - b.sold_from_opening, greatest(b.current_stock, 0)) AS remaining_eff
  FROM base b CROSS JOIN settings s
),
rounded AS (
  SELECT a.*,
         round(a.ship_unit * a.opening_qty, 2) AS variant_raw,
         max(a.rn) OVER () AS last_rn
  FROM alloc a
),
totals AS (
  SELECT r.*,
         r.variant_raw + CASE WHEN r.rn = r.last_rn
                              THEN r.v_total_shipping - sum(r.variant_raw) OVER ()
                              ELSE 0 END AS variant_total
  FROM rounded r
),
final AS (
  SELECT t.*,
         least(round(t.ship_unit * t.remaining_eff, 2), t.variant_total) AS amount_inventory
  FROM totals t
)
SELECT
  rn                                                     AS "#",
  product_name                                           AS "المنتج",
  sku                                                    AS "SKU",
  opening_qty                                            AS "الكمية الافتتاحية",
  sold_from_opening                                      AS "المباع منها",
  opening_qty - sold_from_opening                        AS "المتبقي",
  current_stock                                          AS "المخزون الحالي",
  current_avg_cost                                       AS "averageCost الحالي",
  CASE WHEN current_stock > 0
       THEN round((current_stock * current_avg_cost + amount_inventory) / current_stock, 2)
       ELSE current_avg_cost END                         AS "averageCost الجديد",
  round(ship_unit, 6)                                    AS "شحن الوحدة",
  amount_inventory                                       AS "المبلغ على المخزون",
  variant_total - amount_inventory                       AS "المبلغ على المباع",
  variant_total                                          AS "نصيب المتغير"
FROM final
UNION ALL
SELECT
  NULL, 'الإجمالي (' || max(v_mode) || ')', NULL,
  sum(opening_qty), sum(sold_from_opening), sum(opening_qty - sold_from_opening),
  sum(current_stock), NULL, NULL, NULL,
  sum(amount_inventory), sum(variant_total - amount_inventory), sum(variant_total)
FROM final
ORDER BY 1 NULLS LAST;

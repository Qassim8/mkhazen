/* =====================================================================
   20261017_03 — تطبيق توزيع شحن المخزون الافتتاحي (مرة واحدة فقط)
   =====================================================================
   ما وجدته في المشروع عن طريقة تسجيل المخزون الافتتاحي:
   • record_opening_stock: "averageCost" = تكلفة الوحدة المُدخلة (بدون شحن)،
     حركة 'OPENING_STOCK'، وقيد 'JE-OPEN-…' entry_type 'CAPITAL' USD:
     مدين INVENTORY / دائن CAPITAL.
   • record_opening_inventory (20261014_01): حركة 'OPENING' + قيد 'JE-OPENINV-…'
     بنفس الحسابين.
   ⇒ الكميات الافتتاحية = حركات 'OPENING_STOCK' و'OPENING'، والحساب الدائن = CAPITAL.

   ما يفعله هذا الملف (نفس حسابات 20261017_02_opening_shipping_preview.sql):
   1) لكل متغير له كمية افتتاحية:
        المباع من الافتتاحي = min(الافتتاحي، الخارج منذ الافتتاح)
        المتبقي = min(الافتتاحي − المباع، المخزون الحالي)
        averageCost الجديد = (المخزون الحالي × averageCost + المبلغ على المخزون) / المخزون الحالي
        (لا يتغير لو المخزون صفر).
   2) sales_order_items: unit_cost (و unit_cost_usd / total_cost_usd) += شحن الوحدة
      لأسطر البيع (غير الهدايا) المباعة من الافتتاحي، الأقدم أولًا (تناسبيًا للسطر الجزئي).
   3) قيدان بالدولار:
        CAPITAL : مدين INVENTORY / دائن CAPITAL = إجمالي الشحن
        COGS    : مدين COGS / دائن INVENTORY   = نصيب المباع (لو > 0)
   4) لا يعدّل "purchasePrice" ولا أي قيد قديم.
   5) يرفض التشغيل مرتين: يسجّل العملية في opening_shipping_adjustments.

   ملاحظات:
   • نصيب المباع يشمل كل الخارج (بيع، هدية، تسوية خروج…) لأن الشحن يتبع البضاعة
     الخارجة؛ تعديل unit_cost يتم لأسطر البيع فقط.
   • حركات inventory_movements القديمة لا تتعدل.

   التشغيل: شغّل preview أولًا، راجع الأرقام، ثم عدّل الإعدادات أدناه بنفس القيم وشغّل هذا الملف.
   ===================================================================== */

BEGIN;

-- ===================== الإعدادات (نفس قيم preview) =====================
CREATE TEMP TABLE _ship_settings ON COMMIT DROP AS
SELECT
  426.00::numeric      AS v_total_shipping,   -- إجمالي الشحن بالدولار
  'PER_UNIT'::text   AS v_mode;             -- 'PER_UNIT' أو 'PER_VARIANT'
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.opening_shipping_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  total_shipping numeric(14,2) NOT NULL,
  mode text NOT NULL,
  inventory_amount numeric(14,2) NOT NULL,
  cogs_amount numeric(14,2) NOT NULL,
  inventory_entry_id uuid,
  cogs_entry_id uuid,
  details jsonb NOT NULL
);
ALTER TABLE public.opening_shipping_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.opening_shipping_adjustments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.opening_shipping_adjustments TO service_role;

DO $$
DECLARE
  v_total numeric(14,2);
  v_alloc_mode text;
  v_branch uuid;
  v_user uuid;
  v_inventory numeric(14,2);
  v_cogs numeric(14,2);
  v_inv_entry uuid;
  v_cogs_entry uuid;
  v_ref text := 'OPENSHIP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
BEGIN
  IF EXISTS (SELECT 1 FROM public.opening_shipping_adjustments) THEN
    RAISE EXCEPTION 'سبق تطبيق شحن المخزون الافتتاحي (opening_shipping_adjustments). لا يمكن التشغيل مرتين.';
  END IF;

  SELECT s.v_total_shipping, s.v_mode INTO v_total, v_alloc_mode FROM _ship_settings s;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'v_total_shipping يجب أن يكون أكبر من صفر';
  END IF;
  IF v_alloc_mode NOT IN ('PER_UNIT', 'PER_VARIANT') THEN
    RAISE EXCEPTION 'v_mode يجب أن يكون PER_UNIT أو PER_VARIANT';
  END IF;

  -- الفرع والمستخدم: من قيود المخزون الافتتاحي نفسها
  SELECT branch_id, created_by INTO v_branch, v_user
  FROM public.journal_entries
  WHERE entry_type = 'CAPITAL' AND debit_account = 'INVENTORY'
    AND (entry_number LIKE 'JE-OPEN-%' OR entry_number LIKE 'JE-OPENINV-%')
  ORDER BY created_at
  LIMIT 1;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'لم يُعثر على قيد مخزون افتتاحي (JE-OPEN-… / JE-OPENINV-…)';
  END IF;

  /* ---------- الحساب (نفس preview) ---------- */
  CREATE TEMP TABLE _ship_calc ON COMMIT DROP AS
  WITH opening AS (
    SELECT m.variant_id, round(sum(m.quantity), 2) AS opening_qty, min(m.created_at) AS opened_at
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
           least(o.opening_qty, f.out_qty) AS sold_from_opening,
           v."stockQuantity" AS current_stock,
           v."averageCost" AS current_avg_cost,
           count(*) OVER () AS n_variants,
           sum(o.opening_qty) OVER () AS total_opening_qty,
           row_number() OVER (ORDER BY pt.name, v.id) AS rn
    FROM opening o
    JOIN outflow f USING (variant_id)
    JOIN public.product_variants v ON v.id = o.variant_id
    JOIN public.product_templates pt ON pt.id = v."templateId"
  ),
  alloc AS (
    SELECT b.*,
           CASE WHEN v_alloc_mode = 'PER_VARIANT'
                THEN (v_total / b.n_variants) / b.opening_qty
                ELSE v_total / b.total_opening_qty
           END AS ship_unit,
           least(b.opening_qty - b.sold_from_opening, greatest(b.current_stock, 0)) AS remaining_eff
    FROM base b
  ),
  rounded AS (
    SELECT a.*, round(a.ship_unit * a.opening_qty, 2) AS variant_raw, max(a.rn) OVER () AS last_rn
    FROM alloc a
  ),
  totals AS (
    SELECT r.*,
           r.variant_raw + CASE WHEN r.rn = r.last_rn THEN v_total - sum(r.variant_raw) OVER () ELSE 0 END AS variant_total
    FROM rounded r
  )
  SELECT t.*,
         least(round(t.ship_unit * t.remaining_eff, 2), t.variant_total) AS amount_inventory
  FROM totals t;

  IF NOT EXISTS (SELECT 1 FROM _ship_calc) THEN
    RAISE EXCEPTION 'لا توجد كميات افتتاحية';
  END IF;

  SELECT round(sum(amount_inventory), 2), round(sum(variant_total - amount_inventory), 2)
  INTO v_inventory, v_cogs
  FROM _ship_calc;

  IF round(v_inventory + v_cogs, 2) <> v_total THEN
    RAISE EXCEPTION 'خطأ في التوزيع: المجموع % لا يساوي %', v_inventory + v_cogs, v_total;
  END IF;

  /* ---------- 1) averageCost (لا يتغير لو المخزون صفر) ---------- */
  UPDATE public.product_variants v
  SET "averageCost" = round((c.current_stock * c.current_avg_cost + c.amount_inventory) / c.current_stock, 2),
      "updatedAt" = now()
  FROM _ship_calc c
  WHERE v.id = c.variant_id
    AND c.current_stock > 0
    AND c.amount_inventory > 0;

  /* ---------- 2) تكلفة أسطر البيع المباعة من الافتتاحي (الأقدم أولًا) ---------- */
  WITH sale_lines AS (
    SELECT si.id, si.quantity, c.ship_unit,
           least(c.opening_qty, c.out_qty) AS from_opening_limit,
           sum(si.quantity) OVER (PARTITION BY si.variant_id ORDER BY si.created_at, si.id) - si.quantity AS qty_before
    FROM public.sales_order_items si
    JOIN public.sales_orders so ON so.id = si.sales_order_id
    JOIN _ship_calc c ON c.variant_id = si.variant_id
    WHERE NOT COALESCE(si.is_gift, false)
      AND so.status <> 'CANCELLED'
      AND si.created_at >= c.opened_at
  ),
  allocated AS (
    SELECT id, quantity,
           round(ship_unit * greatest(0, least(quantity, from_opening_limit - qty_before)) / quantity, 2) AS add_per_unit
    FROM sale_lines
  )
  UPDATE public.sales_order_items si
  SET unit_cost = si.unit_cost + a.add_per_unit,
      unit_cost_usd = COALESCE(si.unit_cost_usd, si.unit_cost) + a.add_per_unit,
      total_cost_usd = round(si.quantity * (COALESCE(si.unit_cost_usd, si.unit_cost) + a.add_per_unit), 2)
  FROM allocated a
  WHERE si.id = a.id AND a.add_per_unit > 0;

  /* ---------- 3) القيدان (USD) ---------- */
  INSERT INTO public.journal_entries (
    entry_number, entry_type, amount, currency, amount_usd,
    description, debit_account, credit_account, branch_id, created_by, reference
  ) VALUES (
    'JE-' || v_ref || '-INV', 'CAPITAL', v_total, 'USD', v_total,
    'شحن المخزون الافتتاحي (' || v_alloc_mode || ')', 'INVENTORY', 'CAPITAL', v_branch, v_user, v_ref
  )
  RETURNING id INTO v_inv_entry;

  IF v_cogs > 0 THEN
    INSERT INTO public.journal_entries (
      entry_number, entry_type, amount, currency, amount_usd,
      description, debit_account, credit_account, branch_id, created_by, reference
    ) VALUES (
      'JE-' || v_ref || '-COGS', 'COGS', v_cogs, 'USD', v_cogs,
      'نصيب المباع من شحن المخزون الافتتاحي', 'COGS', 'INVENTORY', v_branch, v_user, v_ref
    )
    RETURNING id INTO v_cogs_entry;
  END IF;

  /* ---------- 4) منع التكرار + سجل التفاصيل ---------- */
  INSERT INTO public.opening_shipping_adjustments (
    total_shipping, mode, inventory_amount, cogs_amount, inventory_entry_id, cogs_entry_id, details
  )
  SELECT v_total, v_alloc_mode, v_inventory, v_cogs, v_inv_entry, v_cogs_entry,
         jsonb_agg(jsonb_build_object(
           'variant_id', variant_id, 'opening_qty', opening_qty, 'sold_from_opening', sold_from_opening,
           'current_stock', current_stock, 'old_avg_cost', current_avg_cost,
           'ship_unit', round(ship_unit, 6), 'amount_inventory', amount_inventory,
           'amount_cogs', variant_total - amount_inventory
         ) ORDER BY rn)
  FROM _ship_calc;

  RAISE NOTICE 'تم: الشحن % $ — على المخزون % $، على المباع % $ (المرجع %)', v_total, v_inventory, v_cogs, v_ref;
END $$;

COMMIT;

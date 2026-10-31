/* =====================================================================
   20261027_03 — تطبيق: ربط فواتير التقسيط القديمة بالعملاء (مرة واحدة)
   =====================================================================
   • لكل فاتورة آجلة customer_id فيها فارغ: مطابقة credit_customer_phone مع
     customers.phone_normalized (الأقدم عند التكرار)، وإلا إنشاء عميل واحد لكل رقم
     (الاسم من أحدث فاتورة بهذا الرقم، والهاتف بأرقام فقط كما في بقية النظام).
   • يضبط sales_orders.customer_id فقط. لا يلمس أي مبلغ ولا قيد ولا أعمدة النص
     credit_customer_name / credit_customer_phone (تبقى نسخة على الفاتورة).
   • يطبع (NOTICE) عدد الفواتير التي رُبطت والعملاء الذين أُنشئوا والمتخطَّى.
   • يرفض التشغيل مرتين: لو لا توجد فواتير آجلة غير مربوطة يتوقف بخطأ.

   الترتيب: 20261026_01 ثم 20261027_01، ثم شغّل 20261027_02 (معاينة) وراجعها، ثم هذا الملف.
   شغّله على staging ثم production بعد النسخ الاحتياطي.
   ===================================================================== */

BEGIN;

DO $$
DECLARE
  v_pending  integer;
  v_linked   integer := 0;
  v_created  integer := 0;
  v_skipped  integer;
  v_group    record;
  v_cid      uuid;
  v_clean    text;
  v_rows     integer;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.sales_orders
  WHERE is_credit = true AND customer_id IS NULL;

  IF v_pending = 0 THEN
    RAISE EXCEPTION 'لا توجد فواتير آجلة غير مربوطة بعميل (ربما طُبِّق هذا الملف سابقًا). لا شيء للتنفيذ.';
  END IF;

  FOR v_group IN
    SELECT
      t.branch_id,
      t.norm,
      (array_agg(t.credit_customer_name ORDER BY t.created_at DESC))[1]  AS name,
      (array_agg(t.credit_customer_phone ORDER BY t.created_at DESC))[1] AS phone
    FROM (
      SELECT o.branch_id, o.created_at, o.credit_customer_name, o.credit_customer_phone,
             public.normalize_customer_phone(o.credit_customer_phone) AS norm
      FROM public.sales_orders o
      WHERE o.is_credit = true AND o.customer_id IS NULL
    ) t
    WHERE t.norm <> ''
    GROUP BY t.branch_id, t.norm
    ORDER BY t.norm
  LOOP
    v_cid := NULL;

    SELECT c.id INTO v_cid
    FROM public.customers c
    WHERE c.branch_id = v_group.branch_id AND c.phone_normalized = v_group.norm
    ORDER BY c.created_at, c.id
    LIMIT 1;

    IF v_cid IS NULL THEN
      v_clean := regexp_replace(COALESCE(v_group.phone, ''), '[^0-9]', '', 'g');
      IF left(v_clean, 2) = '00' THEN
        v_clean := substring(v_clean FROM 3);
      END IF;

      INSERT INTO public.customers (branch_id, name, whatsapp_number)
      VALUES (
        v_group.branch_id,
        COALESCE(NULLIF(btrim(v_group.name), ''), 'عميل ' || v_clean),
        v_clean
      )
      ON CONFLICT (branch_id, whatsapp_number) DO NOTHING
      RETURNING id INTO v_cid;

      IF v_cid IS NULL THEN
        SELECT c.id INTO v_cid
        FROM public.customers c
        WHERE c.branch_id = v_group.branch_id AND c.whatsapp_number = v_clean;
      ELSE
        v_created := v_created + 1;
      END IF;
    END IF;

    UPDATE public.sales_orders
    SET customer_id = v_cid
    WHERE is_credit = true
      AND customer_id IS NULL
      AND branch_id = v_group.branch_id
      AND public.normalize_customer_phone(credit_customer_phone) = v_group.norm;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_linked := v_linked + v_rows;
  END LOOP;

  SELECT count(*) INTO v_skipped
  FROM public.sales_orders
  WHERE is_credit = true AND customer_id IS NULL;

  RAISE NOTICE 'فواتير آجلة رُبطت: %  |  عملاء أُنشئوا: %  |  لم تُربط (بلا رقم صالح): %  |  كانت غير مربوطة: %',
    v_linked, v_created, v_skipped, v_pending;
END $$;

COMMIT;

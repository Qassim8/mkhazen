/* =====================================================================
   20261026_01 — توحيد العملاء (مركز واحد لكل الفواتير: الكاشير والتفصيل)
   =====================================================================
   فحص أعمدة customers الحالية (live_public_schema.sql): id, branch_id, name,
   whatsapp_number, notes, created_at, updated_at, measurements.
   لذلك ينقص عمود واحد فقط: phone_normalized (notes و updated_at موجودان؛ تُترك
   ADD COLUMN IF NOT EXISTS لهما احتياطًا فلا تغيّر شيئًا).

   • "الهاتف" و"واتساب" حقل واحد في النظام الحالي (whatsapp_number)، وphone_normalized
     مشتق منه. القيد UNIQUE(branch_id, whatsapp_number) يبقى كما هو لأن
     create_tailoring_order يعتمد عليه (ON CONFLICT)؛ أما phone_normalized فبدون UNIQUE
     وبـ index عادي فقط لأن التكرارات القديمة ممكنة.
   • normalize_customer_phone: أرقام فقط، و09xxxxxxxx و+2499xxxxxxxx و2499xxxxxxxx
     و9xxxxxxxx و00249… كلها تصير 2499xxxxxxxx.
   • trigger يملأ phone_normalized عند الإدخال/تغيير الرقم، فلا حاجة لتعديل دوال
     التفصيل التي تُدرج العملاء.
   • merge_customers(keep, remove, user): owner/admin فقط، ذرّية، تنقل كل المراجع
     (بحث ديناميكي عن كل FK يشير إلى customers) ثم تحذف العميل المدموج.
   • find_duplicate_customers(): مجموعات العملاء بنفس phone_normalized.

   قابل لإعادة التشغيل. لا يمس القيود المحاسبية.
   ===================================================================== */

BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_normalized text;

CREATE OR REPLACE FUNCTION public.normalize_customer_phone(p_phone text)
RETURNS text
  LANGUAGE plpgsql IMMUTABLE
  AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN '';
  END IF;

  IF left(v_digits, 2) = '00' THEN
    v_digits := substring(v_digits FROM 3);
  END IF;

  -- السودان: 09xxxxxxxx / 01xxxxxxxx (10 أرقام بصفر) أو 9xxxxxxxx (9 أرقام) → 249 + الرقم
  IF left(v_digits, 3) = '249' THEN
    RETURN v_digits;
  ELSIF length(v_digits) = 10 AND left(v_digits, 1) = '0' THEN
    RETURN '249' || substring(v_digits FROM 2);
  ELSIF length(v_digits) = 9 AND left(v_digits, 1) IN ('9', '1') THEN
    RETURN '249' || v_digits;
  END IF;

  RETURN v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.customers_set_phone_normalized()
RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.phone_normalized := public.normalize_customer_phone(NEW.whatsapp_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_phone_normalized ON public.customers;
CREATE TRIGGER customers_phone_normalized
  BEFORE INSERT OR UPDATE OF whatsapp_number ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_set_phone_normalized();

-- ملء الموجودين (آمن للتكرار)
UPDATE public.customers
SET phone_normalized = public.normalize_customer_phone(whatsapp_number)
WHERE phone_normalized IS DISTINCT FROM public.normalize_customer_phone(whatsapp_number);

CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON public.customers (phone_normalized);

/* ---------------------------------------------------------------------
   find_duplicate_customers
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.find_duplicate_customers()
RETURNS TABLE(
  group_key text,
  customer_id uuid,
  name text,
  whatsapp_number text,
  notes text,
  created_at timestamptz,
  invoice_count bigint
)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT
    c.phone_normalized,
    c.id,
    c.name,
    c.whatsapp_number,
    c.notes,
    c.created_at,
    (SELECT count(*) FROM public.sales_orders so WHERE so.customer_id = c.id)
  FROM public.customers c
  WHERE c.phone_normalized <> ''
    AND c.phone_normalized IN (
      SELECT d.phone_normalized
      FROM public.customers d
      WHERE d.phone_normalized <> ''
      GROUP BY d.branch_id, d.phone_normalized
      HAVING count(*) > 1
    )
  ORDER BY c.phone_normalized, c.created_at, c.id;
$$;

/* ---------------------------------------------------------------------
   merge_customers
--------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep_id   uuid,
  p_remove_id uuid,
  p_user_id   uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_user   record;
  v_keep   record;
  v_remove record;
  v_fk     record;
  v_count  bigint;
  v_moved  jsonb := '{}'::jsonb;
  v_notes  text;
BEGIN
  IF p_keep_id IS NULL OR p_remove_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'بيانات الدمج غير مكتملة';
  END IF;

  IF p_keep_id = p_remove_id THEN
    RAISE EXCEPTION 'لا يمكن دمج العميل مع نفسه';
  END IF;

  SELECT id, role, "isActive" AS is_active, "branchId" AS branch_id
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_user.is_active THEN
    RAISE EXCEPTION 'المستخدم الحالي غير صالح';
  END IF;

  IF lower(v_user.role::text) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'دمج العملاء متاح للمالك أو المدير فقط';
  END IF;

  -- قفل بترتيب ثابت لتفادي التشابك بين عمليتي دمج متعاكستين
  PERFORM 1 FROM public.customers WHERE id IN (p_keep_id, p_remove_id) ORDER BY id FOR UPDATE;

  SELECT * INTO v_keep FROM public.customers WHERE id = p_keep_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'العميل المراد إبقاؤه غير موجود';
  END IF;

  SELECT * INTO v_remove FROM public.customers WHERE id = p_remove_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'العميل المراد دمجه غير موجود';
  END IF;

  IF v_keep.branch_id IS DISTINCT FROM v_remove.branch_id
     OR v_keep.branch_id IS DISTINCT FROM v_user.branch_id THEN
    RAISE EXCEPTION 'العميلان يجب أن يكونا في فرع المستخدم نفسه';
  END IF;

  -- نقل كل المراجع: أي FK (عمود واحد) يشير إلى customers
  FOR v_fk IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.customers'::regclass
      AND array_length(con.conkey, 1) = 1
    ORDER BY 1, 2
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_fk.tbl, v_fk.col, v_fk.col)
      USING p_keep_id, p_remove_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object(v_fk.tbl || '.' || v_fk.col, v_count);
  END LOOP;

  -- المقاسات تُستكمل لو العميل المُبقى بلا مقاسات، والملاحظات تُجمع
  v_notes := NULLIF(btrim(concat_ws(E'\n', NULLIF(btrim(COALESCE(v_keep.notes, '')), ''), NULLIF(btrim(COALESCE(v_remove.notes, '')), ''))), '');

  UPDATE public.customers
  SET measurements = CASE
        WHEN (measurements IS NULL OR measurements = '[]'::jsonb) AND v_remove.measurements IS NOT NULL
          THEN v_remove.measurements
        ELSE measurements
      END,
      notes = v_notes,
      updated_at = now()
  WHERE id = p_keep_id;

  DELETE FROM public.customers WHERE id = p_remove_id;

  RETURN jsonb_build_object(
    'kept_id', p_keep_id,
    'removed_id', p_remove_id,
    'removed_name', v_remove.name,
    'moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_customer_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_customer_phone(text) TO service_role;
REVOKE ALL ON FUNCTION public.customers_set_phone_normalized() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_duplicate_customers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_customers() TO service_role;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid, uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

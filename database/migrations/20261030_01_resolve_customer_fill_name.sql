/* =====================================================================
   20261030_01 — resolve_customer_by_phone: ملء الاسم لو كان فارغًا
   =====================================================================
   مكوّن اختيار العميل الموحّد (طلب التفصيل، البيع بالتقسيط، ربط العميل في البيع العادي):
   عند الحفظ دون اختيار اقتراح، يجد السيرفر العميل بـ phone_normalized فيربط به، وإلا ينشئه.
   التعديل الوحيد هنا عن 20261027_01: لو وُجد العميل واسمه فارغ والمكتوب اسم، يُحدَّث الاسم؛
   اسم العميل الموجود لا يُستبدل أبدًا.

   قابل لإعادة التشغيل. تُطبَّق بعد 20261029_01.
   ===================================================================== */

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_customer_by_phone(
  p_branch_id uuid,
  p_name      text,
  p_phone     text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_name     text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_clean    text;
  v_norm     text;
  v_customer record;
  v_created  boolean := false;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'الفرع مطلوب';
  END IF;

  v_clean := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF left(v_clean, 2) = '00' THEN
    v_clean := substring(v_clean FROM 3);
  END IF;

  v_norm := public.normalize_customer_phone(p_phone);

  IF v_norm = '' OR char_length(v_clean) < 8 OR char_length(v_clean) > 15 THEN
    RAISE EXCEPTION 'رقم هاتف العميل غير صالح';
  END IF;

  SELECT id, name, whatsapp_number
  INTO v_customer
  FROM public.customers
  WHERE branch_id = p_branch_id
    AND phone_normalized = v_norm
  ORDER BY created_at, id
  LIMIT 1;

  IF FOUND THEN
    -- الاسم يُملأ فقط لو كان فارغًا؛ الاسم الموجود لا يُستبدل
    IF v_name IS NOT NULL AND NULLIF(btrim(COALESCE(v_customer.name, '')), '') IS NULL THEN
      IF char_length(v_name) > 255 THEN
        RAISE EXCEPTION 'اسم العميل طويل جدًا';
      END IF;

      UPDATE public.customers
      SET name = v_name, updated_at = now()
      WHERE id = v_customer.id
      RETURNING name INTO v_customer.name;
    END IF;
  ELSE
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;

    IF char_length(v_name) > 255 THEN
      RAISE EXCEPTION 'اسم العميل طويل جدًا';
    END IF;

    INSERT INTO public.customers (branch_id, name, whatsapp_number)
    VALUES (p_branch_id, v_name, v_clean)
    ON CONFLICT (branch_id, whatsapp_number) DO NOTHING
    RETURNING id, name, whatsapp_number INTO v_customer;

    IF FOUND THEN
      v_created := true;
    ELSE
      -- سباق: أُنشئ بنفس الرقم للتو
      SELECT id, name, whatsapp_number
      INTO v_customer
      FROM public.customers
      WHERE branch_id = p_branch_id AND whatsapp_number = v_clean;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'customer_id', v_customer.id,
    'name', v_customer.name,
    'whatsapp_number', v_customer.whatsapp_number,
    'created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_customer_by_phone(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_customer_by_phone(uuid, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

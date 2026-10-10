/* =====================================================================
   ⚠️ DESTRUCTIVE — حذف كل البيانات التجريبية قبل التشغيل الفعلي
   =====================================================================
   يحذف: كل المبيعات والمشتريات والتفصيل والقيود والحركات والمخزون
         والمنتجات والتصنيفات والموردين والعملاء والأصول وأسعار الصرف
         والإشعارات وكل الموظفين ما عدا المالك.
   يُبقي: حساب/حسابات المالك، جدول الفروع، وكل الهيكل (الجداول، الدوال،
          الـ triggers، الصلاحيات) كما هو — لا يحتاج إعادة تنفيذ أي migration.

   قبل التنفيذ: خذ نسخة احتياطية (docs/go-live-steps.md الخطوة 1).
   بعد التنفيذ: سجّل سعر الصرف من الإعدادات قبل أي عملية.
   صور المنتجات في Storage لا تُحذف من هنا (احذفها من Supabase ← Storage إن أردت).

   الأمان: يرفض التنفيذ إن لم يوجد مالك نشط. الجداول مذكورة صراحةً (بدون
   CASCADE) فلا يمكن أن يمتد الحذف لجدول غير مقصود. كله في معاملة واحدة.
   مختبر في database/tests/acceptance-scenario.db.test.ts.
   ===================================================================== */

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE lower(role::text) = 'owner' AND "isActive") THEN
    RAISE EXCEPTION 'لا يوجد حساب مالك نشط — تم إلغاء الحذف بالكامل';
  END IF;
END $$;

-- TRUNCATE لا يشغّل triggers الحذف (مثل منع تعديل أسعار الصرف) ولا يغيّر الصلاحيات
TRUNCATE TABLE
  public.api_idempotency_keys,
  public.notifications,
  public.tailoring_customer_advance_refunds,
  public.tailoring_customer_advance_transfers,
  public.tailor_commission_payments,
  public.sales_order_payments,
  public.sales_order_items,
  public.inventory_movements,
  public.journal_entries,
  public.purchase_order_payments,
  public.purchase_order_items,
  public.purchase_orders,
  public.sales_orders,
  public.customers,
  public.assets,
  public.product_variants,
  public.product_templates,
  public.categories,
  public.suppliers,
  public.exchange_rates
RESTART IDENTITY;

DELETE FROM public.users WHERE lower(role::text) <> 'owner';

COMMIT;

-- النتيجة: يجب أن يظهر المالك فقط
SELECT name, email, role, "isActive" FROM public.users;

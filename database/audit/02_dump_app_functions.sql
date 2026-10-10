/* =====================================================================
   نسخ تعريف كل دوال قاعدة البيانات اللي التطبيق بيناديها — قراءة فقط
   =====================================================================
   الهدف: المراجعة المالية لعمليات البيع/التفصيل/التسويات بتعتمد على كود
   الدوال دي، وهو مش موجود في المستودع. شغّل الاستعلام، وانسخ النتيجة
   (عمود definition) في ملفات داخل database/snapshot/functions/ عشان:
     1) تتراجع (قائمة الأسئلة في docs/production-audit.md → "مراجعة دوال قاعدة البيانات")
     2) تبقى في Git كمرجع لأي تعديل بعد كده.

   للحصول على المخطط الكامل بدل كده:
     npx supabase db dump --db-url "<connection string>" --schema public -f database/snapshot/schema.sql
   (بيتطلب كلمة سر قاعدة البيانات — ما تحطهاش في المستودع)
   ===================================================================== */

SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'cancel_tailoring_order',
    'complete_sales_checkout',
    'complete_tailoring_pickup',
    'complete_tailoring_production',
    'convert_tailoring_to_product',
    'create_asset_with_journal_entry',
    'create_product',
    'create_tailoring_order',
    'exchange_currency',
    'generate_overdue_tailoring_notifications',
    'get_account_balance',
    'get_current_exchange_rate',
    'ledger_period_totals',
    'list_opening_stock_candidates',
    'maintain_notifications',
    'pay_tailor_payment',
    'process_inventory_adjustment',
    'receive_purchase_order',
    'record_opening_stock',
    'record_purchase_payment',
    'refund_customer_advance',
    'update_product',
    'update_tailoring_order',
    'update_tailoring_status'
  )
ORDER BY 1, 2;

-- دوال trigger على الجداول المالية (بتأثر على العملة والمخزون)
SELECT DISTINCT p.proname AS trigger_function, pg_get_functiondef(p.oid) AS definition
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY 1;

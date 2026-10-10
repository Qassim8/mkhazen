/* =====================================================================
   مراجعة أمان قاعدة البيانات — قراءة فقط (ما بيعدّلش أي حاجة)
   =====================================================================
   المخطط الحقيقي (RLS، الـ policies، الدوال، الـ triggers) مش موجود في
   المستودع، فالمراجعة دي لازم تتشغل على قاعدة الإنتاج أو نسخة منها من
   Supabase → SQL Editor. كل استعلام مستقل؛ شغّلهم واحد واحد وراجع النتيجة.

   المرجع: docs/production-audit.md (قسم "ما لم يمكن مراجعته من الكود").
   ===================================================================== */

-- (1) جداول public بدون RLS — لازم ترجع صفر صفوف
--     (التطبيق كله بيستخدم service_role اللي بيتخطى RLS، فتشغيل RLS بدون
--      policies = الجدول مقفول قدام المفتاح العام anon، وده المطلوب)
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY 1;

-- (2) أي policy بتسمح لـ anon/authenticated/public — راجع كل صف
--     (التطبيق ما بيحتاجش ولا policy؛ أي policy مفتوحة = تسريب محتمل)
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- (3) صلاحيات الجداول لـ anon/authenticated — لازم ترجع صفر صفوف
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- (4) دوال يقدر anon/authenticated ينفذوها — لازم ترجع صفر صفوف
--     (أخطر حاجة: دالة SECURITY DEFINER قابلة للتنفيذ من المفتاح العام)
SELECT p.oid::regprocedure AS function,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY 1;

-- (5) دوال SECURITY DEFINER من غير search_path ثابت — لازم ترجع صفر صفوف
--     (من غيره ممكن حد ينشئ object بنفس الاسم في schema تاني ويتنفذ بصلاحيات المالك)
SELECT p.oid::regprocedure AS function, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%'
  )
ORDER BY 1;

-- (6) الـ triggers على الجداول المالية — راجع إن مفيش trigger مكرر أو قديم
--     (زي journal_entries_currency_snapshot اللي كان بيكسر تسجيل القيود)
SELECT c.relname AS table_name, t.tgname AS trigger_name, p.proname AS function,
       CASE t.tgenabled WHEN 'D' THEN 'disabled' ELSE 'enabled' END AS state
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname = 'public'
  AND c.relname IN ('journal_entries', 'inventory_movements', 'product_variants', 'sales_orders',
                    'sales_order_items', 'sales_order_payments', 'purchase_orders',
                    'purchase_order_payments', 'exchange_rates', 'tailor_commission_payments')
ORDER BY 1, 2;

-- (7) أعمدة حساسة في users (للتأكد إن مفيش policy أو view بيكشفها)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('password', 'salary', 'resetRequested')
ORDER BY 1, 2;

-- (8) Views في public (ممكن تتخطى RLS لو SECURITY DEFINER ضمنيًا) — راجعها
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY 1;

-- (9) Storage: الـ bucket المستخدم للصور لازم يكون public قراءة بس (رفع من السيرفر فقط)
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

SELECT policyname, tablename, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

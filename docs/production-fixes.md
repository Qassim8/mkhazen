# سجل الإصلاحات — فرع `production-hardening`

> كل التغييرات **غير ملتزمة (uncommitted)** على فرع `production-hardening` المتفرع من `master` (`16ce718`). لم يتم أي push ولم يُطبَّق أي شيء على قاعدة الإنتاج.
> المرجع: [تقرير المراجعة](production-audit.md) (أرقام المشكلات P0-x/P1-x/P2-x) · [الجاهزية](production-readiness.md)

## متطلبات النشر الجديدة (مختصر)

| البند | مطلوب؟ | التفاصيل |
| --- | --- | --- |
| سلسلة `database/migrations/20261010_01…06` + `20261010_verify.sql` | **نعم، قبل نشر التطبيق** (وعاجلة أمنيًا) | الترتيب والتفاصيل في [release-plan.md](release-plan.md). `02` شرط للتطبيق الجديد: بدونها يرفض استلام المشتريات ودفعات الموردين («تحديث قاعدة البيانات مطلوب» — فشل آمن). `03` بدونها صفحة المحاسبة أبطأ. ملفات `20261009_*` القديمة **أُلغيت** (`migrations/superseded/`) |
| `SUPABASE_PUBLISHABLE_KEY` | **لم يعد مطلوبًا** | أُزيل عميل anon غير المستخدم من `lib/supabase.ts`؛ التطبيق يعمل بمفتاح service_role فقط |
| `JWT_SECRET` | موجود أصلًا | يُنصح بـ 32 حرفًا عشوائيًا أو أكثر (تحذير في السجل لو أقصر) |
| `SESSION_IDLE_HOURS` / `SESSION_MAX_DAYS` | اختياري | الافتراضي 12 ساعة / 7 أيام |
| `APP_URL` | لم يعد مطلوبًا | كان يُستخدم لطلبات HTTP الداخلية التي أُزيلت |
| إعادة تسجيل الدخول | **كل المستخدمين مرة واحدة** | التوكنات القديمة (بدون بصمة كلمة السر) تُعامل كمنتهية → صفحة «انتهت جلستك» |
| `npm ci` | نعم | ترقية Next.js إلى 16.3.8 + `@electric-sql/pglite` (تطوير فقط) |

## 1. ترقية Next.js (P0-2)

- **الملفات:** `package.json`, `package-lock.json`
- **التغيير:** `next` و`eslint-config-next` من 16.2.10 إلى ^16.3.8؛ `npm audit fix` للاعتماديات الفرعية. إضافة `@electric-sql/pglite` (devDependency) لاختبارات SQL.
- **لماذا:** ثغرات معلنة منها تجاوز الـ Proxy (الذي يحمي كل صفحات الداشبورد) وRCE وSSRF.
- **الاختبار:** `npm audit --omit=dev` → 0؛ البناء والاختبارات كلها ناجحة على 16.3.8.
- **الرجوع:** `git checkout master -- package.json package-lock.json && npm ci` (يعيد الثغرات).

## 2. إزالة Server Actions العامة + عميل API جديد (P0-1, P1-3, P1-16, P2-2)

- **الملفات:**
  - `lib/api-client.ts` — أُعيدت كتابته: بلا `"use server"`؛ `serverFetch`/`apiFetch` متماثل (متصفح/خادم)؛ `ApiError` (status/code/details)؛ `assertSafeEndpoint`؛ تحويل تلقائي لصفحة انتهاء الجلسة عند 401؛ منع الطلبات المتطابقة الجارية (نقرتين = طلب واحد).
  - `lib/api-transport.server.ts` (جديد) — في الخادم: استدعاء الـ route handler نفسه داخل العملية عبر `lib/api-routes.ts` + `connection()` (عرض ديناميكي وقت الطلب فقط).
  - `app/layout.tsx` — تحميل الـ transport.
  - `lib/api-routes.ts` — إضافة 3 مسارات ناقصة.
  - `app/dashboard/products/services/products.services.ts`, `app/dashboard/inventory/services/inventory.services.ts` — إزالة `"use server"`.
  - `app/dashboard/notifications/services/notifications.services.ts` — عبر `apiFetch` مع هيدر `x-mkhazen-background` (لا يجدد الجلسة).
  - `lib/constants.ts` — حذف `BASE_URL` غير المستخدم.
- **لماذا:** SSRF غير مصادق؛ رسائل الأخطاء العربية كانت تضيع في الإنتاج؛ رحلة HTTP إضافية لكل جلب بيانات من الخادم.
- **الاختبار:** `tests/unit/api-client.test.ts`، `tests/unit/domain.test.ts` (جدول المسارات كامل + لا `use server`)، E2E.
- **Migration:** لا.
- **الرجوع:** `git checkout master -- lib/api-client.ts lib/api-routes.ts app/layout.tsx app/dashboard/*/services && rm lib/api-transport.server.ts` (يعيد الثغرة).

## 3. الجلسات والمصادقة (P1-1, P1-2, P1-4, P1-5, P1-6, P1-13)

- **الملفات:**
  - `lib/session-token.ts` (جديد) — توقيع/تحقق نقي: `pwv` (بصمة كلمة السر)، `sat` (بداية الجلسة)، مهلة خمول، حد أقصى، تجديد بعد 15 دقيقة، خوارزمية HS256 فقط.
  - `lib/auth.ts` — `getSessionResult/resolveSession` (missing/expired/invalid/unavailable)؛ مقارنة البصمة مع قاعدة البيانات (كاش 30 ث).
  - `lib/permissions-server.ts` — `requireLogin/requirePermission/requireAnyPermission` بردود 401/403/503 موحدة.
  - `lib/api-codes.ts` (جديد) — أكواد ورسائل الأخطاء المشتركة + `safeReturnPath` (منع open redirect).
  - `lib/api-response.ts` (جديد) — `apiError`, `dbErrorResponse` (رسائل RAISE العربية تُعرض، الباقي رسالة عامة + سجل)، `isDefiniteDbRejection`, `readJson`, `isUuid`.
  - `proxy.ts` — 401 JSON للـ API (بدون قاعدة بيانات)، رفض CSRF بالـ Origin، صفحات: بلا جلسة → `/`، منتهية → `/session-expired?next=…` ومسح الكوكي، قاعدة البيانات غير متاحة → صفحة 503 بدون تسجيل خروج، تجديد تلقائي.
  - `app/session-expired/page.tsx`, `SessionExpiredActions.tsx` (جديد) — «عذرًا، انتهت جلستك…» + «تسجيل الدخول مرة أخرى» + «إنهاء الجلسة».
  - `app/(login)/page.tsx` — الرجوع لمسار `next` الآمن بعد الدخول.
  - `app/api/auth/login/route.ts` — فحص كلمة السر أولًا، bcrypt وهمي، حد محاولات.
  - `app/api/auth/me/route.ts`, `me/update/route.ts`, `me/change-password/route.ts` — تحقق zod، جلسة جديدة بعد تغيير كلمة السر.
  - `app/api/auth/request-reset/route.ts` — رد عام، حد محاولات، بلا wildcard.
  - `lib/rate-limit.ts` (جديد).
  - `lib/validations/auth.schemas.ts` — حد أدنى 8 أحرف (كان 6) + حد أقصى 200.
  - **كل** `app/api/**/route.ts` — `await getSession()` → `requireLogin()` (تحويل آلي)، وإضافة `code` لردود 401/403.
  - `app/api/notifications/route.ts` — `requireViewer` بردود صحيحة.
- **لماذا:** جلسات غير قابلة للإبطال، عدم تمييز انتهاء الجلسة عن نقص الصلاحية، كشف الحسابات، CSRF.
- **الاختبار:** `tests/unit/session-token.test.ts` (8)، E2E (18 منها 11 للجلسة والصلاحيات والدخول).
- **Migration:** لا. **إعدادات:** اختياريًا `SESSION_IDLE_HOURS`, `SESSION_MAX_DAYS`.
- **أثر النشر:** كل المستخدمين يعيدون تسجيل الدخول مرة.
- **الرجوع:** `git checkout master -- lib/auth.ts lib/permissions-server.ts proxy.ts app/api` ثم حذف الملفات الجديدة.

## 4. كلمة السر المؤقتة للموظف (P0-3)

- **الملفات:** `lib/temporary-password.ts` (جديد)، `app/api/users/route.ts`، `app/dashboard/employees/_components/ModalContent.tsx`، `TemporaryPasswordNotice.tsx` (جديد)، `employees.services.ts`، `app/api/users/[id]/route.ts` (إعادة التعيين ≥ 8).
- **السلوك الجديد:** بعد إضافة الموظف تظهر نافذة بكلمة سر عشوائية (12 حرفًا) مع زر نسخ وتنبيه أنها لن تظهر ثانية؛ الموظف يُجبر على تغييرها عند الدخول. لو فُقدت: «إعادة تعيين كلمة السر».
- **إجراء مطلوب:** الحسابات التي أُنشئت سابقًا ولم تغيّر كلمة سرها (`isPasswordChanged = false`) **كلمة سرها قابلة للتخمين** → أعد تعيينها من قائمة الموظفين.
- **الاختبار:** `tests/unit/domain.test.ts`.
- **الرجوع:** `git checkout master -- app/api/users app/dashboard/employees`.

## 5. استلام المشتريات ودفعات الموردين (P0-4, P0-5, P1-8, P1-10)

- **الملفات:**
  - `database/migrations/20261009_01_atomic_purchases_and_idempotency.sql` (+ `.rollback.sql`, `.verify.sql`) — دالتان `receive_purchase_order`, `record_purchase_payment` + جدول `api_idempotency_keys`.
  - `app/api/purchases/_lib/purchase-order.ts` — `processPurchaseReceipt`/`recordPurchasePayment` يستدعيان الدالتين؛ `PurchaseRpcError`.
  - `app/api/purchases/_lib/purchase-costs.ts` (جديد) — دوال التكلفة النقية (نفس المنطق السابق، للاختبار).
  - `app/api/purchases/[id]/status/route.ts` — تحويلات الحالة مشروطة بالحالة الحالية (409)، الاستلام ذرّي.
  - `app/api/purchases/route.ts` — الشراء المباشر: «معتمد» ثم استلام ذرّي؛ حذف تعويضي فقط عند رفض مؤكد.
  - `app/api/purchases/[id]/route.ts` — تعديل/حذف المسودة مشروط بـ `status = DRAFT`.
  - `app/api/purchases/[id]/payments/route.ts` — منع التكرار + أخطاء موحدة.
- **ملاحظات التنفيذ:** نفس معادلات التوزيع ومتوسط التكلفة (تقريب numeric دقيق بدل floating point في حالات الحافة)؛ قيد الشراء بدون عملة صريحة ليحددها الـ trigger كما كان؛ رصيد الدفع بنفس معادلة `ledger.ts`؛ القيم المحتمل أن تكون enum تُرسل كـ literals؛ `SECURITY INVOKER` و`search_path` ثابت؛ ممنوعة على anon/authenticated.
- **الاختبار:** `database/tests/purchases.db.test.ts` (19 حالة × أعمدة text وenum) + `audit-sql.db.test.ts` (تطابق المخزون مع الحركات بعد الاستلام).
- **غير مختبر:** التزامن الحقيقي (PGlite اتصال واحد) — الحماية بـ `FOR UPDATE` و`pg_advisory_xact_lock`؛ يُختبر على staging (انظر الجاهزية).
- **الرجوع:** ارجع للتطبيق السابق **أولًا**، ثم `…rollback.sql` (لا يمس البيانات المالية المسجلة).

## 6. منع تكرار العمليات المالية (P1-7, P1-9, P1-11, P1-12)

- **الملفات:**
  - `lib/idempotency.ts`, `lib/idempotency-hash.ts` (جديد) — حجز المفتاح، إعادة نفس الرد، رفض نفس المفتاح ببيانات مختلفة، 409 لو العملية الأولى ما زالت/انقطعت، تحرير المفتاح عند رفض مؤكد من القاعدة، تعطيل آمن لو الجدول غير موجود.
  - `lib/use-idempotency-key.ts` (جديد) — مفتاح ثابت لنفس بيانات النموذج.
  - `app/api/sales/checkout/route.ts` — أُعيدت كتابته: منع التكرار، التحقق من الأسعار وسعر الصرف من القاعدة (`app/api/sales/_lib/checkout-pricing.ts` جديد)، إعادة الأسعار الحالية عند التغيير، 503 «راجع آخر المبيعات» عند نتيجة مجهولة.
  - `app/api/sales/_lib/sales-helper.ts` — `CheckoutRpcError` يحفظ كود القاعدة.
  - `app/api/sales/route.ts` — يعيد استخدام معالج `/checkout`.
  - `app/api/tailoring/orders/route.ts` (إنشاء)، `[id]/pickup/route.ts`، `[id]/refund/route.ts`، `commission-payments/route.ts`، `[id]/status/route.ts` (POST → pickup)، `app/api/inventory/adjustments/route.ts`، `app/api/accounting/{manual,exchange,assets}/route.ts`، `app/api/accounting/_lib/accounting.ts` (`dbError` في الخطأ).
  - الواجهة: `POSClient.tsx` + `pos-draft.ts` (جديد: مسودة السلة في `sessionStorage`، مفتاح لكل سلة، حارس نقرتين، تحديث أسعار السلة)، `pos.services.ts`، `PaymentModal.tsx`، `CreateOrderClient.tsx`، `NewTailoringOrderForm.tsx`، `TailoringOrderDetail.tsx`، `AdjustmentModal.tsx` (+ رسائل نجاح/فشل)، `NewJournalModal.tsx`، `CurrencyExchangeModal.tsx`، `NewAssetsModal.tsx`، والخدمات المقابلة.
- **الاختبار:** E2E (نفس المفتاح مرتين = بيع واحد، مفتاح ببيانات مختلفة = 422، رفض القاعدة يحرر المفتاح، أخطاء داخلية لا تتسرب، مجموع مرفوع = 409)، `api-client.test.ts` (dedupe)، `domain.test.ts` (التسعير والبصمة).
- **Migration:** 01 (الجدول). **الرجوع:** ارجع للملفات من `master`؛ الجدول آمن للحذف.

## 7. البحث والصلاحيات والأخطاء (P1-14, P1-15, P1-17..19, P2-5, P2-6, P2-10)

- `lib/postgrest.ts` (جديد) + تطبيقه في 9 مسارات بحث.
- `app/api/sales/[id]/route.ts` — صلاحية `sales.pos|sales.view`.
- `app/api/sales/products/route.ts` — تنظيف البحث، PGRST103 → قائمة فارغة، أخطاء موحدة.
- `app/api/tailoring/orders/[id]/route.ts` — التحقق من UUID قبل استخدامه في فلتر.
- `app/dashboard/error.tsx`, `app/global-error.tsx` (جديد).
- `app/dashboard/pos/services/pos.services.ts` — الأخطاء تصل للواجهة بدل قائمة فارغة.
- `next.config.ts` — security headers + `poweredByHeader: false`.
- `components/ui/{DeleteConfirmationModal,ForgotPasswordModal,ResetPasswordModal,CheckCache}.tsx`, `store/useModalStore.ts` — إزالة `any` (أخطاء ESLint القديمة).
- **الاختبار:** `domain.test.ts`, E2E (headers, 403 للخياط).
- **الرجوع:** `git checkout master -- <file>` لكل ملف.

## 8. أداء صفحة المحاسبة (P2-1)

- **الملفات:** `database/migrations/20261010_03_ledger_period_totals.sql` (كانت `20261009_02`)، `app/api/accounting/_lib/ledger-source.ts` و`ledger-aggregate.ts` (جديد)، `overview/route.ts`، `summary/route.ts`.
- **السلوك:** مصدر واحد (مجاميع مجمّعة بالشهر بتوقيت السودان) بدل تنزيل كل القيود مرتين؛ رجوع تلقائي للطريقة القديمة لو الدالة غير موجودة.
- **الاختبار:** `database/tests/ledger.db.test.ts` — 400 قيد عشوائي على سنتين وحدود الشهر/السنة: الأرصدة والأداء الشهري متطابقة تمامًا.
- **الرجوع:** `DROP FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz);` (التطبيق يرجع تلقائيًا).

## 9. ملفات المراجعة والاختبارات (جديدة بالكامل)

- `database/audit/01_security_audit.sql`, `02_dump_app_functions.sql`, `03_data_integrity_checks.sql` — قراءة فقط.
- `database/tests/*` — انظر القسم 10 (أُعيدت كتابتها على المخطط الحي؛ `schema-stub.sql` حُذف).
- `tests/unit/*` — `session-token`, `api-client`, `domain`.
- `tests/e2e/*` — `mock-postgrest.ts`, `api-auth.e2e.test.ts`.
- `package.json` — سكربتات `typecheck`, `test`, `test:unit`, `test:db`, `test:e2e`, `verify`.

## 10. المرحلة الثانية: مطابقة مخطط الإنتاج الحي وتقوية الصلاحيات

المرجع: [live-database-audit.md](live-database-audit.md) · الخطة: [release-plan.md](release-plan.md).

- **Migrations جديدة** (كلها idempotent ولا تمس أي صف):
  - `20261010_01_security_hardening.sql` — حذف سياسة `users` العامة؛ RLS على كل الجداول؛ سحب كل صلاحيات anon/authenticated/PUBLIC من الجداول والتسلسلات والدوال؛ الإبقاء على service_role؛ قفل الـ default privileges (ومنها سحب EXECUTE العام الافتراضي عالميًا لدوال postgres)؛ تثبيت search_path لدالتي DEFINER القديمتين.
  - `20261010_02_atomic_purchases_and_idempotency.sql` (+ rollback) — تحل محل `20261009_01` بعد مطابقتها مع المخطط الحي. أهم الفروق: إصلاح خطأ متوسط التكلفة (`averageCost` NOT NULL DEFAULT 0 فـ`COALESCE` القديمة ما كانت ترجع لسعر الشراء أبدًا)، والتحقق من نشاط المستخدم وفرعه، واستخدام `get_account_balance` الحية لفحص الرصيد.
  - `20261010_03_ledger_period_totals.sql` — تحل محل `20261009_02` (نفس المنطق).
  - `20261010_04_legacy_function_cleanup.sql` (+ rollback يعيد الدوال بـ search_path مثبت وصلاحية service_role فقط) — حذف مشروط لـ 4 دوال قديمة غير مستخدمة.
  - `20261010_06_reassert_api_acl.sql` — يُشغَّل آخرًا دائمًا.
  - اختياري: `07` (event trigger يعيد السحب فورًا)، `08` (حذف trigger مكرر على users).
  - `20261010_verify.sql` — فحوص PASS/FAIL تفشل لو أي صلاحية عادت.
- **التطبيق:**
  - `lib/supabase.ts` — حذف عميل anon غير المستخدم ومتطلب `SUPABASE_PUBLISHABLE_KEY`.
  - `lib/api-response.ts` — `42501` (permission denied) يُسجَّل كخطأ إعداد في الخادم ويرجع 503 عام.
  - `app/api/users/[id]/route.ts` — التحقق من الصلاحية **قبل** البحث عن الموظف في GET/PUT/DELETE (الكاشير كان يميّز موظفًا موجودًا 403 من غير موجود 404). اكتشفه اختبار E2E الجديد.
- **الاختبارات:**
  - `database/tests/db-harness.ts` — يحمّل `live_public_schema.sql` كما هو في PGlite مع أدوار Supabase.
  - جديد: `live-hardening.db.test.ts`، `workflows.db.test.ts`، `opening-balances.db.test.ts`؛ ونُقلت `purchases`، `ledger`، `audit-sql` للمخطط الحي.
  - `tests/unit/db-access.test.ts` — service_role فقط، حارس صلاحية في كل route، منع أي GRANT لـ anon/authenticated/PUBLIC في الـ migrations، تطابق قائمة الـ RPCs في verify مع التطبيق.
  - `tests/e2e/api-auth.e2e.test.ts` — مصفوفة دور × عملية حساسة (401/403/تحكم إيجابي للمالك)، وتشغيل بلا مفتاح anon.
- **الأرصدة الافتتاحية (بطلب المالك):** `database/migrations/20261010_05_opening_balances.sql` (+ rollback)، API `app/api/accounting/opening-balances/route.ts` (للمالك فقط، معاينة بدون حفظ ثم تسجيل ذرّي بمنع تكرار)، صفحة `/dashboard/accounting/opening-balances` (`OpeningBalancesClient.tsx`) + رابط في القائمة. ديون الموردين الافتتاحية تظهر في المشتريات كنوع «دين افتتاحي» وتُسدَّد بالدفعات العادية؛ الأصول الافتتاحية تظهر في صفحة الأصول بطريقة دفع «رصيد افتتاحي». التصميم: [opening-balances-design.md](opening-balances-design.md).
- **الرجوع:** [release-plan.md §6](release-plan.md#6-rollback-guidance). لا رجوع يعيد صلاحيات anon.

## ملاحظة عن نهايات الأسطر
الملفات في نسخة العمل CRLF (إعداد `core.autocrlf` على Windows) وبعض الأسطر المعدلة آليًا LF؛ Git يوحدها عند الـ commit. لا أثر وظيفي.

# قاعدة البيانات — migrations والمراجعة والاختبارات

> **المرجع الوحيد لمخطط الإنتاج:** `audit/live_public_schema.sql` (تصدير pg_dump للـ schema `public` بالصلاحيات).
> خطة الإصدار الكاملة والترتيب والرجوع: [docs/release-plan.md](../docs/release-plan.md) · الأدلة: [docs/live-database-audit.md](../docs/live-database-audit.md).
> لا تطبّق أي ملف على الإنتاج قبل نجاحه على staging. لا تطبّق شيئًا من `migrations/superseded/`، ولا أي ملف `*.rollback.sql` إلا عند الرجوع.

## الهيكل

```
database/
├── migrations/                                     ← بالترتيب، كل ملف idempotent وفيه BEGIN/COMMIT
│   ├── 20261010_01_security_hardening.sql          ← إلزامي، أولًا (يقفل الصلاحيات والـ defaults)
│   ├── 20261010_02_atomic_purchases_and_idempotency.sql (+ .rollback.sql)  ← إلزامي للتطبيق الجديد
│   ├── 20261010_03_ledger_period_totals.sql        ← موصى به
│   ├── 20261010_04_legacy_function_cleanup.sql (+ .rollback.sql)           ← حذف مشروط لـ 4 دوال قديمة
│   ├── 20261010_06_reassert_api_acl.sql            ← إلزامي، آخر ملف دائمًا (وبعد أي migration مستقبلية)
│   ├── 20261010_07_acl_guard_event_trigger.sql     ← اختياري (يُجرَّب على staging)
│   ├── 20261010_08_drop_duplicate_users_trigger.sql← اختياري
│   ├── 20261010_verify.sql                         ← تحقق (قراءة فقط) — كل الصفوف PASS
│   └── superseded/                                 ← 20261009_* القديمة — لا تُطبَّق أبدًا
├── audit/                                          ← قراءة فقط
│   ├── live_public_schema.sql      تصدير مخطط الإنتاج (المرجع)
│   ├── 01_security_audit.sql
│   ├── 02_dump_app_functions.sql
│   └── 03_data_integrity_checks.sql
└── tests/                                          ← PGlite (Postgres 18 داخل العملية) — لا اتصال بأي قاعدة حقيقية
    ├── db-harness.ts                    يحمّل live_public_schema.sql كما هو + أدوار anon/authenticated/service_role
    ├── live-hardening.db.test.ts        الثغرة قبل، والإغلاق بعد، idempotency، إعادة المنح، 04/07/08، الرجوع
    ├── purchases.db.test.ts             الاستلام والدفع الذرّيين (service_role بعد التقوية)
    ├── workflows.db.test.ts             البيع بهدية، المرتجع (IN + مبلغ سالب)، المخزون الافتتاحي
    ├── ledger.db.test.ts                مطابقة مجاميع الدفتر
    ├── opening-balances.db.test.ts      الأرصدة الافتتاحية (05)
    └── audit-sql.db.test.ts
```

## الترتيب (ملخص — التفاصيل في release-plan.md)

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261010_01_security_hardening.sql
```

`01 → 02 → 03 → 04 → 05 → 06` (بترتيب أسماء الملفات) ثم (اختياري) `07`, `08`، ثم `20261010_verify.sql` (يفشل لو أي فحص FAIL).
على الإنتاج: نفس الترتيب **قبل** نشر التطبيق الجديد (التطبيق الحالي متوافق — يستخدم service_role فقط ولا ينادي الدوال المحذوفة).

## الرجوع

ممنوع أي رجوع يعيد صلاحيات `anon` أو `authenticated` أو `PUBLIC` أو سياسة `USING (true)` على `users`. التفاصيل والإجراء الطارئ (منح service_role فقط): [release-plan.md §6](../docs/release-plan.md#6-rollback-guidance).

## الاختبارات

```bash
npm run test:db
```

تعمل على المخطط الحقيقي المصدَّر (لا مخطط تخميني). ما لا يمكن إثباته محليًا (PostgREST، التزامن الحقيقي، defaults الخاصة بـ supabase_admin، event triggers على المنصة) مذكور في [release-plan.md §5](../docs/release-plan.md#5-staging-only-validations).

## تحديث المرجع

بعد أي تغيير في الإنتاج، صدّر المخطط من جديد واستبدل `audit/live_public_schema.sql` (لا تحفظ كلمة السر في المستودع):

```bash
npx supabase db dump --db-url "$DATABASE_URL" --schema public -f database/audit/live_public_schema.sql
```

# خطوات التنفيذ على قاعدة البيانات وبدء التشغيل

> مرجع مختصر للتنفيذ. التفاصيل الفنية والأدلة في [release-plan.md](release-plan.md) و[live-database-audit.md](live-database-audit.md).

## الخطوة 1 — نسخة احتياطية كاملة (الهيكل + البيانات)

### أ) ثبّت أداة pg_dump (مرة واحدة)
- نزّل PostgreSQL **17** (أو 18) لويندوز من موقع EDB الرسمي (postgresql.org ← Download ← Windows).
- أثناء التثبيت اختر **Command Line Tools فقط** (لا تحتاج السيرفر).
- لازم يكون الإصدار 17 أو أحدث، لأن قاعدة Supabase عندك 17.6.

### ب) رابط الاتصال
- Supabase ← مشروعك ← زر **Connect** أعلى الصفحة ← **Session pooler** ← انسخ الـ URI.
- استبدل `[YOUR-PASSWORD]` بكلمة سر قاعدة البيانات. إذا نسيتها: Settings ← Database ← Reset database password. هذا لا يؤثر على التطبيق، لأنه يستخدم مفتاح service_role وليس كلمة السر هذه.
- لا تستخدم Direct connection، فهو يعمل بـ IPv6 فقط على أغلب الشبكات.

### ج) أخذ النسخة (من Git Bash داخل مجلد المشروع)

```bash
export DB_URL='postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres'
```

```bash
mkdir -p backups && "/c/Program Files/PostgreSQL/17/bin/pg_dump.exe" "$DB_URL" --schema=public --format=custom --no-owner --file="backups/before-hardening-$(date +%Y%m%d-%H%M).dump"
```

```bash
"/c/Program Files/PostgreSQL/17/bin/pg_dump.exe" "$DB_URL" --schema=public --no-owner --file="backups/before-hardening-$(date +%Y%m%d-%H%M).sql"
```

- النسخة تشمل كل الجداول والدوال والبيانات، ومنها **حسابات المالك والمدير** (جدول `users`).
- الملف الأول للاستعادة، والثاني نسخة نصية تقدر تفتحها وتقرأها.
- ⚠️ الملفان فيهما كلمات سر مشفّرة: احفظهما في مكان خاص، ولا ترفعهما على Git (المجلد `backups/` مستثنى من Git).
- صور المنتجات المرفوعة (Storage) ليست ضمن هذه النسخة. البيانات تجريبية فلا مشكلة.
- إذا كانت خطة Supabase مدفوعة (Pro)، تجد أيضًا نسخة يومية تلقائية في Database ← Backups، وتُستعاد بزر واحد.

### د) (موصى به) جرّب النسخة على مشروع ثانٍ
أنشئ مشروع Supabase مجاني جديد، واستعد النسخة فيه:

```bash
"/c/Program Files/PostgreSQL/17/bin/pg_restore.exe" --no-owner --no-privileges --dbname "$NEW_PROJECT_DB_URL" backups/before-hardening-XXXX.dump
```

بهذا تتأكد أن النسخة سليمة. وتقدر تجرّب ملفات الخطوة 2 على هذا المشروع أولًا (staging) قبل المشروع الأصلي.

### هـ) الاستعادة على المشروع الأصلي (فقط عند الحاجة)

```bash
"/c/Program Files/PostgreSQL/17/bin/pg_restore.exe" --clean --if-exists --no-owner --no-privileges --dbname "$DB_URL" backups/before-hardening-XXXX.dump
```

بعد أي استعادة: نفّذ الملفين `20261010_01` و`20261010_06`، لأن النسخة القديمة لا تحمل الحماية الجديدة. الملفان آمنان مع النسخة الحالية من التطبيق.

## الخطوة 2 — الملفات التي تُنفَّذ على قاعدة البيانات

من Supabase ← **SQL Editor** ← New query: الصق محتوى كل ملف **كاملًا** ← Run. ملف واحد في كل مرة، **بهذا الترتيب**:

| # | الملف (في `database/migrations/`) | إلزامي؟ |
|---|---|---|
| 1 | `20261010_01_security_hardening.sql` | نعم |
| 2 | `20261010_02_atomic_purchases_and_idempotency.sql` | نعم |
| 3 | `20261010_03_ledger_period_totals.sql` | نعم |
| 4 | `20261010_04_legacy_function_cleanup.sql` | نعم |
| 5 | `20261010_05_opening_balances.sql` | نعم |
| 6 | `20261010_06_reassert_api_acl.sql` | نعم — **دائمًا الأخير** |
| 7 | `20261010_08_drop_duplicate_users_trigger.sql` | اختياري (آمن) |
| ✔ | `20261010_verify.sql` | نعم — للتحقق |

- **نتيجة التحقق:** إذا ظهرت رسالة نجاح بدون خطأ، فكل الفحوص سليمة. إذا ظهر خطأ يبدأ بـ `verify FAILED:` فهو يذكر اسم الفحص الذي فشل: توقف وأرسل الرسالة.
- **لا تنفّذ:** أي ملف ينتهي بـ `.rollback.sql`، ولا مجلد `superseded/`، ولا `20261010_07_acl_guard_event_trigger.sql` حاليًا (اختياري، يُجرَّب لاحقًا).
- كل الملفات يمكن إعادة تنفيذها بأمان إذا انقطع شيء في المنتصف.
- التطبيق الحالي يستمر في العمل بعد هذه الملفات.
- **بعدها:** غيّر كلمات سر كل الموظفين، لأن كلمات السر المشفّرة كانت مكشوفة قبل الإصلاح.

## الخطوة 3 — نشر التطبيق الجديد
انشر فرع `production-hardening` بعد مراجعته. سيطلب من الجميع تسجيل الدخول مرة واحدة. متغيرات البيئة المطلوبة فقط: `SUPABASE_URL`، `SUPABASE_SERVICE_ROLE_KEY`، `JWT_SECRET`.

## الخطوة 4 — يوم بدء التشغيل الفعلي
1. امسح البيانات التجريبية: نفّذ `database/maintenance/reset_test_data.sql` (يُبقي حساب المالك فقط). ثم نفّذ [اختبار القبول المالي](financial-acceptance-test.md) وطابق الأرقام، ثم امسح مرة أخرى قبل إدخال الأرصدة الحقيقية.
2. سجّل سعر الصرف من الإعدادات.
3. المخزون ← **المخزون الافتتاحي**: البضاعة الموجودة بتكلفتها.
4. المحاسبة ← **الأرصدة الافتتاحية**: النقدية، الأصول، ديون الموردين ← معاينة ← تسجيل. الشرح في [opening-balances-design.md](opening-balances-design.md).
5. أدخل طلبات التفصيل الجارية بعرابينها من شاشة التفصيل.
6. ابدأ البيع.

## المرتجعات (المسار المعتمد)
المخزون ← تسوية مخزنية ← اختر المنتج ← **إدخال** ← اكتب المبلغ المردود للعميل ← اختر الخزينة أو البنك. القيد الناتج:
- مدين المبيعات / دائن الخزينة أو البنك (بالجنيه).
- مدين المخزون / دائن تكلفة المبيعات (بمتوسط التكلفة الحالي).

هذا المسار مختبر ولم يتغير.

/* =====================================================================
   20261107_03_fix_correction_chains_apply.sql — تطبيق الإصلاح (بعد المعاينة والنسخ الاحتياطي)

   شغّل 20261107_02_fix_correction_chains_preview.sql أولًا وراجع نتيجته على staging.
   لا يحذف ولا يعدّل أي قيد: يضيف قيود تسوية جديدة فقط، أرقامها JE-FIXADJ-* (وهي علامة
   منع التكرار)، ومعلَّمة is_correction_reversal كي لا تُصحَّح، و correction_of_id يشير للقيد
   الذي تعالجه. نفس خطة preview حرفيًا (أ: حساب الدفع، ب: العكسيات والنسخ الزائدة).

   يرفض التنفيذ في الحالات التالية (يُلغى كل شيء):
     • وجود قيود JE-FIXADJ-* (طُبّق سابقًا)
     • وجود حالات تحتاج مراجعة يدوية (قسم 4_REVIEW في preview)
     • أن لا يساوي صافي أي سلسلة بعد التسوية آخر نسخة جديدة فقط (تحقق ذاتي قبل COMMIT)
   ===================================================================== */

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE entry_number LIKE 'JE-FIXADJ-%') THEN
    RAISE EXCEPTION 'تم تطبيق هذا الإصلاح من قبل (توجد قيود JE-FIXADJ-*). لن يُعاد تطبيقه.';
  END IF;
END
$guard$;

CREATE TEMP TABLE _fix_plan ON COMMIT DROP AS
WITH
rev AS (
  -- العكسيات التصحيحية (الدالة correct_manual_journal_entry) مرقّمة داخل كل قيد معكوس بالترتيب الزمني
  SELECT r.id, r.correction_of_id AS origin_id, r.branch_id, r.entry_number, r.entry_type,
         r.amount, r.currency, r.exchange_rate_used, r.amount_usd,
         r.debit_account, r.credit_account, r.reference, r.created_by, r.created_at,
         row_number() OVER (PARTITION BY r.correction_of_id ORDER BY r.created_at, r.id) AS rn,
         count(*)     OVER (PARTITION BY r.correction_of_id)                              AS cnt
  FROM public.journal_entries r
  WHERE r.is_correction_reversal
    AND r.entry_number LIKE 'JE-FIX-%'
    AND r.correction_of_id IS NOT NULL
),
new_copy AS (
  -- النسخ الجديدة التي أنشأتها نفس الدالة بعد كل عكس
  SELECT n.id, n.correction_of_id AS origin_id, n.branch_id, n.entry_number, n.entry_type,
         n.amount, n.currency, n.exchange_rate_used, n.amount_usd,
         n.debit_account, n.credit_account, n.reference, n.created_by, n.created_at,
         row_number() OVER (PARTITION BY n.correction_of_id ORDER BY n.created_at, n.id) AS rn,
         count(*)     OVER (PARTITION BY n.correction_of_id)                              AS cnt
  FROM public.journal_entries n
  WHERE NOT n.is_correction_reversal
    AND n.correction_of_id IS NOT NULL
),
dup_origin AS (
  SELECT DISTINCT origin_id FROM rev WHERE cnt > 1
),
review AS (
  -- حالات لا يُصلحها السكربت تلقائيًا (يرفض apply التشغيل حتى تُراجَع يدويًا)
  SELECT d.origin_id, 'نسخة زائدة صُحّحت هي نفسها لاحقًا: ' || n.entry_number AS reason
  FROM dup_origin d
  JOIN new_copy n ON n.origin_id = d.origin_id AND n.rn < n.cnt
  WHERE EXISTS (SELECT 1 FROM rev x WHERE x.origin_id = n.id)
  UNION ALL
  SELECT d.origin_id, 'عدد العكسيات (' || (SELECT max(cnt) FROM rev WHERE origin_id = d.origin_id)
         || ') لا يساوي عدد النسخ الجديدة (' || COALESCE((SELECT max(cnt) FROM new_copy WHERE origin_id = d.origin_id), 0) || ')'
  FROM dup_origin d
  WHERE (SELECT max(cnt) FROM rev WHERE origin_id = d.origin_id)
        IS DISTINCT FROM COALESCE((SELECT max(cnt) FROM new_copy WHERE origin_id = d.origin_id), 0)
),
plan AS (
  -- (ب) أثر زائد: العكسيات الزائدة (ما عدا أول عكس) والنسخ الزائدة (ما عدا آخر نسخة) تُلغى بقيد معاكس لكل منها
  SELECT 'B'::text AS kind, r.origin_id, r.id AS source_id, r.branch_id, r.entry_type,
         r.amount, r.currency, r.exchange_rate_used, r.amount_usd, r.reference, r.created_by,
         r.credit_account AS debit_account, r.debit_account AS credit_account,
         'تسوية: إلغاء عكس زائد ' || r.entry_number AS description
  FROM rev r
  WHERE r.cnt > 1 AND r.rn > 1
  UNION ALL
  SELECT 'B', n.origin_id, n.id, n.branch_id, n.entry_type,
         n.amount, n.currency, n.exchange_rate_used, n.amount_usd, n.reference, n.created_by,
         n.credit_account, n.debit_account,
         'تسوية: إلغاء نسخة زائدة ' || n.entry_number
  FROM new_copy n
  JOIN dup_origin d ON d.origin_id = n.origin_id
  WHERE n.rn < n.cnt
    AND NOT EXISTS (SELECT 1 FROM rev x WHERE x.origin_id = n.id)
  UNION ALL
  -- (أ) عكس رجع لحساب غير حساب دفع القيد الذي عُكس: نقل المبلغ بين الخزنة والبنك.
  -- مصروف: الأصل مدين مصروف / دائن [الدفع]؛ يجب أن يكون العكس مدين [الدفع]، فالتسوية مدين [الحساب الأصلي] / دائن [الحساب الذي رجع إليه].
  -- رأس مال / إيراد: الأصل مدين [الدفع]؛ يجب أن يكون العكس دائن [الدفع]، فالتسوية مدين [الذي خرج منه] / دائن [الحساب الأصلي].
  SELECT 'A', r.origin_id, r.id, r.branch_id, o.entry_type,
         r.amount, r.currency, r.exchange_rate_used, r.amount_usd, r.reference, r.created_by,
         CASE WHEN o.entry_type = 'EXPENSE' THEN o.credit_account ELSE r.credit_account END,
         CASE WHEN o.entry_type = 'EXPENSE' THEN r.debit_account  ELSE o.debit_account  END,
         'تسوية: إرجاع العكس ' || r.entry_number || ' لحساب الدفع الأصلي'
  FROM rev r
  JOIN public.journal_entries o ON o.id = r.origin_id
  WHERE NOT (r.cnt > 1 AND r.rn > 1)
    AND o.entry_type IN ('EXPENSE', 'CAPITAL', 'OTHER')
    AND CASE WHEN o.entry_type = 'EXPENSE'
             THEN o.credit_account IN ('CASH', 'BANK') AND r.debit_account  IS DISTINCT FROM o.credit_account
             ELSE o.debit_account  IN ('CASH', 'BANK') AND r.credit_account IS DISTINCT FROM o.debit_account
        END
),
review_count AS (SELECT count(*) AS n FROM review)
SELECT p.*, (SELECT n FROM review_count) AS review_n
FROM plan p;

DO $review$
DECLARE
  v_review_n integer;
BEGIN
  SELECT COALESCE(max(review_n), 0) INTO v_review_n FROM _fix_plan;

  -- حالة تحتاج مراجعة قد لا يكون لها قيد في الخطة، فنعدّها مباشرة أيضًا
  IF v_review_n > 0 THEN
    RAISE EXCEPTION 'توجد % حالة تحتاج مراجعة يدوية (قسم 4_REVIEW في preview). لم يُطبَّق شيء.', v_review_n;
  END IF;
END
$review$;

INSERT INTO public.journal_entries (
  entry_number, branch_id, entry_type, amount, description, reference,
  debit_account, credit_account, created_by, created_at,
  currency, exchange_rate_used, amount_usd,
  correction_of_id, is_correction_reversal
)
SELECT
  'JE-FIXADJ-' || upper(substr(md5(random()::text || clock_timestamp()::text || p.source_id::text || p.kind), 1, 10)),
  p.branch_id, p.entry_type, p.amount, p.description, p.reference,
  p.debit_account, p.credit_account, p.created_by, now(),
  p.currency, p.exchange_rate_used, p.amount_usd,
  p.source_id, true
FROM _fix_plan p
ORDER BY p.origin_id, p.kind, p.source_id;

-- تحقق ذاتي: صافي كل سلسلة بعد التسوية = أثر آخر نسخة جديدة فقط (بكل حساب وعملة)
DO $verify$
DECLARE
  v_bad text;
BEGIN
  WITH origins AS (SELECT DISTINCT origin_id FROM _fix_plan),
  members AS (
    SELECT o.origin_id, o.origin_id AS id FROM origins o
    UNION ALL
    SELECT o.origin_id, c.id FROM origins o
      JOIN public.journal_entries c ON c.correction_of_id = o.origin_id
    UNION ALL
    SELECT o.origin_id, a.id FROM origins o
      JOIN public.journal_entries c ON c.correction_of_id = o.origin_id
      JOIN public.journal_entries a ON a.correction_of_id = c.id AND a.entry_number LIKE 'JE-FIXADJ-%'
  ),
  last_new AS (
    SELECT DISTINCT ON (n.correction_of_id) n.correction_of_id AS origin_id, n.id
    FROM public.journal_entries n
    WHERE NOT n.is_correction_reversal AND n.correction_of_id IN (SELECT origin_id FROM origins)
    ORDER BY n.correction_of_id, n.created_at DESC, n.id DESC
  ),
  net AS (
    SELECT m.origin_id, x.account, x.currency, round(sum(x.amt), 2) AS amt
    FROM members m
    JOIN public.journal_entries e ON e.id = m.id
    CROSS JOIN LATERAL (VALUES (e.debit_account, e.currency, e.amount), (e.credit_account, e.currency, -e.amount)) AS x(account, currency, amt)
    GROUP BY m.origin_id, x.account, x.currency
  ),
  expected AS (
    SELECT l.origin_id, x.account, x.currency, round(sum(x.amt), 2) AS amt
    FROM last_new l
    JOIN public.journal_entries e ON e.id = l.id
    CROSS JOIN LATERAL (VALUES (e.debit_account, e.currency, e.amount), (e.credit_account, e.currency, -e.amount)) AS x(account, currency, amt)
    GROUP BY l.origin_id, x.account, x.currency
  )
  SELECT string_agg(COALESCE(n.origin_id, e.origin_id)::text || ':' || COALESCE(n.account, e.account) || ':' || COALESCE(n.currency, e.currency), ', ')
  INTO v_bad
  FROM net n
  FULL JOIN expected e ON e.origin_id = n.origin_id AND e.account = n.account AND e.currency = n.currency
  WHERE COALESCE(n.amt, 0) <> COALESCE(e.amt, 0);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'فشل التحقق الذاتي: صافي السلسلة لا يساوي آخر نسخة بعد التسوية (%). أُلغي كل شيء.', v_bad;
  END IF;
END
$verify$;

COMMIT;

/* =====================================================================
   20261107_02_fix_correction_chains_preview.sql — قراءة فقط (لا يكتب شيئًا)

   يعرض ما سيفعله 20261107_03_fix_correction_chains_apply.sql دون تنفيذه:

     (أ) كل قيد عكسي JE-FIX-* رجع لحساب غير حساب دفع القيد الذي عُكس
         ← قيد تسوية بنفس المبلغ والعملة وسعر الصرف ينقل المبلغ للحساب الأصلي.
     (ب) كل قيد عُكس أكثر من مرة (JE-FIX-* متعددة لنفس القيد)
         ← قيد تسوية معاكس لكل عكس زائد (ما عدا الأول) ولكل نسخة جديدة زائدة (ما عدا الأخيرة)،
           فيبقى صافي السلسلة = آخر نسخة مقصودة فقط.

   لا يُحذف ولا يُعدَّل أي قيد؛ التسويات قيود جديدة فقط.

   النتيجة جدول واحد مرتب بالأقسام (عمود section):
     1_SUMMARY  عدد قيود التسوية المخططة (أ/ب) وعدد الحالات التي تحتاج مراجعة يدوية
     2_CASE     لكل سلسلة وحساب وعملة: الأثر الحالي، والأثر الصحيح، والفرق (بالعملة الأصلية وبالدولار)
     3_TOTAL    إجمالي الفرق لكل حساب وعملة (كل السلاسل)
     4_REVIEW   حالات لا يُصلحها السكربت تلقائيًا (يرفض apply التنفيذ حتى تُراجَع)
     5_APPLIED  إن وُجدت قيود JE-FIXADJ-* فقد طُبّق الإصلاح من قبل (ولا يُعاد تطبيقه)

   الأثر = (مدين +) و(دائن −) لكل حساب. شغّله على staging أولًا.
   ===================================================================== */

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
chain AS (
  SELECT o.id AS origin_id, 'chain'::text AS role, o.debit_account, o.credit_account, o.currency, o.amount, o.amount_usd
  FROM public.journal_entries o
  WHERE o.id IN (SELECT origin_id FROM plan)
  UNION ALL
  SELECT r.origin_id, 'chain', r.debit_account, r.credit_account, r.currency, r.amount, r.amount_usd
  FROM rev r WHERE r.origin_id IN (SELECT origin_id FROM plan)
  UNION ALL
  SELECT n.origin_id, 'chain', n.debit_account, n.credit_account, n.currency, n.amount, n.amount_usd
  FROM new_copy n WHERE n.origin_id IN (SELECT origin_id FROM plan)
  UNION ALL
  SELECT p.origin_id, 'adj', p.debit_account, p.credit_account, p.currency, p.amount, p.amount_usd
  FROM plan p
),
lines AS (
  SELECT origin_id, role, debit_account  AS account, currency,  amount AS amt,  amount_usd AS usd FROM chain
  UNION ALL
  SELECT origin_id, role, credit_account AS account, currency, -amount AS amt, -amount_usd AS usd FROM chain
),
per_case AS (
  SELECT origin_id, account, currency,
         round(COALESCE(sum(amt) FILTER (WHERE role = 'chain'), 0), 2)             AS current_amt,
         round(sum(amt), 2)                                                        AS correct_amt,
         round(COALESCE(sum(amt) FILTER (WHERE role = 'adj'), 0), 2)               AS diff_amt,
         round(COALESCE(sum(usd) FILTER (WHERE role = 'chain'), 0), 2)             AS current_usd,
         round(sum(usd), 2)                                                        AS correct_usd,
         round(COALESCE(sum(usd) FILTER (WHERE role = 'adj'), 0), 2)               AS diff_usd
  FROM lines
  GROUP BY origin_id, account, currency
),
totals AS (
  SELECT account, currency, round(sum(diff_amt), 2) AS diff_amt, round(sum(diff_usd), 2) AS diff_usd
  FROM per_case
  GROUP BY account, currency
)
SELECT '1_SUMMARY'::text AS section,
       'قيود تسوية (أ): ' || (SELECT count(*) FROM plan WHERE kind = 'A')
         || ' — (ب): ' || (SELECT count(*) FROM plan WHERE kind = 'B')
         || ' — سلاسل: ' || (SELECT count(DISTINCT origin_id) FROM plan)
         || ' — تحتاج مراجعة يدوية: ' || (SELECT count(*) FROM review) AS label,
       NULL::text AS account, NULL::text AS currency,
       NULL::numeric AS current_amount, NULL::numeric AS correct_amount, NULL::numeric AS diff_amount,
       NULL::numeric AS current_usd, NULL::numeric AS correct_usd, NULL::numeric AS diff_usd
UNION ALL
SELECT '2_CASE', o.entry_number, c.account, c.currency,
       c.current_amt, c.correct_amt, c.diff_amt, c.current_usd, c.correct_usd, c.diff_usd
FROM per_case c
JOIN public.journal_entries o ON o.id = c.origin_id
UNION ALL
SELECT '3_TOTAL', 'إجمالي الفرق لكل الحسابات', account, currency, NULL, NULL, diff_amt, NULL, NULL, diff_usd
FROM totals
UNION ALL
SELECT '4_REVIEW', o.entry_number || ' — ' || r.reason, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM review r
JOIN public.journal_entries o ON o.id = r.origin_id
UNION ALL
SELECT '5_APPLIED', 'طُبّق الإصلاح سابقًا: ' || count(*) || ' قيد JE-FIXADJ-*', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM public.journal_entries WHERE entry_number LIKE 'JE-FIXADJ-%' HAVING count(*) > 0
ORDER BY 1, 2, 3, 4;

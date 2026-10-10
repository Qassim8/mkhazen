-- =====================================================================
-- SUPERSEDED — DO NOT APPLY. Never applied to production.
-- Replaced by the 20261010_* sequence (see docs/release-plan.md).
-- Kept only for review history.
-- =====================================================================

/* =====================================================================
   20261009_02 — إجماليات دفتر القيود من قاعدة البيانات (أداء)
   =====================================================================
   صفحة المحاسبة كانت بتنزّل كل القيود (على دفعات 1000 صف) مرتين في كل
   فتح، وده بيبطأ مع الوقت لحد ما يعدّي مهلة الـ serverless على Vercel.

   الدالة دي بترجع مجاميع مجمّعة حسب (مدين، دائن، عملة، نوع، شهر بتوقيت
   السودان UTC+2). كل حسابات الأرصدة والأرباح في
   app/api/accounting/_lib/ledger.ts جمع خطي على القيود، فالنتيجة من المجاميع
   مطابقة تمامًا للنتيجة من القيود نفسها (متأكد منه في
   database/tests/ledger.db.test.ts).

   قراءة فقط — ما بتعدّلش أي بيانات. قابلة لإعادة التشغيل.
   الرجوع: DROP FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz);
   (التطبيق بيرجع تلقائيًا للطريقة القديمة لو الدالة مش موجودة)
   ===================================================================== */

BEGIN;

CREATE OR REPLACE FUNCTION public.ledger_period_totals(
  p_branch_id uuid,
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL
)
RETURNS TABLE (
  debit_account  text,
  credit_account text,
  currency       text,
  entry_type     text,
  month_key      text,
  amount         numeric,
  amount_usd     numeric,
  entries        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    je.debit_account::text,
    je.credit_account::text,
    je.currency::text,
    je.entry_type::text,
    to_char((je.created_at AT TIME ZONE 'UTC') + interval '2 hours', 'YYYY-MM') AS month_key,
    sum(je.amount)                     AS amount,
    sum(COALESCE(je.amount_usd, 0))    AS amount_usd,
    count(*)                           AS entries
  FROM public.journal_entries je
  WHERE je.branch_id = p_branch_id
    AND (p_from IS NULL OR je.created_at >= p_from)
    AND (p_to   IS NULL OR je.created_at <  p_to)
  GROUP BY 1, 2, 3, 4, 5
$$;

-- ملاحظة: ما فيش فهرس جديد هنا عمدًا (الأرصدة الكلية بتمسح الجدول كله على أي حال،
-- وإنشاء فهرس عادي بيوقف الكتابة لحظيًا). لو الجدول كبر جدًا: راجع
-- docs/production-audit.md (قسم الأداء) لاقتراح فهرس CONCURRENTLY.

REVOKE ALL ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ledger_period_totals(uuid, timestamptz, timestamptz) TO service_role';
  END IF;
END $$;

COMMIT;

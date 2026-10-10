-- =====================================================================
-- SUPERSEDED — DO NOT APPLY. Never applied to production.
-- Replaced by the 20261010_* sequence (see docs/release-plan.md).
-- Kept only for review history.
-- =====================================================================

/* =====================================================================
   الرجوع عن 20261009_01_atomic_purchases_and_idempotency.sql
   =====================================================================
   ⚠️ قبل التشغيل: ارجع لنسخة التطبيق السابقة الأول (النسخة الجديدة بتعتمد
   على الدالتين دول وبترفض الاستلام/الدفع من غيرهم).

   ما بيمسحش أي بيانات مالية: الحركات والقيود والدفعات اللي اتسجلت بالدوال
   دي بتفضل زي ما هي (هي سجلات عادية في نفس الجداول).
   الجدول api_idempotency_keys بيتمسح (فيه مفاتيح منع تكرار بس، مش بيانات عمل).
   ===================================================================== */

BEGIN;

DROP FUNCTION IF EXISTS public.receive_purchase_order(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text);
DROP TABLE IF EXISTS public.api_idempotency_keys;

COMMIT;

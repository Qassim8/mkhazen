/* =====================================================================
   Rollback of 20261010_02_atomic_purchases_and_idempotency.sql
   =====================================================================
   ⚠️ Deploy the previous application version FIRST: the new app calls
   receive_purchase_order / record_purchase_payment and refuses purchase
   receipts and supplier payments without them (fail-closed, by design).

   Does not touch financial data: movements, journal entries and payments
   created through these functions stay — they are ordinary rows.
   api_idempotency_keys only holds duplicate-submission keys (no business data).

   This rollback grants nothing to anon/authenticated.
   ===================================================================== */

BEGIN;

DROP FUNCTION IF EXISTS public.receive_purchase_order(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.record_purchase_payment(uuid, uuid, uuid, numeric, timestamptz, text, text, text);
DROP TABLE IF EXISTS public.api_idempotency_keys;

COMMIT;

NOTIFY pgrst, 'reload schema';

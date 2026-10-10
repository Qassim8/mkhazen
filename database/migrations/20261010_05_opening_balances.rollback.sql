/* =====================================================================
   Rollback of 20261010_05_opening_balances.sql
   =====================================================================
   ⚠️ Deploy the previous application version FIRST (the opening-balances
   page calls these functions).

   Removes the functions only. Opening balances already POSTED stay: they are
   ordinary journal entries, assets and purchase orders. Because of that, the
   widened CHECK constraints are restored only when no row uses 'OPENING'
   (otherwise the constraint is kept and a NOTICE says why).

   Grants nothing to anon/authenticated.
   ===================================================================== */

BEGIN;

DROP FUNCTION IF EXISTS public.record_opening_balances(uuid, uuid, date, jsonb, jsonb, jsonb, text, boolean);
DROP FUNCTION IF EXISTS public.get_opening_balances_status(uuid);
DROP FUNCTION IF EXISTS public.opening_balance_timestamp(date);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE purchase_type = 'OPENING') THEN
    RAISE NOTICE 'KEPT purchase_orders_type_check with OPENING — opening supplier debts exist';
  ELSE
    ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_type_check;
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_type_check
      CHECK ((purchase_type)::text = ANY (ARRAY['DIRECT', 'WORKFLOW']::text[]));
  END IF;

  IF EXISTS (SELECT 1 FROM public.assets WHERE payment_method = 'OPENING') THEN
    RAISE NOTICE 'KEPT assets_payment_method_check with OPENING — opening assets exist';
  ELSE
    ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_payment_method_check;
    ALTER TABLE public.assets ADD CONSTRAINT assets_payment_method_check
      CHECK ((payment_method)::text = ANY (ARRAY['CASH', 'BANK']::text[]));
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

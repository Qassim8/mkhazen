-- دورة المشتريات: الحالات، المخزون، والحسابات
-- شغّل هذا الملف في SQL Editor في Supabase

ALTER TABLE public.purchase_orders
  ALTER COLUMN delivery_cost TYPE numeric(12, 2)
  USING COALESCE(delivery_cost, 0)::numeric(12, 2);

ALTER TABLE public.purchase_orders
  ALTER COLUMN delivery_cost SET DEFAULT 0;

ALTER TABLE public.purchase_orders
  ALTER COLUMN delivery_cost SET NOT NULL;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check CHECK (
    (status)::text = ANY (
      ARRAY[
        'DIRECT'::character varying,
        'DRAFT'::character varying,
        'APPROVED'::character varying,
        'RECEIVED'::character varying,
        'CANCELLED'::character varying
      ]::text[]
    )
  );

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  purchase_order_id uuid NULL,
  movement_type character varying(20) NOT NULL DEFAULT 'STOCK_IN',
  quantity integer NOT NULL,
  unit_cost numeric(12, 2) NULL DEFAULT 0,
  reference character varying(80) NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamp without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_im_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE SET NULL,
  CONSTRAINT inventory_movements_qty_check CHECK (quantity <> 0)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  reference character varying(80) NULL,
  debit_account character varying(120) NOT NULL,
  credit_account character varying(120) NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  purchase_order_id uuid NULL,
  created_by uuid NULL,
  created_at timestamp without time zone NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT journal_entries_pkey PRIMARY KEY (id),
  CONSTRAINT fk_je_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE SET NULL,
  CONSTRAINT journal_entries_amount_check CHECK (amount >= 0)
);

CREATE OR REPLACE FUNCTION public.process_purchase_order_receipt(po_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  po RECORD;
  item RECORD;
  product_row RECORD;
  conversion numeric;
  stock_add integer;
  already_received boolean;
BEGIN
  SELECT *
  INTO po
  FROM public.purchase_orders
  WHERE id = po_id
  FOR UPDATE;

  IF po IS NULL THEN
    RAISE EXCEPTION 'طلب الشراء غير موجود';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_movements
    WHERE purchase_order_id = po_id
      AND movement_type = 'STOCK_IN'
  ) INTO already_received;

  IF already_received THEN
    RETURN;
  END IF;

  FOR item IN
    SELECT *
    FROM public.purchase_order_items
    WHERE purchase_order_id = po_id
  LOOP
    SELECT *
    INTO product_row
    FROM public.products
    WHERE id = item.product_id
    FOR UPDATE;

    IF product_row IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود';
    END IF;

    conversion := COALESCE(
      NULLIF((to_jsonb(product_row)->>'conversionFactor')::numeric, 0),
      1
    );
    stock_add := CEIL(item.quantity * conversion);

    UPDATE public.products
    SET "stockQuantity" = COALESCE("stockQuantity", 0) + stock_add
    WHERE id = item.product_id;

    UPDATE public.purchase_order_items
    SET received_quantity = item.quantity
    WHERE id = item.id;

    INSERT INTO public.inventory_movements (
      product_id,
      purchase_order_id,
      movement_type,
      quantity,
      unit_cost,
      reference,
      notes
    ) VALUES (
      item.product_id,
      po_id,
      'STOCK_IN',
      stock_add,
      item.unit_cost,
      po.order_number,
      'استلام مشتريات'
    );
  END LOOP;

  INSERT INTO public.journal_entries (
    description,
    reference,
    debit_account,
    credit_account,
    amount,
    purchase_order_id
  ) VALUES (
    CASE
      WHEN po.status = 'DIRECT' THEN 'قيد شراء مباشر ' || po.order_number
      ELSE 'قيد استلام طلب شراء ' || po.order_number
    END,
    po.order_number,
    'المخزون / البضاعة',
    CASE
      WHEN po.supplier_id IS NULL THEN 'الخزينة النقدية'
      ELSE 'الموردون (ذمم دائنة)'
    END,
    COALESCE(po.total_amount, 0),
    po_id
  );
END;
$$;

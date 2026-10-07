/** أنواع صفوف الفاتورة كما بترجع من Supabase (العلاقات ممكن ترجع كائن أو مصفوفة) */

export type Relation<T> = T | T[] | null | undefined;

export function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type TemplateRel = { id?: string | null; name?: string | null };

export type VariantRel = {
  sku?: string | null;
  barcode?: string | null;
  packBarcode?: string | null;
  colorName?: string | null;
  colorCode?: string | null;
  size?: string | null;
  template?: Relation<TemplateRel>;
};

export type SaleItemRow = {
  id?: string;
  sales_order_id?: string;
  template_id?: string;
  variant_id?: string;
  quantity: number | string;
  unit_price: number | string;
  total_price: number | string;
  is_gift?: boolean | null;
  gift_note?: string | null;
  variant?: Relation<VariantRel>;
};

export type SalePaymentRow = {
  id: string;
  amount: number | string;
  payment_date?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  createdBy?: Relation<{ name?: string | null }>;
};

import { supabaseAdmin } from "@/lib/supabase";

/** SKU وباركود جديدين من دوال قاعدة البيانات (generate_product_sku / generate_product_barcode) */
export async function generateProductCodes(): Promise<{ sku: string; barcode: string }> {
  const [sku, barcode] = await Promise.all([
    supabaseAdmin.rpc("generate_product_sku"),
    supabaseAdmin.rpc("generate_product_barcode"),
  ]);

  if (sku.error || barcode.error || !sku.data || !barcode.data) {
    throw new Error("تعذر توليد SKU والباركود.");
  }

  return { sku: String(sku.data), barcode: String(barcode.data) };
}

/** منتج التصنيع/التحويل: SKU والباركود يتولدوا تلقائيًا لو الحقل فاضي */
export async function withGeneratedCodes<T extends { sku?: string | null; barcode?: string | null }>(
  payload: T,
): Promise<T> {
  const needsSku = !payload.sku?.trim();
  const needsBarcode = !payload.barcode?.trim();
  if (!needsSku && !needsBarcode) return payload;

  const codes = await generateProductCodes();
  return {
    ...payload,
    sku: needsSku ? codes.sku : payload.sku,
    barcode: needsBarcode ? codes.barcode : payload.barcode,
  };
}

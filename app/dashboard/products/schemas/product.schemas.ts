import { z } from "zod";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

export const createProductSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  packBarcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().min(1, "يرجى اختيار الفئة").optional().nullable(),
  supplierId: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().min(0, "سعر الشراء يجب أن يكون 0 أو أكثر"),
  sellingPrice: z.coerce.number().min(0, "سعر البيع يجب أن يكون 0 أو أكثر"),
  stockQuantity: z.coerce
    .number()
    .int("الكمية يجب أن تكون عدد صحيح")
    .min(0, "الكمية يجب أن تكون 0 أو أكثر")
    .default(0),
  minStockLevel: z.coerce
    .number()
    .int("حد إعادة الطلب يجب أن يكون عدد صحيح")
    .min(0, "حد إعادة الطلب يجب أن يكون 0 أو أكثر")
    .default(5),
  purchaseUnit: z.string().default("قطعة"),
  sellingUnit: z.string().default("قطعة"),
  conversionFactor: z.coerce
    .number()
    .min(0.01, "معامل التحويل يجب أن يكون أكبر من صفر")
    .default(1),
  minSellingPrice: z.coerce.number().min(0).optional().nullable(),
  sizes: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const productSchema = createProductSchema;
export const updateProductSchema = createProductSchema.partial();

export type ProductFormInputType = z.input<typeof createProductSchema>;
export type ProductFormOutputType = z.output<typeof createProductSchema>;
export type CreateProductFormInput = ProductFormInputType;
export type CreateProductFormOutput = ProductFormOutputType;
export type UpdateProductFormInput = z.input<typeof updateProductSchema>;
export type UpdateProductFormOutput = z.output<typeof updateProductSchema>;

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minStockLevel?: number | null;
  purchaseUnit?: string | null;
  sellingUnit?: string | null;
  conversionFactor?: number | null;
  minSellingPrice?: number | null;
  sizes?: string[];
  images?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  category?: Category | null;
  supplier?: Supplier | null;
}

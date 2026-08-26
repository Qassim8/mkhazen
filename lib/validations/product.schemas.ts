import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().min(1, "يرجى اختيار الفئة"),
  supplierId: z.string().optional(),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  stockQuantity: z.number().min(0),
  minStockLevel: z.number().min(0),
  purchaseUnit: z.string().default("قطعة"),
  sellingUnit: z.string().default("قطعة"),
  length: z.string().optional(),
  width: z.string().optional(),
  sizes: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type ProductFormInputType = z.input<typeof productSchema>;
export type ProductFormOutputType = z.output<typeof productSchema>;

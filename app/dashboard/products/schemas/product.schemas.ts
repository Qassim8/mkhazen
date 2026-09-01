import { z } from "zod";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

// 1. Schema المتغير الواحد
export const variantSchema = z.object({
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  packBarcode: z.string().nullable().optional(),
  colorName: z.string().nullable().optional(),
  colorCode: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  length: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  purchasePrice: z.number({ error: "سعر الشراء مطلوب" }),
  sellingPrice: z.number({ error: "سعر البيع مطلوب" }),
  minSellingPrice: z.number().nullable().optional(),
  stockQuantity: z.number().default(0),
  minStockLevel: z.number().default(5),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  images: z.array(z.string()).optional(),
});

// 2. المخطط الأساسي كـ ZodObject كائن مباشر
export const baseProductSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),

  purchaseUnit: z.string().default("طاقة"),
  sellingUnit: z.string().default("متر"),
  conversionFactor: z.coerce
    .number()
    .min(0.01, "معامل التحويل يجب أن يكون أكبر من صفر")
    .default(1),

  images: z.array(z.string()).default([]),
  hasVariants: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isVisible: z.boolean().default(true),

  variants: z
    .array(variantSchema)
    .min(1, "يجب إدخال بيانات السعر والكمية للمنتج على الأقل"),
});

// دالة التحقق الشرطي للتحقق من المنطق الخاص بالمتغيرات
const validateProductVariants = (
  data: z.infer<typeof baseProductSchema>,
  ctx: z.RefinementCtx,
) => {
  // حالة 1: منتج فردي (hasVariants = false)
  if (!data.hasVariants) {
    if (data.variants && data.variants.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المنتج الفردي لا يمكن أن يحتوي على أكثر من متغير واحد",
        path: ["variants"],
      });
    }
  }

  // حالة 2: منتج متعدد الخيارات (hasVariants = true)
  if (data.hasVariants && data.variants) {
    const hasDefaultVariant = data.variants.some((v) => v.isDefault);
    if (!hasDefaultVariant && data.variants.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تحديد متغير افتراضي واحد على الأقل للمنتج المتعدد",
        path: ["variants"],
      });
    }
  }
};

// 3. مخطط الإنشاء ومخطط التحديث
export const createProductSchema = baseProductSchema.superRefine(
  validateProductVariants,
);

export const updateProductSchema = baseProductSchema
  .partial()
  .superRefine((data, ctx) => {
    // تشغيل التحقق الشرطي فقط في حال وجود الخواص المرتبطة بالتعديل
    if (data.hasVariants !== undefined && data.variants !== undefined) {
      validateProductVariants(data as z.infer<typeof baseProductSchema>, ctx);
    }
  });

export const productSchema = createProductSchema;

// 4. الأنواع المشتقة من Zod
export type ProductFormInputType = z.input<typeof createProductSchema>;
export type ProductFormOutputType = z.output<typeof createProductSchema>;
export type CreateProductFormInput = ProductFormInputType;
export type CreateProductFormOutput = ProductFormOutputType;
export type UpdateProductFormInput = z.input<typeof updateProductSchema>;
export type UpdateProductFormOutput = z.output<typeof updateProductSchema>;

export type VariantFormInput = z.input<typeof variantSchema>;
export type VariantFormOutput = z.output<typeof variantSchema>;

// 5. Interfaces الخاصة بالبيانات المرجعة من قاعدة البيانات (DB Entities)
export interface ProductVariant {
  id: string;
  sku?: string;
  barcode?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  attributes?: Record<string, string>;
  images?: string[];
}

export interface ProductTemplate {
  id: string;
  name: string;
  description?: string;
  sku?: string; // الـ SKU العام إن وجد
  barcode?: string;
  minStockLevel?: number;
  sellingUnit?: string;
  purchaseUnit?: string;
  category?: { name: string };
  supplier?: { name: string };
  images?: string[];
  variants: ProductVariant[]; // الحقل الأساسي للأسعار والمخزون
}

export type Product = ProductTemplate;

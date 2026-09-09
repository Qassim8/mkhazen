import { z } from "zod";

/* =========================================================
   Helpers
========================================================= */

const nullableOptionalString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().trim().nullable().optional(),
);
const nullableOptionalUuid = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().uuid().nullable().optional(),
);

/* =========================================================
   Variant Schema
========================================================= */

export const variantSchema = z
  .object({
    sku: nullableOptionalString,

    barcode: nullableOptionalString,

    packBarcode: nullableOptionalString,

    colorName: nullableOptionalString,

    colorCode: nullableOptionalString,

    size: nullableOptionalString,

    length: z.number().nonnegative().nullable().optional(),

    width: z.number().nonnegative().nullable().optional(),

    purchasePrice: z.number().nonnegative({
      error: "سعر الشراء لا يمكن أن يكون سالبًا",
    }),

    sellingPrice: z.number().nonnegative({
      error: "سعر البيع لا يمكن أن يكون سالبًا",
    }),

    minSellingPrice: z.number().nonnegative().nullable().optional(),

    minStockLevel: z.number().nonnegative().default(5),

    isDefault: z.boolean().default(false),

    isActive: z.boolean().default(true),

    images: z.array(z.string().url()).default([]),
  })
  .superRefine((data, ctx) => {
    if (
      data.minSellingPrice !== null &&
      data.minSellingPrice !== undefined &&
      data.minSellingPrice > data.sellingPrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "الحد الأدنى لسعر البيع لا يمكن أن يكون أكبر من سعر البيع",
        path: ["minSellingPrice"],
      });
    }
  });

/* =========================================================
   Base Product Fields

   IMPORTANT:
   لا يوجد superRefine هنا حتى نستطيع
   استخدام .partial() في update schema.
========================================================= */

export const baseProductFields = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب"),

  description: z.string().optional().nullable(),

  categoryId: nullableOptionalUuid,

  supplierId: nullableOptionalUuid,

  purchaseUnit: z.string().trim().min(1, "وحدة الشراء مطلوبة"),

  sellingUnit: z.string().trim().min(1, "وحدة البيع مطلوبة"),

  conversionFactor: z.coerce
    .number()
    .positive("معامل التحويل يجب أن يكون أكبر من صفر"),

  images: z.array(z.string().url()).default([]),

  isActive: z.boolean().default(true),

  isVisible: z.boolean().default(true),
});

/* =========================================================
   Create Validation
========================================================= */

const validateCreateProduct = (
  data: {
    purchaseUnit: string;
    sellingUnit: string;
    conversionFactor: number;
    variants: Array<{
      isDefault?: boolean;
    }>;
  },
  ctx: z.RefinementCtx,
) => {
  /* -------------------------------------------------------
     Conversion validation
  ------------------------------------------------------- */

  if (data.purchaseUnit === data.sellingUnit && data.conversionFactor !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "معامل التحويل يجب أن يكون 1 عندما تكون وحدات الشراء والبيع متطابقة",
      path: ["conversionFactor"],
    });
  }

  /* -------------------------------------------------------
     Variant validation

     hasVariants is derived:
     1 variant  = simple product
     2+ variants = product with variants
  ------------------------------------------------------- */

  const variantsCount = data.variants.length;

  const hasVariants = variantsCount > 1;

  const defaultCount = data.variants.filter(
    (variant) => variant.isDefault === true,
  ).length;

  if (hasVariants) {
    if (defaultCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تحديد متغير افتراضي واحد فقط",
        path: ["variants"],
      });
    }
  } else {
    if (variantsCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المنتج الفردي يجب أن يحتوي على متغير واحد فقط",
        path: ["variants"],
      });
    }

    if (variantsCount === 1 && data.variants[0]?.isDefault !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المتغير الوحيد يجب أن يكون المتغير الافتراضي",
        path: ["variants", 0, "isDefault"],
      });
    }
  }
};

/* =========================================================
   Create Variant
========================================================= */

export const createVariantSchema = variantSchema;

/* =========================================================
   Update Variant
========================================================= */

export const updateVariantSchema = variantSchema.extend({
  id: z.string().uuid().optional(),
});

/* =========================================================
   Create Product
========================================================= */

export const createProductSchema = baseProductFields
  .extend({
    variants: z
      .array(createVariantSchema)
      .min(1, "يجب إدخال بيانات المتغير للمنتج"),
  })
  .superRefine(validateCreateProduct);

/* =========================================================
   Update Product
========================================================= */

export const updateProductSchema = baseProductFields
  .partial()
  .extend({
    variants: z.array(updateVariantSchema).optional(),
  })
  .superRefine((data, ctx) => {
    /*
     * في PATCH/PUT قد لا تصل كل حقول الوحدات.
     * لذلك نتحقق عندما تكون الثلاثة موجودة.
     */

    if (
      data.purchaseUnit !== undefined &&
      data.sellingUnit !== undefined &&
      data.conversionFactor !== undefined &&
      data.purchaseUnit === data.sellingUnit &&
      data.conversionFactor !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "معامل التحويل يجب أن يكون 1 عندما تكون وحدات الشراء والبيع متطابقة",
        path: ["conversionFactor"],
      });
    }
  });

/* =========================================================
   Product Schema
========================================================= */

export const productSchema = createProductSchema;

/* =========================================================
   Form / API Input Types
========================================================= */

export type CreateProductInput = z.infer<typeof createProductSchema>;

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export type VariantInput = z.infer<typeof variantSchema>;

/* =========================================================
   Database / API Response Types

   These are NOT form inputs.
   They include generated fields مثل:
   id, stockQuantity, timestamps...
========================================================= */

export interface ProductVariant {
  id: string;
  templateId: string;

  sku: string | null;
  barcode: string | null;
  packBarcode: string | null;

  colorName: string | null;
  colorCode: string | null;

  size: string | null;

  length: number | null;
  width: number | null;

  purchasePrice: number;
  sellingPrice: number;

  minSellingPrice: number | null;
  stockQuantity: number;
  minStockLevel: number | null;

  images: string[];

  isDefault: boolean;
  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;

  name: string;
  description: string | null;

  categoryId: string | null;
  supplierId: string | null;

  hasVariants: boolean;

  purchaseUnit: string | null;
  sellingUnit: string | null;
  conversionFactor: number | null;

  images: string[];

  isActive: boolean;
  isVisible: boolean;

  createdAt: string;
  updatedAt: string;

  variants: ProductVariant[];
}

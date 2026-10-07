import { z } from "zod";

/* =========================================================
   INVENTORY ADJUSTMENT
========================================================= */

export const inventoryAdjustmentSchema = z
  .object({
    variantId: z.string().uuid("معرف المتغير غير صالح"),

    adjustmentType: z.enum(["IN", "OUT"], {
      message: "نوع التسوية يجب أن يكون إدخال (IN) أو إخراج (OUT)",
    }),

    quantity: z
      .number({
        message: "الكمية مطلوبة",
      })
      .finite("الكمية غير صالحة")
      .positive("الكمية يجب أن تكون أكبر من صفر"),

    amount: z
      .number({
        message: "المبلغ مطلوب",
      })
      .finite("المبلغ غير صالح"),

    paymentMethod: z.enum(["CASH", "BANK"]).nullable().optional(),

    notes: z
      .string()
      .trim()
      .min(3, "يرجى كتابة سبب التسوية")
      .max(500, "سبب التسوية طويل جدًا"),
  })
  .superRefine((data, ctx) => {
    if (data.amount !== 0 && !data.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentMethod"],
        message: "يجب تحديد طريقة الدفع عند وجود مبلغ مالي",
      });
    }
  });

/* =========================================================
   TYPES
========================================================= */

export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;

/* =========================================================
   OPENING STOCK — المخزون الافتتاحي
   البضاعة الموجودة في المتجر قبل بدء استخدام النظام.
   التكلفة بالدولار زي باقي تكاليف المخزون.
========================================================= */

export const openingStockItemSchema = z.object({
  variantId: z.string().uuid("معرف الصنف غير صالح"),

  quantity: z
    .number({ message: "الكمية مطلوبة" })
    .finite("الكمية غير صالحة")
    .positive("الكمية يجب أن تكون أكبر من صفر")
    .max(1_000_000, "الكمية كبيرة جدًا"),

  unitCost: z
    .number({ message: "تكلفة الوحدة مطلوبة" })
    .finite("تكلفة الوحدة غير صالحة")
    .positive("تكلفة الوحدة يجب أن تكون أكبر من صفر")
    .max(1_000_000, "تكلفة الوحدة كبيرة جدًا"),
});

export const openingStockSchema = z.object({
  items: z
    .array(openingStockItemSchema)
    .min(1, "اختر صنفًا واحدًا على الأقل")
    .max(500, "عدد الأصناف كبير جدًا، سجّلها على دفعات")
    .superRefine((items, ctx) => {
      const seen = new Set<string>();

      for (const item of items) {
        if (seen.has(item.variantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "الصنف مكرر في نفس العملية",
          });
          return;
        }

        seen.add(item.variantId);
      }
    }),

  notes: z
    .string()
    .trim()
    .max(500, "الملاحظة طويلة جدًا")
    .nullable()
    .optional(),
});

export type OpeningStockItemInput = z.infer<typeof openingStockItemSchema>;
export type OpeningStockInput = z.infer<typeof openingStockSchema>;

export interface OpeningStockCandidate {
  id: string;
  templateId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  colorName: string | null;
  size: string | null;
  sellingUnit: string | null;
  sellingPrice: number | null;
  purchasePrice: number | null;
  averageCost: number | null;
  minStockLevel: number | null;
}

export interface OpeningStockResult {
  journalEntryId: string;
  entryNumber: string;
  itemsCount: number;
  totalCostUsd: number;
}

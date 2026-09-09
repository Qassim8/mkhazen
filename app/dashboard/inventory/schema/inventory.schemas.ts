import { z } from "zod";

/* =========================================================
   INVENTORY ADJUSTMENT
========================================================= */

export const inventoryAdjustmentSchema = z.object({
  variantId: z.string().uuid("معرف المتغير غير صالح"),

  adjustmentType: z.enum(["IN", "OUT"], {
    message: "نوع التسوية يجب أن يكون إدخال (IN) أو إخراج (OUT)",
  }),

  quantity: z
    .number({
      message: "الكمية مطلوبة",
    })
    .positive("الكمية يجب أن تكون أكبر من صفر"),

  notes: z
    .string()
    .trim()
    .min(3, "يرجى كتابة سبب التسوية")
    .max(500, "سبب التسوية طويل جدًا"),
});

/* =========================================================
   TYPES
========================================================= */

export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;

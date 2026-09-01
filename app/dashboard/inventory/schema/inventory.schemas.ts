import { z } from "zod";

export const inventoryAdjustmentSchema = z.object({
  productId: z.string().uuid("معرف المنتج غير صالح"),
  adjustmentType: z.enum(["IN", "OUT"], {
    errorMap: () => ({
      message: "نوع التسوية يجب أن يكون إدخال (IN) أو إخراج (OUT)",
    }),
  }),
  quantity: z.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  notes: z.string().min(3, "يرجى كتابة سبب التسوية (مثل: تلف، عجز جرد، إضافة)"),
});

export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;

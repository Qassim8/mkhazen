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

    /*
      عند amount = 0 لا توجد حركة مالية،
      وبالتالي لا نحتاج طريقة دفع.

      عند وجود مبلغ:
      CASH أو BANK
    */
    paymentMethod: z.enum(["CASH", "BANK"]).nullable().optional(),

    notes: z
      .string()
      .trim()
      .min(3, "يرجى كتابة سبب التسوية")
      .max(500, "سبب التسوية طويل جدًا"),
  })
  .superRefine((data, ctx) => {
    /*
      إذا كان هناك مبلغ مالي،
      يجب تحديد طريقة الدفع.
    */

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

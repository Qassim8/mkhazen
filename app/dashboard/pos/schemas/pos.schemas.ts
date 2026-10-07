import { z } from "zod";

// =========================================================
// Enums
// =========================================================

export const SalesOrderTypeEnum = z.enum(["POS", "TAILORING"]);
export type SalesOrderType = z.infer<typeof SalesOrderTypeEnum>;

export const PaymentMethodEnum = z.enum([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MIXED",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentStatusEnum = z.enum(["UNPAID", "PARTIAL", "PAID"]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const OrderStatusEnum = z.enum([
  "PENDING",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

// =========================================================
// Shared numeric helpers
// =========================================================

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value - Math.round(value * 100) / 100) < 0.000001;
}

const quantitySchema = z
  .number({ error: "الكمية مطلوبة" })
  .finite("الكمية غير صالحة")
  .positive("يجب أن تكون الكمية أكبر من صفر")
  .refine(hasAtMostTwoDecimals, "الكمية يجب ألا تتجاوز منزلتين عشريتين");

const moneySchema = (requiredMessage: string, invalidMessage: string) =>
  z
    .number({ error: requiredMessage })
    .finite(invalidMessage)
    .min(0, "القيمة لا يمكن أن تكون بالسالب")
    .refine(hasAtMostTwoDecimals, "القيمة يجب ألا تتجاوز منزلتين عشريتين");

const optionalGiftNoteSchema = z
  .string()
  .trim()
  .max(500, "ملاحظة الهدية طويلة جدًا")
  .nullable()
  .optional();

// =========================================================
// POS product search
// =========================================================

export const posProductSearchSchema = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().uuid("معرف القسم غير صالح").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PosProductSearchInput = z.infer<typeof posProductSearchSchema>;

// =========================================================
// Sales order item
// =========================================================

export const salesOrderItemSchema = z
  .object({
    templateId: z.string().uuid("معرف قالب المنتج غير صالح"),
    variantId: z.string().uuid("معرف متغير المنتج غير صالح"),
    quantity: quantitySchema,
    unitPrice: moneySchema("سعر البيع مطلوب", "سعر البيع غير صالح"),
    unitCost: moneySchema("تكلفة المنتج مطلوبة", "تكلفة المنتج غير صالحة"),
    totalPrice: moneySchema("إجمالي السطر مطلوب", "إجمالي السطر غير صالح"),
    isGift: z.boolean().default(false),
    giftNote: optionalGiftNoteSchema,
  })
  .superRefine((item, ctx) => {
    if (item.isGift) {
      if (item.unitPrice !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "سعر الهدية يجب أن يكون صفرًا",
          path: ["unitPrice"],
        });
      }

      if (item.totalPrice !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "إجمالي الهدية يجب أن يكون صفرًا",
          path: ["totalPrice"],
        });
      }

      return;
    }

    const calculatedTotal = Number(
      (item.quantity * item.unitPrice).toFixed(2),
    );

    if (Math.abs(calculatedTotal - item.totalPrice) >= 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "إجمالي المنتج غير مطابق للكمية وسعر البيع",
        path: ["totalPrice"],
      });
    }
  });
export type SalesOrderItemInput = z.infer<typeof salesOrderItemSchema>;

// =========================================================
// Customer reference
// =========================================================

export const salesCustomerReferenceSchema = z.object({
  customerId: z.string().uuid("معرف العميل غير صالح").nullable().optional(),
});
export type SalesCustomerReferenceInput = z.infer<
  typeof salesCustomerReferenceSchema
>;

// =========================================================
// Mixed payment
// =========================================================

export const paymentSplitMethodEnum = z.enum(["CASH", "CARD", "BANK_TRANSFER"]);
export type PaymentSplitMethod = z.infer<typeof paymentSplitMethodEnum>;

export const paymentSplitSchema = z.object({
  method: paymentSplitMethodEnum,
  amount: z
    .number({ error: "مبلغ الدفعة مطلوب" })
    .finite("مبلغ الدفعة غير صالح")
    .positive("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    .refine(hasAtMostTwoDecimals, "مبلغ الدفعة يجب ألا يتجاوز منزلتين عشريتين"),
  reference: z
    .string()
    .trim()
    .max(100, "رقم المرجع طويل جدًا")
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, "ملاحظات الدفعة طويلة جدًا")
    .nullable()
    .optional(),
});
export type PaymentSplit = z.infer<typeof paymentSplitSchema>;

// =========================================================
// Create sales order
// =========================================================

export const createSalesOrderSchema = z
  .object({
    orderType: SalesOrderTypeEnum.default("POS"),
    customerId: z.string().uuid("معرف العميل غير صالح").nullable().optional(),
    tailorId: z.string().uuid("معرف الخياط غير صالح").nullable().optional(),
    subtotal: moneySchema("المجموع الفرعي مطلوب", "المجموع الفرعي غير صالح"),
    discountAmount: moneySchema(
      "قيمة الخصم مطلوبة",
      "قيمة الخصم غير صالحة",
    ).default(0),
    taxAmount: moneySchema(
      "قيمة الضريبة مطلوبة",
      "قيمة الضريبة غير صالحة",
    ).default(0),
    totalAmount: z
      .number({ error: "إجمالي الفاتورة مطلوب" })
      .finite("إجمالي الفاتورة غير صالح")
      .positive("إجمالي الفاتورة يجب أن يكون أكبر من صفر")
      .refine(
        hasAtMostTwoDecimals,
        "إجمالي الفاتورة يجب ألا يتجاوز منزلتين عشريتين",
      ),
    paymentMethod: PaymentMethodEnum.default("CASH"),
    notes: z
      .string()
      .trim()
      .max(500, "الملاحظات يجب ألا تتجاوز 500 حرف")
      .nullable()
      .optional(),
    items: z
      .array(salesOrderItemSchema)
      .min(1, "يجب إضافة منتج واحد على الأقل لإتمام عملية البيع"),
    paymentSplits: z
      .array(paymentSplitSchema)
      .max(3, "لا يمكن استخدام أكثر من ثلاث طرق دفع")
      .default([]),
    /**
     * سعر الصرف اللي اتحسبت بيه المبالغ على شاشة الكاشير (ج.س لكل 1$).
     * السيرفر بيرفض العملية لو السعر اتغيّر، عشان الزبون ما يدفعش مبلغ
     * غير اللي اتعرض عليه.
     */
    exchangeRate: z
      .number({ message: "سعر الصرف مطلوب" })
      .positive("سعر الصرف غير صالح")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const calculatedSubtotal = Number(
      data.items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2),
    );

    // -------------------------------------------------------
    // Subtotal
    // -------------------------------------------------------
    if (Math.abs(calculatedSubtotal - data.subtotal) >= 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المجموع الفرعي غير مطابق لمجموع عناصر الفاتورة",
        path: ["subtotal"],
      });
    }

    // -------------------------------------------------------
    // Discount
    // Maximum discount = 50% of pre-discount subtotal.
    // -------------------------------------------------------
    if (data.discountAmount > data.subtotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "الخصم لا يمكن أن يتجاوز المجموع الفرعي",
        path: ["discountAmount"],
      });
    }

    const maxDiscount = Math.floor(data.subtotal * 0.5 * 100 + 1e-9) / 100;
    if (data.discountAmount > maxDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `الخصم لا يمكن أن يتجاوز 50% من الإجمالي قبل الخصم ` +
          `(${maxDiscount.toFixed(2)} ج.س)`,
        path: ["discountAmount"],
      });
    }

    // -------------------------------------------------------
    // Final total
    // -------------------------------------------------------
    const calculatedTotal = Number(
      (data.subtotal - data.discountAmount + data.taxAmount).toFixed(2),
    );
    if (Math.abs(calculatedTotal - data.totalAmount) >= 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "إجمالي الفاتورة غير مطابق للمجموع الفرعي والخصم والضريبة",
        path: ["totalAmount"],
      });
    }

    if (data.totalAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "إجمالي الفاتورة يجب أن يكون أكبر من صفر",
        path: ["totalAmount"],
      });
    }

    // -------------------------------------------------------
    // Order type
    // -------------------------------------------------------
    if (data.orderType === "POS" && data.tailorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "لا يمكن تحديد خياط لطلب بيع عادي",
        path: ["tailorId"],
      });
    }

    // -------------------------------------------------------
    // Payment
    // -------------------------------------------------------
    if (data.paymentMethod === "MIXED") {
      if (data.paymentSplits.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "الدفع المختلط يحتاج إلى طريقتي دفع على الأقل",
          path: ["paymentSplits"],
        });
      }

      const methods = new Set(data.paymentSplits.map((split) => split.method));
      if (methods.size !== data.paymentSplits.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "لا يجوز تكرار طريقة الدفع داخل الدفع المختلط",
          path: ["paymentSplits"],
        });
      }

      const paidAmount = Number(
        data.paymentSplits
          .reduce((sum, split) => sum + split.amount, 0)
          .toFixed(2),
      );

      if (Math.abs(paidAmount - data.totalAmount) >= 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "مجموع الدفعات المختلطة يجب أن يساوي إجمالي الفاتورة",
          path: ["paymentSplits"],
        });
      }
    } else if (data.paymentSplits.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "لا تستخدم تقسيم الدفعات مع طريقة دفع واحدة",
        path: ["paymentSplits"],
      });
    }
  });
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

// =========================================================
// Sales payment
// =========================================================

export const salesPaymentFieldsSchema = z.object({
  amount: z
    .number({ error: "مبلغ الدفعة مطلوب" })
    .finite("مبلغ الدفعة غير صالح")
    .positive("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    .refine(hasAtMostTwoDecimals, "مبلغ الدفعة يجب ألا يتجاوز منزلتين عشريتين"),
  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),
  paymentMethod: paymentSplitMethodEnum,
  reference: z
    .string()
    .trim()
    .max(100, "رقم المرجع طويل جدًا")
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, "ملاحظات الدفعة طويلة جدًا")
    .nullable()
    .optional(),
});

export const createSalesPaymentSchema = salesPaymentFieldsSchema.extend({
  salesOrderId: z.string().uuid("معرف طلب البيع غير صالح"),
});
export type CreateSalesPaymentInput = z.infer<typeof createSalesPaymentSchema>;
export type SalesPaymentFieldsInput = z.infer<typeof salesPaymentFieldsSchema>;

// =========================================================
// Receipt
// =========================================================

export const receiptResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  orderType: SalesOrderTypeEnum,
  createdAt: z.date().or(z.string()),
  completedAt: z.date().or(z.string()).nullable().optional(),
  branchName: z.string(),
  cashierName: z.string().nullable(),
  customerName: z.string().nullable(),
  subtotal: z.number(),
  discountAmount: z.number(),
  discountPercentage: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  paidAmount: z.number(),
  remainingAmount: z.number(),
  paymentMethod: PaymentMethodEnum,
  paymentStatus: PaymentStatusEnum,
  status: OrderStatusEnum,
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      productName: z.string(),
      sku: z.string().nullable(),
      colorName: z.string().nullable(),
      size: z.string().nullable(),
      quantity: z.number(),
      unitPrice: z.number(),
      totalPrice: z.number(),
      isGift: z.boolean(),
      giftNote: z.string().nullable(),
    }),
  ),
  payments: z
    .array(
      z.object({
        id: z.string().uuid(),
        amount: z.number(),
        paymentDate: z.string(),
        paymentMethod: paymentSplitMethodEnum,
        reference: z.string().nullable(),
        notes: z.string().nullable(),
        createdBy: z.string().nullable(),
        createdAt: z.string(),
      }),
    )
    .default([]),
});
export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

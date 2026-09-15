import { z } from "zod";

// ==========================================
// 1. Enums الخاصة بالمبيعات
// ==========================================

export const SalesOrderTypeEnum = z.enum(["POS", "TAILORING"]);

export type SalesOrderType = z.infer<typeof SalesOrderTypeEnum>;

export const PaymentMethodEnum = z.enum([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MIXED",
]);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentStatusEnum = z.enum([
  "UNPAID",
  "PARTIAL",
  "PAID",
  "REFUNDED",
]);

export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const OrderStatusEnum = z.enum([
  "PENDING",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;

// ==========================================
// 2. فلترة المنتجات للكاشير
// ==========================================

export const posProductSearchSchema = z.object({
  search: z.string().trim().optional(),

  categoryId: z.string().uuid("معرف القسم غير صالح").optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type PosProductSearchInput = z.infer<typeof posProductSearchSchema>;

// ==========================================
// 3. عنصر طلب البيع / السلة
// ==========================================

export const salesOrderItemSchema = z
  .object({
    templateId: z.string().uuid("معرف قالب المنتج غير صالح"),

    variantId: z.string().uuid("معرف متغير المنتج غير صالح"),

    quantity: z
      .number({
        error: "الكمية مطلوبة",
      })
      .positive("يجب أن تكون الكمية أكبر من صفر"),

    unitPrice: z
      .number({
        error: "سعر البيع مطلوب",
      })
      .min(0, "سعر البيع لا يمكن أن يكون بالسالب"),

    unitCost: z
      .number({
        error: "تكلفة المنتج مطلوبة",
      })
      .min(0, "تكلفة القطعة لا يمكن أن تكون بالسالب"),

    totalPrice: z
      .number({
        error: "إجمالي السطر مطلوب",
      })
      .min(0, "إجمالي السطر لا يمكن أن يكون بالسالب"),
  })
  .refine(
    (item) => {
      const calculatedTotal = Number(
        (item.quantity * item.unitPrice).toFixed(2),
      );

      return Math.abs(calculatedTotal - item.totalPrice) < 0.01;
    },
    {
      message: "إجمالي المنتج غير مطابق للكمية وسعر البيع",
      path: ["totalPrice"],
    },
  );

export type SalesOrderItemInput = z.infer<typeof salesOrderItemSchema>;

// ==========================================
// 4. بيانات العميل - اختيارية
// ==========================================
//
// مهمة مستقبلًا لطلبات التفصيل.
// لا يحتاجها POS العادي.

export const salesCustomerReferenceSchema = z.object({
  customerId: z.string().uuid("معرف العميل غير صالح").nullable().optional(),
});

export type SalesCustomerReferenceInput = z.infer<
  typeof salesCustomerReferenceSchema
>;

// ==========================================
// 5. إنشاء طلب بيع
// ==========================================
//
// branchId و cashierId لا يأتيان من الواجهة.
// السيرفر يحددهما من Auth / النظام.
//
// customerId اختياري لأن POS العادي لا يحتاج عميلًا.
// tailorId اختياري وسيستخدم لاحقًا مع TAILORING.

export const createSalesOrderSchema = z
  .object({
    orderType: SalesOrderTypeEnum.default("POS"),

    customerId: z.string().uuid("معرف العميل غير صالح").nullable().optional(),

    tailorId: z.string().uuid("معرف الخياط غير صالح").nullable().optional(),

    subtotal: z
      .number({
        error: "المجموع الفرعي مطلوب",
      })
      .min(0, "المجموع الفرعي لا يمكن أن يكون بالسالب"),

    // الخصم على مستوى الطلب بالكامل
    discountAmount: z
      .number({
        error: "قيمة الخصم مطلوبة",
      })
      .min(0, "قيمة الخصم لا يمكن أن تكون بالسالب")
      .default(0),

    taxAmount: z
      .number({
        error: "قيمة الضريبة مطلوبة",
      })
      .min(0, "قيمة الضريبة لا يمكن أن تكون بالسالب")
      .default(0),

    totalAmount: z
      .number({
        error: "إجمالي الفاتورة مطلوب",
      })
      .positive("إجمالي الفاتورة يجب أن يكون أكبر من صفر"),

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
      .array(
        z.object({
          method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),

          amount: z.number().positive("مبلغ الدفعة يجب أن يكون أكبر من صفر"),

          reference: z.string().trim().max(100).nullable().optional(),

          notes: z.string().trim().max(500).nullable().optional(),
        }),
      )
      .default([]),
  })
  .superRefine((data, ctx) => {
    // ----------------------------------------
    // 1. حساب Subtotal من عناصر الطلب
    // ----------------------------------------

    const calculatedSubtotal = Number(
      data.items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2),
    );

    if (data.paymentMethod === "MIXED" && data.paymentSplits.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "الدفع المختلط يحتاج إلى طريقتي دفع على الأقل",
        path: ["paymentSplits"],
      });
    }

    if (Math.abs(calculatedSubtotal - data.subtotal) >= 0.01) {
      ctx.addIssue({
        code: "custom",
        message: "المجموع الفرعي غير مطابق لمجموع عناصر الفاتورة",
        path: ["subtotal"],
      });
    }

    // ----------------------------------------
    // 2. الخصم لا يمكن أن يتجاوز Subtotal
    // ----------------------------------------

    if (data.discountAmount > data.subtotal) {
      ctx.addIssue({
        code: "custom",
        message: "الخصم لا يمكن أن يتجاوز المجموع الفرعي",
        path: ["discountAmount"],
      });
    }

    // ----------------------------------------
    // 3. حساب الإجمالي النهائي
    // ----------------------------------------

    const calculatedTotal = Number(
      (data.subtotal - data.discountAmount + data.taxAmount).toFixed(2),
    );

    if (Math.abs(calculatedTotal - data.totalAmount) >= 0.01) {
      ctx.addIssue({
        code: "custom",
        message: "إجمالي الفاتورة غير مطابق للمجموع الفرعي والخصم والضريبة",
        path: ["totalAmount"],
      });
    }

    // ----------------------------------------
    // 4. نوع الطلب
    // ----------------------------------------
    //
    // POS لا يحتاج خياطًا.
    // TAILORING يمكن أن يحتوي خياطًا وعميلًا.

    if (data.orderType === "POS" && data.tailorId) {
      ctx.addIssue({
        code: "custom",
        message: "لا يمكن تحديد خياط لطلب بيع عادي",
        path: ["tailorId"],
      });
    }
  });

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

// ==========================================
// 6. إنشاء دفعة لطلب بيع
// ==========================================
//
// نستخدمها للـ POS الآن.
// وستدعم لاحقًا:
// عربون + دفعة استلام
// أو عدة دفعات.

export const salesPaymentFieldsSchema = z.object({
  amount: z
    .number({
      error: "مبلغ الدفعة مطلوب",
    })
    .positive("مبلغ الدفعة يجب أن يكون أكبر من صفر"),

  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),

  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),

  reference: z
    .string()
    .trim()
    .max(100, "رقم المرجع طويل جدًا")
    .nullable()
    .optional(),

  notes: z
    .string()
    .trim()
    .max(500, "الملاحظات يجب ألا تتجاوز 500 حرف")
    .nullable()
    .optional(),
});

export const createSalesPaymentSchema = salesPaymentFieldsSchema.extend({
  salesOrderId: z.string().uuid("معرف طلب البيع غير صالح"),
});

export type CreateSalesPaymentInput = z.infer<typeof createSalesPaymentSchema>;

export type SalesPaymentFieldsInput = z.infer<typeof salesPaymentFieldsSchema>;

// ==========================================
// 7. استجابة الفاتورة / الإيصال
// ==========================================

export const receiptResponseSchema = z.object({
  id: z.string().uuid(),

  orderNumber: z.string(),

  orderType: SalesOrderTypeEnum,

  createdAt: z.date().or(z.string()),

  branchName: z.string(),

  cashierName: z.string().nullable(),

  customerName: z.string().nullable(),

  subtotal: z.number(),

  discountAmount: z.number(),

  taxAmount: z.number(),

  totalAmount: z.number(),

  paidAmount: z.number(),

  remainingAmount: z.number(),

  paymentMethod: PaymentMethodEnum,

  paymentStatus: PaymentStatusEnum,

  items: z.array(
    z.object({
      productName: z.string(),

      sku: z.string().nullable(),

      colorName: z.string().nullable(),

      size: z.string().nullable(),

      quantity: z.number(),

      unitPrice: z.number(),

      totalPrice: z.number(),
    }),
  ),
});

export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

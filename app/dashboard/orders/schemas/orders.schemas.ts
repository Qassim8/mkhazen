import { z } from "zod";

/* =========================================================
   ENUMS
========================================================= */

export const PurchaseOrderTypeEnum = z.enum(["DIRECT", "WORKFLOW"]);

export type PurchaseOrderType = z.infer<typeof PurchaseOrderTypeEnum>;

export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT",
  "APPROVED",
  "RECEIVED",
  "CANCELLED",
]);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

const PurchaseSortEnum = z.enum([
  "date_desc",
  "date_asc",
  "total_desc",
  "total_asc",
]);

/* =========================================================
   PAYMENT
========================================================= */

export const PaymentMethodEnum = z.enum(["CASH", "BANK"]);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentStatusEnum = z.enum(["UNPAID", "PARTIAL", "PAID"]);

export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/* =========================================================
   HELPERS
========================================================= */

const dateStringSchema = z
  .string({
    error: "التاريخ مطلوب",
  })
  .trim()
  .min(1, "التاريخ مطلوب")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة");

const nullableOptionalDateString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة")
    .nullable()
    .optional(),
);

export const nullableOptionalString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().trim().nullable().optional(),
);

const nullableOptionalUuid = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().uuid("معرف المورد غير صالح").nullable().optional(),
);

/* =========================================================
   PURCHASE ITEM
========================================================= */

export const purchaseOrderItemSchema = z.object({
  templateId: z.string().uuid("معرف المنتج الرئيسي غير صالح"),

  variantId: z.string().uuid("معرف متغير المنتج غير صالح"),

  quantity: z
    .number({
      error: "الكمية مطلوبة",
    })
    .finite("الكمية غير صالحة")
    .positive("الكمية يجب أن تكون أكبر من 0"),

  unitCost: z
    .number({
      error: "سعر الشراء مطلوب",
    })
    .finite("سعر الشراء غير صالح")
    .min(0, "سعر الوحدة يجب أن يكون 0 أو أكثر"),
});

/* =========================================================
   PAYMENT FIELDS
========================================================= */

export const purchasePaymentFields = z.object({
  amount: z
    .number({
      error: "مبلغ الدفعة مطلوب",
    })
    .finite("مبلغ الدفعة غير صالح")
    .positive("مبلغ الدفعة يجب أن يكون أكبر من صفر"),

  paymentDate: dateStringSchema,

  paymentMethod: PaymentMethodEnum,

  reference: z
    .string()
    .trim()
    .max(100, "المرجع طويل جدًا")
    .nullable()
    .optional(),

  notes: z.string().trim().nullable().optional(),
});

export const createPurchasePaymentSchema = purchasePaymentFields.extend({
  purchaseOrderId: z.string().uuid("معرف طلب الشراء غير صالح"),
});

export type CreatePurchasePaymentInput = z.input<
  typeof createPurchasePaymentSchema
>;

export type CreatePurchasePaymentOutput = z.output<
  typeof createPurchasePaymentSchema
>;

export type CreatePurchasePaymentFormInput = z.input<
  typeof purchasePaymentFields
>;

/* =========================================================
   CREATE PURCHASE ORDER
========================================================= */

export const createPurchaseOrderSchema = z
  .object({
    supplierId: nullableOptionalUuid,

    orderNumber: z.string().trim().max(50, "رقم الطلب طويل جدًا").optional(),

    purchaseType: PurchaseOrderTypeEnum.default("WORKFLOW"),

    orderDate: dateStringSchema,

    expectedDate: nullableOptionalDateString,

    notes: nullableOptionalString,

    deliveryCost: z
      .number({
        error: "تكلفة الشحن مطلوبة",
      })
      .finite("تكلفة الشحن غير صالحة")
      .min(0, "تكلفة الشحن لا يمكن أن تكون سالبة")
      .default(0),

    discountAmount: z
      .number({
        error: "مبلغ الخصم مطلوب",
      })
      .finite("مبلغ الخصم غير صالح")
      .min(0, "مبلغ الخصم لا يمكن أن يكون سالبًا")
      .default(0),

    items: z
      .array(purchaseOrderItemSchema)
      .min(1, "يرجى إضافة منتج واحد على الأقل للطلب"),
  })
  .superRefine((data, ctx) => {
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const beforeDiscount = subtotal + data.deliveryCost;

    if (data.discountAmount > beforeDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountAmount"],
        message: "مبلغ الخصم لا يمكن أن يتجاوز قيمة الطلب",
      });
    }
  });

/* =========================================================
   UPDATE PURCHASE ORDER

   Only editable fields.
   Status/payment are handled by dedicated APIs.
========================================================= */

export const updatePurchaseOrderSchema = z
  .object({
    id: z.string().uuid("معرف الطلب غير صالح"),

    supplierId: nullableOptionalUuid,

    orderDate: dateStringSchema,

    expectedDate: nullableOptionalDateString,

    notes: nullableOptionalString,

    deliveryCost: z
      .number({
        error: "تكلفة الشحن مطلوبة",
      })
      .finite("تكلفة الشحن غير صالحة")
      .min(0, "تكلفة الشحن لا يمكن أن تكون سالبة")
      .default(0),

    discountAmount: z
      .number({
        error: "مبلغ الخصم مطلوب",
      })
      .finite("مبلغ الخصم غير صالح")
      .min(0, "مبلغ الخصم لا يمكن أن يكون سالبًا")
      .default(0),

    items: z
      .array(purchaseOrderItemSchema)
      .min(1, "يرجى إضافة منتج واحد على الأقل للطلب"),
  })
  .superRefine((data, ctx) => {
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const beforeDiscount = subtotal + data.deliveryCost;

    if (data.discountAmount > beforeDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountAmount"],
        message: "مبلغ الخصم لا يمكن أن يتجاوز قيمة الطلب",
      });
    }
  });

/* =========================================================
   STATUS UPDATE

   Optional payment is only used when moving to RECEIVED.
   Normal payment API remains independent and can be used
   once the order is APPROVED or RECEIVED.
========================================================= */

export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),

  status: PurchaseOrderStatusEnum,

  payment: purchasePaymentFields.nullable().optional(),
});

/* =========================================================
   PURCHASE LIST QUERY
========================================================= */

export const purchaseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(10),

  search: z.string().trim().optional(),

  status: PurchaseOrderStatusEnum.or(z.literal("ALL")).optional(),

  purchaseType: PurchaseOrderTypeEnum.or(z.literal("ALL")).optional(),

  paymentStatus: PaymentStatusEnum.or(z.literal("ALL")).optional(),

  supplierId: z.string().uuid().optional(),

  sort: PurchaseSortEnum.default("date_desc"),
});

/* =========================================================
   INFERRED TYPES
========================================================= */

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;

export type CreatePurchaseOrderFormInput = z.input<
  typeof createPurchaseOrderSchema
>;

export type CreatePurchaseOrderInput = z.output<
  typeof createPurchaseOrderSchema
>;

export type UpdatePurchaseOrderInput = z.output<
  typeof updatePurchaseOrderSchema
>;

export type UpdatePurchaseOrderFormInput = z.input<
  typeof updatePurchaseOrderSchema
>;

export type UpdatePurchaseOrderStatusInput = z.infer<
  typeof updatePurchaseOrderStatusSchema
>;

export type PurchaseQueryInput = z.output<typeof purchaseQuerySchema>;

/* =========================================================
   RESPONSE TYPES
========================================================= */

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  templateId: string;
  variantId: string;
  productName?: string;
  sku?: string;
  colorName?: string | null;
  size?: string | null;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  allocatedDeliveryCost: number;
  effectiveUnitCost: number;
  subtotal: number;
  createdAt?: string;
}

export interface PurchaseOrderPayment {
  id: string;
  purchaseOrderId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string | null;
  supplierName?: string;
  status: PurchaseOrderStatus;
  purchaseType: PurchaseOrderType;
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  deliveryCost: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  createdBy: string | null;
  receivedBy: string | null;
  journalEntryId: string | null;
  items?: PurchaseOrderItem[];
  payments?: PurchaseOrderPayment[];
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

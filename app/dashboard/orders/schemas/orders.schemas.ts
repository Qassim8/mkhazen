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
const PurchaseSortEnum = z.enum([
  "date_desc",
  "date_asc",
  "total_desc",
  "total_asc",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

/* =========================================================
   PAYMENT METHOD
========================================================= */

export const PaymentMethodEnum = z.enum(["CASH", "BANK", "TRANSFER", "OTHER"]);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

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
    .positive("الكمية يجب أن تكون أكبر من 0"),

  unitCost: z
    .number({
      error: "سعر الشراء مطلوب",
    })
    .min(0, "سعر الوحدة يجب أن يكون 0 أو أكثر"),
});

/* =========================================================
   CREATE PURCHASE ORDER

   status is NOT accepted from the client.
   Server decides:
   DIRECT   -> RECEIVED
   WORKFLOW -> DRAFT
========================================================= */
const nullableOptionalUuid = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().uuid("معرف المورد غير صالح").nullable().optional(),
);

export const createPurchaseOrderSchema = z.object({
  supplierId: nullableOptionalUuid,

  orderNumber: z.string().trim().max(50, "رقم الطلب طويل جدًا").optional(),

  purchaseType: PurchaseOrderTypeEnum.default("WORKFLOW"),

  orderDate: z.string().min(1, "يرجى تحديد تاريخ الشراء"),

  expectedDate: z.string().nullable().optional(),

  notes: z.string().nullable().optional(),

  deliveryCost: z
    .number()
    .min(0, "تكلفة الشحن لا يمكن أن تكون سالبة")
    .default(0),

  discountAmount: z
    .number()
    .min(0, "مبلغ الخصم لا يمكن أن يكون سالبًا")
    .default(0),

  items: z
    .array(purchaseOrderItemSchema)
    .min(1, "يرجى إضافة منتج واحد على الأقل للطلب"),
});

/* =========================================================
   UPDATE PURCHASE ORDER

   Only DRAFT orders can be edited.
========================================================= */

export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .partial()
  .extend({
    id: z.string().uuid("معرف الطلب غير صالح"),
  });

/* =========================================================
   STATUS UPDATE
========================================================= */

export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),

  status: z.enum(["APPROVED", "RECEIVED", "CANCELLED"]),
});

/* =========================================================
   PAYMENT
========================================================= */

export const createPurchasePaymentSchema = z.object({
  amount: z
    .number({
      error: "مبلغ الدفعة مطلوب",
    })
    .positive("مبلغ الدفعة يجب أن يكون أكبر من 0"),

  paymentDate: z.string().min(1, "تاريخ الدفعة مطلوب").optional(),

  paymentMethod: PaymentMethodEnum.nullable().optional(),

  notes: z.string().nullable().optional(),
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

  supplierId: z.string().uuid().optional(),

  sort: PurchaseSortEnum.default("date_desc"),
});

/* =========================================================
   INFERRED TYPES
========================================================= */

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

export type CreatePurchasePaymentInput = z.output<
  typeof createPurchasePaymentSchema
>;

export type CreatePurchasePaymentFormInput = z.input<
  typeof createPurchasePaymentSchema
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

  createdAt: string;

  updatedAt: string;
}

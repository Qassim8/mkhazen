import { z } from "zod";

// ==========================================
// ENUMS & TYPES
// ==========================================

export const PurchaseOrderTypeEnum = z.enum(["DIRECT", "WORKFLOW"]);
export type PurchaseOrderType = z.infer<typeof PurchaseOrderTypeEnum>;

export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT",
  "APPROVED",
  "RECEIVED",
  "CANCELLED",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

// ==========================================
// SCHEMAS
// ==========================================

// 1. بند أمر الشراء (Item Schema)
export const purchaseOrderItemSchema = z.object({
  templateId: z.string().uuid("معرف المنتج الرئيسي غير صالح"),
  variantId: z.string().uuid("معرف متغير المنتج غير صالح"),
  quantity: z
    .number({ error: "الكمية مطلوبة" })
    .positive("الكمية يجب أن تكون أكبر من 0"),
  unitCost: z
    .number({ error: "سعر الشراء مطلوب" })
    .min(0, "سعر الوحدة يجب أن يكون 0 أو أكثر"),
});

// 2. إنشاء أمر شراء جديد (Create PO Schema)
export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid("معرف المورد غير صالح").optional().nullable(),
  orderNumber: z.string().optional(),
  purchaseType: PurchaseOrderTypeEnum.default("WORKFLOW"),
  status: PurchaseOrderStatusEnum.default("DRAFT"),
  orderDate: z.string().min(1, "يرجى تحديد تاريخ الشراء"),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  deliveryCost: z
    .number()
    .min(0, "تكلفة الشحن لا يمكن أن تكون سالبة")
    .default(0),
  discountAmount: z
    .number()
    .min(0, "مبلغ الخصم لا يمكن أن يكون سالباً")
    .default(0),
  items: z
    .array(purchaseOrderItemSchema)
    .min(1, "يرجى إضافة منتج واحد على الأقل للطلب"),
});

// 3. تعديل أمر الشراء (Update PO Schema)
export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .omit({ status: true, purchaseType: true })
  .partial()
  .extend({
    id: z.string().uuid("معرف الطلب غير صالح"),
  });

// 4. تغيير حالة أمر الشراء (Update Status Schema)
export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),
  status: z.enum(["APPROVED", "RECEIVED", "CANCELLED"]),
});

// 5. استعلام القائمة والفلترة (Query Schema)
export const purchaseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  search: z.string().optional(),
  status: PurchaseOrderStatusEnum.or(z.literal("ALL")).optional(),
  purchaseType: PurchaseOrderTypeEnum.or(z.literal("ALL")).optional(),
  supplierId: z.string().uuid().optional(),
});

// ==========================================
// INFERRED TYPES
// ==========================================

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;
export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;
export type UpdatePurchaseOrderInput = z.infer<
  typeof updatePurchaseOrderSchema
>;
export type UpdatePurchaseOrderStatusInput = z.infer<
  typeof updatePurchaseOrderStatusSchema
>;
export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;

// ==========================================
// FULL DATABASE & RESPONSE INTERFACES
// ==========================================

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  templateId: string;
  variantId: string;

  // بيانات مساعدة للعرض في الجدول
  productName?: string;
  sku?: string;
  colorName?: string | null;
  size?: string | null;

  quantity: number;
  receivedQuantity: number;
  unitCost: number; // سعر الشراء المباشر للوحدة
  allocatedDeliveryCost: number; // حصة القطعة من الشحن
  effectiveUnitCost: number; // التكلفة الكلية للوحدة الشاملة للشحن
  subtotal: number; // إجمالي البند قبل الشحن
  createdAt?: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId?: string | null;
  supplierName?: string;

  status: PurchaseOrderStatus;
  purchaseType: PurchaseOrderType;

  orderDate: string;
  expectedDate?: string | null;

  subtotal: number;
  deliveryCost: number;
  discountAmount: number;
  totalAmount: number;

  notes?: string | null;
  createdBy?: string | null;
  receivedBy?: string | null;
  journalEntryId?: string | null;

  items?: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

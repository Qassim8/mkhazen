import { z } from "zod";

// ==========================================
// 1. حالات طلب الشراء (Status Enum)
// ==========================================
export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT", // مسودة
  "APPROVED", // معتمد
  "RECEIVED", // مستلم بالكامل (مستقبلاً للمخزن)
  "CANCELLED", // ملغى
]);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

// ==========================================
// 2. سكيما بند طلب الشراء (Order Item)
// ==========================================
export const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid("يرجى اختيار منتج صالح"),
  quantity: z
    .number({ error: "أدخل كمية صالحة" })
    .int("الكمية يجب أن تكون رقماً صحيحاً")
    .min(1, "الكمية يجب أن تكون 1 على الأقل"),
  unitCost: z
    .number({ error: "أدخل سعر تكلفة صالح" })
    .min(0, "سعر التكلفة لا يمكن أن يكون بالسالب"),
  subtotal: z.number().optional(), // يتم حسابه أوتوماتيكياً: quantity * unitCost
});

// ==========================================
// 3. سكيما إنشاء طلب شراء جديد (Create Purchase Order)
// ==========================================
export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid("يرجى اختيار المورد"),
  orderNumber: z.string().optional(), // اختياري (سيتم توليده تلقائياً من السيرفر إن ترك فارغاً)
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  items: z
    .array(purchaseOrderItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل لجدول الفاتورة"),
});

// ==========================================
// 4. سكيما تعديل طلب الشراء (Update Purchase Order)
// ==========================================
export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .partial()
  .extend({
    id: z.string().uuid("معرف الطلب غير صالح"),
    status: PurchaseOrderStatusEnum.optional(),
  });

// ==========================================
// 5. سكيما تحديث الحالة فقط (Status Change)
// ==========================================
export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),
  status: PurchaseOrderStatusEnum,
});

// ==========================================
// TypeScript Types
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

// هيكل البيانات المرتجعة من قاعدة البيانات للعرض في الجداول والواجهات
export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName?: string;
  productBarcode?: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName?: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate?: string | null;
  totalAmount: number;
  notes?: string | null;
  items?: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}
// سكيما الاستعلام والفلترة لجدول طلبات الشراء
export const purchaseQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  search: z.string().optional(),
  status: PurchaseOrderStatusEnum.optional(),
  supplierId: z.string().uuid().optional(),
});

export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;

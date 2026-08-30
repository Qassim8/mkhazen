import { z } from "zod";

export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT",
  "APPROVED",
  "RECEIVED",
  "CANCELLED",
]);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, "يرجى اختيار المنتج"),
  quantity: z.number().min(1, "الكمية يجب أن تكون 1 على الأقل"),
  unitCost: z.number().min(0, "التكلفة لا يمكن أن تكون بالسالب"),
  subtotal: z.number().optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z
    .string()
    .uuid("يرجى اختيار مورد صالح")
    .or(z.literal(""))
    .nullable()
    .optional(),
  orderNumber: z.string().optional(),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z
    .array(purchaseOrderItemSchema)
    .min(1, "يجب إضافة منتج واحد على الأقل لجدول الفاتورة"),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .partial()
  .extend({
    id: z.string().uuid("معرف الطلب غير صالح"),
    status: PurchaseOrderStatusEnum.optional(),
  });

export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),
  status: PurchaseOrderStatusEnum,
});

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
  supplierId?: string | null;
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

export const purchaseQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  search: z.string().optional(),
  status: PurchaseOrderStatusEnum.optional(),
  supplierId: z.string().uuid().optional(),
});

export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;

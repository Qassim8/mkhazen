import { z } from "zod";

export const PurchaseOrderStatusEnum = z.enum([
  "DIRECT",
  "DRAFT",
  "APPROVED",
  "RECEIVED",
  "CANCELLED",
]);

export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, "يرجى تحديد المنتج"),
  quantity: z.number().min(1, "الكمية يجب أن تكون 1 على الأقل"),
  unitCost: z.number().min(0, "سعر الوحدة يجب أن يكون 0 أو أكثر"),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().optional().nullable(),
  orderNumber: z.string().optional(),
  orderDate: z.string().min(1, "يرجى تحديد تاريخ الشراء"),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "DIRECT"]).default("DRAFT"),
  deliveryCost: z
    .number()
    .min(0, "تكلفة الشحن لا يمكن أن تكون سالبة")
    .default(0),
  items: z
    .array(purchaseOrderItemSchema)
    .min(1, "يرجى إضافة منتج واحد على الأقل للطلب"),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .omit({ status: true })
  .partial()
  .extend({
    id: z.string().uuid("معرف الطلب غير صالح"),
  });

export const updatePurchaseOrderStatusSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),
  status: z.enum(["APPROVED", "RECEIVED", "CANCELLED"]),
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
  deliveryCost?: number;
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
  status: PurchaseOrderStatusEnum.or(z.literal("ALL")).optional(),
  supplierId: z.string().uuid().optional(),
});

export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;

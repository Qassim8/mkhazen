import { serverFetch } from "@/lib/api-client";

import type {
  CreateSalesOrderInput,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosProductSearchInput,
  ReceiptResponse,
} from "../schemas/pos.schemas";

// =========================================================
// API
// =========================================================

const API_BASE_URL = "/api/pos";

// =========================================================
// Product / POS Types
// =========================================================

export interface PosProductTemplate {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  sellingUnit: string | null;
  images: string[] | null;
  isActive: boolean;
}

export interface PosProductVariant {
  id: string;
  sku: string | null;
  barcode: string | null;
  packBarcode: string | null;
  colorName: string | null;
  colorCode: string | null;
  size: string | null;

  purchasePrice: number;
  sellingPrice: number;
  minSellingPrice: number;

  stockQuantity: number;

  images: string[] | null;
  isDefault: boolean;

  template: PosProductTemplate;
}

export interface PosProductsResponse {
  data: PosProductVariant[];

  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =========================================================
// Sales Order Types
// =========================================================

export interface SalesOrderItem {
  id: string;
  salesOrderId: string;

  templateId: string;
  variantId: string;

  quantity: number;

  unitPrice: number;
  unitCost: number;
  totalPrice: number;

  createdAt?: string;
}

export interface SalesOrderPayment {
  id: string;

  salesOrderId: string;

  amount: number;

  paymentDate: string;

  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER";

  reference: string | null;
  notes: string | null;

  createdBy: string | null;
  createdAt: string;

  createdByName?: string | null;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;

  orderType: "POS" | "TAILORING";

  branchId: string;

  cashierId: string | null;

  customerId: string | null;
  tailorId: string | null;

  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  paidAmount: number;
  remainingAmount: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;

  status: OrderStatus;

  notes: string | null;

  createdAt: string;
  completedAt: string | null;
  updatedAt?: string;

  items?: SalesOrderItem[];
  payments?: SalesOrderPayment[];
}

// =========================================================
// Sales List Response
// =========================================================

export interface SalesOrdersResponse {
  data: SalesOrder[];

  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =========================================================
// Checkout Response
// =========================================================

export interface SalesCheckoutResponse {
  message: string;

  orderId: string;
  orderNumber: string;

  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  paidAmount: number;

  paymentStatus: PaymentStatus;
  status: OrderStatus;

  createdAt: string;
}

// =========================================================
// Single Order Response
// =========================================================

export interface SalesOrderResponse {
  message?: string;

  orderId?: string;
  orderNumber?: string;
  createdAt?: string;

  data?: SalesOrder;
}

// =========================================================
// Receipt Response
// =========================================================

export interface InvoiceReceiptResponse {
  receipt: ReceiptResponse;
}

// =========================================================
// Sales Filters
// =========================================================

export interface GetSalesParams {
  search?: string;

  status?: OrderStatus | "ALL";

  paymentStatus?: PaymentStatus | "ALL";

  paymentMethod?: PaymentMethod | "ALL";

  fromDate?: string;

  toDate?: string;

  page?: number;

  limit?: number;
}

// =========================================================
// Cancel Order Response
// =========================================================

export interface CancelSalesOrderResponse {
  message: string;
}

// =========================================================
// 1. POS PRODUCTS
// =========================================================

export async function getPosProducts(
  params?: PosProductSearchInput,
): Promise<PosProductsResponse> {
  return serverFetch<PosProductsResponse>(`${API_BASE_URL}/products`, {
    method: "GET",

    params: {
      search: params?.search,
      categoryId: params?.categoryId,
      page: params?.page ?? 1,
      limit: params?.limit ?? 30,
    },

    next: {
      tags: ["pos-products"],
    },
  });
}

// =========================================================
// 2. SALES ORDERS LIST
// =========================================================

export async function getSalesOrders(
  params?: GetSalesParams,
): Promise<SalesOrdersResponse> {
  return serverFetch<SalesOrdersResponse>(`${API_BASE_URL}/orders`, {
    method: "GET",

    params: {
      search: params?.search,

      status:
        params?.status && params.status !== "ALL" ? params.status : undefined,

      paymentStatus:
        params?.paymentStatus && params.paymentStatus !== "ALL"
          ? params.paymentStatus
          : undefined,

      paymentMethod:
        params?.paymentMethod && params.paymentMethod !== "ALL"
          ? params.paymentMethod
          : undefined,

      fromDate: params?.fromDate,

      toDate: params?.toDate,

      page: params?.page ?? 1,

      limit: params?.limit ?? 10,
    },

    next: {
      tags: ["sales-orders-list"],
    },
  });
}

// =========================================================
// 3. CHECKOUT
// =========================================================
//
// هذه العملية هي عملية POS الكاملة.
// لا يوجد بعدها:
// - خصم مخزون
// - قيد محاسبي
// - تسجيل دفع
//
// كل ذلك يتم داخل الـ transaction في الـ API / RPC.

export async function createSalesOrder(
  payload: CreateSalesOrderInput,
): Promise<SalesCheckoutResponse> {
  return serverFetch<SalesCheckoutResponse>(`${API_BASE_URL}/checkout`, {
    method: "POST",

    body: JSON.stringify(payload),

    next: {
      tags: ["sales-orders-list"],
    },
  });
}

// =========================================================
// 4. GET SINGLE SALES ORDER / RECEIPT
// =========================================================
//
// يستخدم بعد نجاح الـ checkout للحصول على الفاتورة
// الكاملة وجميع بياناتها.

export async function getInvoiceReceipt(
  orderId: string,
): Promise<InvoiceReceiptResponse> {
  return serverFetch<InvoiceReceiptResponse>(
    `${API_BASE_URL}/invoices/${orderId}`,
    {
      method: "GET",

      next: {
        tags: ["sales-orders-list", `invoice-${orderId}`],
      },
    },
  );
}

// =========================================================
// 5. GET SINGLE SALES ORDER
// =========================================================
//
// مفيد لاحقًا لصفحة تفاصيل الفاتورة أو سجل المبيعات.

export async function getSalesOrderById(orderId: string): Promise<SalesOrder> {
  const response = await serverFetch<{
    data: SalesOrder;
  }>(`${API_BASE_URL}/orders/${orderId}`, {
    method: "GET",

    next: {
      tags: ["sales-orders-list", `sales-order-${orderId}`],
    },
  });

  if (!response?.data) {
    throw new Error("تعذر تحميل بيانات طلب البيع");
  }

  return response.data;
}

// =========================================================
// 6. CANCEL SALES ORDER
// =========================================================
//
// لا يستخدم لإرجاع البضاعة فعليًا.
// الإرجاع يجب أن يكون له workflow منفصل عندما نصل إليه.

export async function cancelSalesOrder(
  orderId: string,
  reason?: string,
): Promise<CancelSalesOrderResponse> {
  return serverFetch<CancelSalesOrderResponse>(
    `${API_BASE_URL}/orders/${orderId}/cancel`,
    {
      method: "POST",

      body: JSON.stringify({
        reason: reason?.trim() || null,
      }),

      next: {
        tags: [
          "sales-orders-list",
          `sales-order-${orderId}`,
          `invoice-${orderId}`,
        ],
      },
    },
  );
}

import { serverFetch } from "@/lib/api-client";
import type {
  CreateSalesOrderInput,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosProductSearchInput,
  ReceiptResponse,
  SalesOrderType,
} from "../schemas/pos.schemas";

const API_BASE_URL = "/api/sales";

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
  isGift: boolean;
  giftNote: string | null;
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
  orderType: SalesOrderType;
  branchId: string;
  cashierId: string | null;
  customerId: string | null;
  tailorId: string | null;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
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

export interface SalesOrdersResponse {
  data: SalesOrderListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SalesOrderListItem {
  id: string;
  orderNumber: string;
  orderType: SalesOrderType;
  customerName: string | null;
  tailorName: string | null;
  cashierName: string | null;
  totalAmount: number;
  totalAmountUsd: number | null;
  exchangeRateUsed: number | null;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface SalesOrderDetail {
  id: string;
  orderNumber: string;
  orderType: SalesOrderType;
  customer: {
    id: string;
    name: string;
    whatsappNumber: string | null;
  } | null;
  tailor: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  cashier: { id: string; name: string; email: string | null } | null;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  intakeDate: string | null;
  expectedDeliveryDate: string | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    product: {
      name: string;
      sku: string | null;
      colorName: string | null;
      size: string | null;
    };
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference: string | null;
    notes: string | null;
    createdByName: string | null;
  }>;
}

// =========================================================
// Responses
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
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
}

export interface SalesOrderResponse {
  message?: string;
  orderId?: string;
  orderNumber?: string;
  createdAt?: string;
  data?: SalesOrder;
}

export interface InvoiceReceiptResponse {
  receipt: ReceiptResponse;
}

export interface GetSalesParams {
  search?: string;
  status?: OrderStatus | "ALL";
  paymentStatus?: PaymentStatus | "ALL";
  paymentMethod?: PaymentMethod | "ALL";
  orderType?: SalesOrderType;
  fromDate?: string;
  toDate?: string;
  sort?: "date-desc" | "date-asc";
  page?: number;
  limit?: number;
}

export interface CancelSalesOrderResponse {
  message: string;
}

// =========================================================
// POS PRODUCTS
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
// SALES ORDERS LIST
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
      orderType: params?.orderType,
      fromDate: params?.fromDate,
      toDate: params?.toDate,
      sort: params?.sort,
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
    },
    next: {
      tags: ["sales-orders-list"],
    },
  });
}

// =========================================================
// CHECKOUT
// =========================================================

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
// RECEIPT
// =========================================================

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
// SINGLE SALES ORDER
// =========================================================

export async function getSalesOrderById(
  orderId: string,
): Promise<SalesOrderDetail> {
  const response = await serverFetch<{
    data: SalesOrderDetail;
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
// CANCEL SALES ORDER
// =========================================================

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

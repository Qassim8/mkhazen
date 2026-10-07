import { serverFetch } from "@/lib/api-client";

import {
  CreatePurchaseOrderInput,
  CreatePurchasePaymentInput,
  PaymentStatus,
  PurchaseOrder,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
  UpdatePurchaseOrderInput,
} from "../schemas/orders.schemas";

const API_BASE_URL = "/api/purchases";

/* =========================================================
   RESPONSE TYPES
========================================================= */

export interface PurchasesResponse {
  data: PurchaseOrder[];

  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PurchaseOrderResponse {
  message?: string;
  data: PurchaseOrder;
}

export interface PurchasePaymentResponse {
  message?: string;
  payment?: PurchaseOrderPayment;
  data?: PurchaseOrder;
  warning?: boolean;
}

export interface PurchasePaymentsResponse {
  data: PurchaseOrderPayment[];

  summary: {
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  };
}

/* =========================================================
   QUERY
========================================================= */

export interface GetPurchasesParams {
  search?: string;

  status?: PurchaseOrderStatus | "ALL";

  purchaseType?: "DIRECT" | "WORKFLOW" | "ALL";

  paymentStatus?: PaymentStatus | "ALL";

  supplierId?: string;

  sort?: "date_desc" | "date_asc" | "total_desc" | "total_asc";

  page?: number;

  limit?: number;
}

/* =========================================================
   GET ALL
========================================================= */

export async function getPurchaseOrders(
  params?: GetPurchasesParams,
): Promise<PurchasesResponse> {
  return serverFetch<PurchasesResponse>(API_BASE_URL, {
    method: "GET",

    params: {
      search: params?.search,

      status:
        params?.status && params.status !== "ALL" ? params.status : undefined,

      purchaseType:
        params?.purchaseType && params.purchaseType !== "ALL"
          ? params.purchaseType
          : undefined,

      paymentStatus:
        params?.paymentStatus && params.paymentStatus !== "ALL"
          ? params.paymentStatus
          : undefined,

      supplierId: params?.supplierId,

      sort: params?.sort,

      page: params?.page ?? 1,

      limit: params?.limit ?? 10,
    },

    next: {
      tags: ["purchases-list"],
    },
  });
}

/* =========================================================
   GET ONE
========================================================= */

export async function getPurchaseOrderById(
  id: string,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}`, {
    method: "GET",

    next: {
      tags: ["purchases-list", `purchase-${id}`],
    },
  });
}

/* =========================================================
   CREATE
========================================================= */

export async function createPurchaseOrder(
  payload: CreatePurchaseOrderInput,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(API_BASE_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   UPDATE DRAFT
========================================================= */

export async function updatePurchaseOrder(
  id: string,
  payload: UpdatePurchaseOrderInput,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* =========================================================
   DELETE
========================================================= */

export async function deletePurchaseOrder(id: string): Promise<{
  message: string;
}> {
  return serverFetch<{
    message: string;
  }>(`${API_BASE_URL}/${id}`, {
    method: "DELETE",
  });
}

/* =========================================================
   STATUS
========================================================= */

export type PurchaseOrderActionStatus =
  | "DRAFT"
  | "APPROVED"
  | "RECEIVED"
  | "CANCELLED";

export type PurchaseStatusPaymentInput = Omit<
  CreatePurchasePaymentInput,
  "purchaseOrderId"
>;

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderActionStatus,
  payment?: PurchaseStatusPaymentInput,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}/status`, {
    method: "PATCH",

    body: JSON.stringify({
      status,
      payment,
    }),
  });
}

/* =========================================================
   GET PAYMENTS
========================================================= */

export async function getPurchaseOrderPayments(
  id: string,
): Promise<PurchasePaymentsResponse> {
  return serverFetch<PurchasePaymentsResponse>(
    `${API_BASE_URL}/${id}/payments`,
    {
      method: "GET",

      next: {
        tags: [`purchase-${id}`, `purchase-payments-${id}`],
      },
    },
  );
}

/* =========================================================
   CREATE PAYMENT
========================================================= */

export async function createPurchaseOrderPayment(
  id: string,
  payload: Omit<CreatePurchasePaymentInput, "purchaseOrderId">,
): Promise<PurchasePaymentResponse> {
  return serverFetch<PurchasePaymentResponse>(
    `${API_BASE_URL}/${id}/payments`,
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  );
}

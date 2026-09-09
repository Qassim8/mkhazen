"use server";

import { serverFetch } from "@/lib/api-client";

import {
  CreatePurchaseOrderInput,
  CreatePurchasePaymentInput,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderPayment,
  UpdatePurchaseOrderInput,
} from "../schemas/orders.schemas";

/* =========================================================
   API
========================================================= */

const API_BASE_URL = "/api/purchases";

/* =========================================================
   Response Types
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
   Query
========================================================= */

export interface GetPurchasesParams {
  search?: string;

  status?: PurchaseOrderStatus | "ALL";

  purchaseType?: "DIRECT" | "WORKFLOW" | "ALL";

  supplierId?: string;

  page?: number;

  limit?: number;
}

/* =========================================================
   GET ALL PURCHASE ORDERS
========================================================= */

export async function getPurchaseOrders(
  params?: GetPurchasesParams,
): Promise<PurchasesResponse> {
  return serverFetch<PurchasesResponse>(API_BASE_URL, {
    method: "GET",

    params,

    next: {
      tags: ["purchases-list"],
    },
  });
}

/* =========================================================
   GET ONE PURCHASE ORDER
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
   CREATE PURCHASE ORDER
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
   UPDATE DRAFT PURCHASE ORDER
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
   DELETE DRAFT PURCHASE ORDER
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
   STATUS ACTIONS
========================================================= */

export type PurchaseOrderActionStatus = "APPROVED" | "RECEIVED" | "CANCELLED";

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderActionStatus,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}/status`, {
    method: "PATCH",

    body: JSON.stringify({
      status,
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
  payload: CreatePurchasePaymentInput,
): Promise<PurchasePaymentResponse> {
  return serverFetch<PurchasePaymentResponse>(
    `${API_BASE_URL}/${id}/payments`,
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  );
}

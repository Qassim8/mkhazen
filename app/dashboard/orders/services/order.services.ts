"use server";

import { serverFetch } from "@/lib/api-client";
import {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderStatus,
  UpdatePurchaseOrderInput,
} from "../schemas/orders.schemas";

// تعديل المسار ليتجه إلى API المشتريات
const API_BASE_URL = "/api/purchases";

export interface PurchasesResponse {
  data: PurchaseOrder[];
  meta: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export interface PurchaseOrderResponse {
  message?: string;
  data: PurchaseOrder;
}

export interface GetPurchasesParams {
  search?: string;
  status?: PurchaseOrderStatus | "ALL";
  supplierId?: string;
  sort?: "date_desc" | "date_asc" | "total_desc" | "total_asc";
  page?: number;
  limit?: number;
}

export async function getPurchaseOrders(
  params?: GetPurchasesParams,
): Promise<PurchasesResponse> {
  return serverFetch<PurchasesResponse>(`${API_BASE_URL}`, {
    method: "GET",
    params,
    next: { tags: ["purchases-list"] },
  });
}

export async function getPurchaseOrderById(
  id: string,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}`, {
    method: "GET",
    next: { tags: [`purchase-${id}`] },
  });
}

export async function createPurchaseOrder(
  payload: CreatePurchaseOrderInput,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePurchaseOrder(
  id: string,
  payload: Partial<UpdatePurchaseOrderInput>,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseOrder(
  id: string,
): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`${API_BASE_URL}/${id}`, {
    method: "DELETE",
  });
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`${API_BASE_URL}/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

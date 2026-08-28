"use server";

import { serverFetch } from "@/lib/api-client";
import {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderStatus,
  UpdatePurchaseOrderInput,
} from "../schemas/orders.schemas";

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
  status?: PurchaseOrderStatus;
  supplierId?: string;
  sort?: "date_desc" | "date_asc" | "total_desc" | "total_asc";
  page?: number;
  limit?: number;
}

// 1. جلب قائمة طلبات الشراء مع البحث والفلترة
export async function getPurchaseOrders(
  params?: GetPurchasesParams,
): Promise<PurchasesResponse> {
  return serverFetch<PurchasesResponse>("/api/orders", {
    method: "GET",
    params,
    next: { tags: ["purchases-list"] },
  });
}

// 2. جلب تفاصيل طلب شراء عبر الـ ID
export async function getPurchaseOrderById(
  id: string,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`/api/orders/${id}`, {
    method: "GET",
  });
}

// 3. إنشاء طلب شراء جديد
export async function createPurchaseOrder(
  payload: CreatePurchaseOrderInput,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 4. تعديل طلب الشراء أو تحديث بياناته
export async function updatePurchaseOrder(
  id: string,
  payload: Partial<UpdatePurchaseOrderInput>,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`/api/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// 5. تحديث حالة طلب الشراء فقط (DRAFT, APPROVED, CANCELLED, etc.)
export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrderResponse> {
  return serverFetch<PurchaseOrderResponse>(`/api/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// 6. حذف طلب الشراء (للمسودات فقط)
export async function deletePurchaseOrder(
  id: string,
): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`/api/orders/${id}`, {
    method: "DELETE",
  });
}

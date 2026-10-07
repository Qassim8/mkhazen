import { serverFetch } from "@/lib/api-client";
import {
  CreateSupplierFormInput,
  Supplier,
  UpdateSupplierFormInput,
} from "../schemas/supplier.schemas";

export interface SuppliersResponse {
  data: Supplier[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SupplierResponse {
  message?: string;
  data: Supplier;
}

export interface GetSuppliersParams {
  search?: string;
  status?: "active" | "inactive";
  page?: number;
  limit?: number;
}

export async function getSuppliers(
  params?: GetSuppliersParams,
): Promise<SuppliersResponse> {
  return serverFetch<SuppliersResponse>("/api/suppliers", {
    method: "GET",
    params,
    next: { tags: ["suppliers-list"] },
  });
}

/**
 * كل الموردين لقوائم الاختيار (المنتجات، طلبات الشراء).
 * getSuppliers من غير limit بيرجّع أول 10 بس، فالمورد رقم 11 ما كانش بيظهر.
 */
export async function getSupplierOptions(): Promise<SuppliersResponse> {
  const first = await getSuppliers({ page: 1, limit: 100 });
  const data = [...first.data];

  for (let page = 2; page <= (first.meta?.totalPages ?? 1); page++) {
    const next = await getSuppliers({ page, limit: 100 });
    data.push(...next.data);
  }

  return { data, meta: { ...first.meta, page: 1, limit: data.length, totalPages: 1 } };
}

export async function getSupplierById(id: string): Promise<SupplierResponse> {
  return serverFetch<SupplierResponse>(`/api/suppliers/${id}`, {
    method: "GET",
  });
}

export async function createSupplier(
  payload: CreateSupplierFormInput,
): Promise<SupplierResponse> {
  return serverFetch<SupplierResponse>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSupplier(
  id: string,
  payload: UpdateSupplierFormInput,
): Promise<SupplierResponse> {
  return serverFetch<SupplierResponse>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplier(id: string): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`/api/suppliers/${id}`, {
    method: "DELETE",
  });
}

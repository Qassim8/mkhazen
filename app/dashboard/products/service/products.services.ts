"use server";

import { serverFetch } from "@/lib/api-client";
import { Product, ProductFormInput } from "@/types/types";

export interface ProductsResponse {
  data: Product[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ProductResponse {
  message?: string;
  data: Product;
}

export interface GetProductsParams {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  page?: number;
  limit?: number;
}

export async function getProducts(
  params?: GetProductsParams,
): Promise<ProductsResponse> {
  return serverFetch<ProductsResponse>("/api/products", {
    method: "GET",
    params,
    next: { tags: ["products-list"] },
  });
}

export async function getProductById(id: string): Promise<ProductResponse> {
  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "GET",
  });
}

export async function createProduct(
  payload: ProductFormInput,
): Promise<ProductResponse> {
  return serverFetch<ProductResponse>("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProduct(
  id: string,
  payload: Partial<ProductFormInput>,
): Promise<ProductResponse> {
  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteProduct(id: string): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`/api/products/${id}`, {
    method: "DELETE",
  });
}

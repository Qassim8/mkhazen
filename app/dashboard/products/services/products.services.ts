"use server";

import { serverFetch } from "@/lib/api-client";

import {
  createProductSchema,
  updateProductSchema,
  CreateProductFormInput,
  UpdateProductFormInput,
  ProductTemplate,
} from "../schemas/product.schemas";

export interface ProductsResponse {
  data: ProductTemplate[];

  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ProductResponse {
  message?: string;
  data: ProductTemplate;
}

export interface GetProductsParams {
  search?: string;
  categoryId?: string;
  supplierId?: string;

  sortBy?: "createdAt-desc" | "createdAt-asc" | "name-asc" | "name-desc";

  status?: "instock" | "outstock" | "lowstock";

  page?: number;
  limit?: number;
}

export async function getProducts(
  params?: GetProductsParams,
): Promise<ProductsResponse> {
  const queryParams: Record<string, string | number> = {};

  if (params?.search) {
    queryParams.search = params.search;
  }

  if (params?.categoryId) {
    queryParams.categoryId = params.categoryId;
  }

  if (params?.supplierId) {
    queryParams.supplierId = params.supplierId;
  }

  if (params?.sortBy) {
    queryParams.sortBy = params.sortBy;
  }

  if (params?.status) {
    queryParams.status = params.status;
  }

  if (params?.page) {
    queryParams.page = params.page;
  }

  if (params?.limit) {
    queryParams.limit = params.limit;
  }

  return serverFetch<ProductsResponse>("/api/products", {
    method: "GET",
    params: queryParams,
    withAuth: false,
    next: {
      tags: ["products-list"],
    },
  });
}

export async function getProductById(id: string): Promise<ProductResponse> {
  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "GET",
    withAuth: false,
  });
}

export async function createProduct(
  payload: CreateProductFormInput,
): Promise<ProductResponse> {
  const parsedPayload = createProductSchema.parse(payload);

  return serverFetch<ProductResponse>("/api/products", {
    method: "POST",
    body: JSON.stringify(parsedPayload),
  });
}

export async function updateProduct(
  id: string,
  payload: UpdateProductFormInput,
): Promise<ProductResponse> {
  const parsedPayload = updateProductSchema.parse(payload);

  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(parsedPayload),
  });
}

export async function deleteProduct(id: string): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`/api/products/${id}`, {
    method: "DELETE",
  });
}

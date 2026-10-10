// (كان "use server": الدوال كانت Server Actions عامة ورسائل أخطائها بتختفي في الإنتاج)
import { serverFetch } from "@/lib/api-client";

import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type Product,
  type UpdateProductInput,
} from "../schemas/product.schemas";

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
    next: {
      tags: ["products-list"],
    },
  });
}

/**
 * كل المنتجات لقوائم الاختيار (طلبات الشراء).
 * الـ API أقصى حد للصفحة 100، فبنلف على الصفحات لحد ما نجيب الكل.
 */
export async function getProductOptions(): Promise<ProductsResponse> {
  const first = await getProducts({ page: 1, limit: 100 });
  const data = [...first.data];

  for (let page = 2; page <= (first.meta?.totalPages ?? 1); page++) {
    const next = await getProducts({ page, limit: 100 });
    data.push(...next.data);
  }

  return { ...first, data, meta: { ...first.meta, page: 1, limit: data.length, totalPages: 1 } };
}

export async function getProductById(id: string): Promise<ProductResponse> {
  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "GET",
  });
}

export async function createProduct(
  payload: CreateProductInput,
): Promise<ProductResponse> {
  const parsedPayload = createProductSchema.parse(payload);

  return serverFetch<ProductResponse>("/api/products", {
    method: "POST",
    body: JSON.stringify(parsedPayload),
  });
}

export async function updateProduct(
  id: string,
  payload: UpdateProductInput,
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

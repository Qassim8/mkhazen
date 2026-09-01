"use server";

import { serverFetch } from "@/lib/api-client";
import {
  createProductSchema,
  updateProductSchema,
  CreateProductFormInput,
  UpdateProductFormInput,
  ProductTemplate,
} from "../schemas/product.schemas";

// استجابة قائمة المنتجات (Product Templates مع متغيراتها)
export interface ProductsResponse {
  data: ProductTemplate[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// استجابة منتج فردي
export interface ProductResponse {
  message?: string;
  data: ProductTemplate;
}

// معاملات البحث والفلترة
export interface GetProductsParams {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  sortBy?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * تحويل القيم الفارغة "" داخل الكائن إلى null لتجنب مشاكل Validation السيرفر
 */
function sanitizeEmptyStrings<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  Object.keys(sanitized).forEach((key) => {
    const k = key as keyof typeof sanitized;
    if (sanitized[k] === "") {
      (sanitized as any)[k] = null;
    } else if (typeof sanitized[k] === "object" && sanitized[k] !== null) {
      sanitized[k] = sanitizeEmptyStrings(sanitized[k]);
    }
  });

  return sanitized as T;
}

/**
 * 1. جلب قائمة المنتجات مع الفلترة والصفحات
 */
export async function getProducts(
  params?: GetProductsParams,
): Promise<ProductsResponse> {
  const queryParams: Record<string, string | number> = {};

  if (params?.search) queryParams.search = params.search;
  if (params?.categoryId) queryParams.categoryId = params.categoryId;
  if (params?.supplierId) queryParams.supplierId = params.supplierId;
  if (params?.sortBy) queryParams.sortBy = params.sortBy;
  if (params?.status) queryParams.status = params.status;
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;

  return serverFetch<ProductsResponse>("/api/products", {
    method: "GET",
    params: queryParams,
    next: { tags: ["products-list"] },
  });
}

/**
 * 2. جلب تفاصيل منتج معين بالـ ID
 */
export async function getProductById(id: string): Promise<ProductResponse> {
  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "GET",
  });
}

/**
 * 3. إنشاء منتج جديد مع متغيراته
 */
export async function createProduct(
  payload: CreateProductFormInput,
): Promise<ProductResponse> {
  // 1. تنظيف المدخلات النصية الفارغة إلى null
  const cleanedPayload = sanitizeEmptyStrings(payload);

  // 2. التحقق والتحويل بواسطة Zod
  const parsedPayload = createProductSchema.parse(cleanedPayload);

  return serverFetch<ProductResponse>("/api/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedPayload),
  });
}

/**
 * 4. تعديل منتج قائم مع متغيراته
 */
export async function updateProduct(
  id: string,
  payload: UpdateProductFormInput,
): Promise<ProductResponse> {
  // 1. تنظيف المدخلات النصية الفارغة إلى null
  const cleanedPayload = sanitizeEmptyStrings(payload);

  // 2. التحقق والتحويل بواسطة Zod
  const parsedPayload = updateProductSchema.parse(cleanedPayload);

  return serverFetch<ProductResponse>(`/api/products/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedPayload),
  });
}

/**
 * 5. حذف منتج ومتغيراته التابعة
 */
export async function deleteProduct(id: string): Promise<{ message: string }> {
  return serverFetch<{ message: string }>(`/api/products/${id}`, {
    method: "DELETE",
  });
}

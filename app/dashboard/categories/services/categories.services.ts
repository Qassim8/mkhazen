import { serverFetch } from "@/lib/api-client";
import { Category } from "../schemas/category.schemas";

export interface CategoriesResponse {
  message?: string;
  data: Category[];
}

export async function getCategories(): Promise<CategoriesResponse> {
  return serverFetch<CategoriesResponse>(`/api/categories`, {
    method: "GET",
    next: { tags: ["categories-list"] },
  });
}

export async function createCategory(data: {
  name: string;
  description?: string;
  imageUrl?: string;
}) {
  return serverFetch<{ message: string; data: Category }>("/api/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCategory(
  id: string,
  data: Partial<{ name: string; description?: string; imageUrl?: string }>,
) {
  return serverFetch<{ message: string; data: Category }>(
    `/api/categories/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteCategory(id: string) {
  return serverFetch<{ message: string }>(`/api/categories/${id}`, {
    method: "DELETE",
  });
}

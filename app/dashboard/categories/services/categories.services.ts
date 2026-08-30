import { serverFetch } from "@/lib/api-client";
import { BASE_URL } from "@/lib/constants";
import { Category } from "../schemas/category.schemas";

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE_URL}/api/categories`, {
    next: { tags: ["categories-list"] },
  });
  const json = await res.json();
  return json.data;
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

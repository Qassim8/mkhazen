import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "اسم الفئة يجب أن يكون حرفين على الأقل"),

  description: z.string().trim().nullable().optional(),

  imageUrl: z.string().url().nullable().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  productsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
export type CreateCategoryInput = Omit<
  Category,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

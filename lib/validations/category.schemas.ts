import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(2, "اسم الفئة يجب أن يكون حرفين على الأقل"),
  description: z.string().optional().nullable(),
  imageUrl: z.string().nullable().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

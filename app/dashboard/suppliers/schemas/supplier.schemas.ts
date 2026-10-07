import { z } from "zod";

const nullableOptionalEmail = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z
    .string()
    .trim()
    .email("يرجى إدخال بريد إلكتروني صحيح")
    .nullable()
    .optional(),
);
const nullableOptionalString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().trim().nullable().optional(),
);

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, "اسم المورد مطلوب (حرفين على الأقل)"),

  phone: z.string().trim().min(4, "يرجى إدخال رقم هاتف صحيح"),

  email: nullableOptionalEmail,

  address: nullableOptionalString,

  contactPerson: nullableOptionalString,

  notes: nullableOptionalString,

  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierFormInput = z.input<typeof createSupplierSchema>;
export type CreateSupplierFormOutput = z.output<typeof createSupplierSchema>;

export type UpdateSupplierFormInput = z.input<typeof updateSupplierSchema>;
export type UpdateSupplierFormOutput = z.output<typeof updateSupplierSchema>;

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

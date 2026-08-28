import { z } from "zod";

// ==========================================
// Helper Standard Preprocess Rules
// ==========================================
const stringOptional = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : val),
  z.string().nullable().optional(),
);

// ==========================================
// Supplier Interface
// ==========================================
export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string | null;
  contactPerson?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Create Supplier Schema
// ==========================================
export const createSupplierSchema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب (حرفين على الأقل)"),
  email: z.string().email("يرجى إدخال بريد إلكتروني صحيح"),
  phone: z.string().min(6, "يرجى إدخال رقم هاتف صحيح"),
  address: stringOptional,
  contactPerson: stringOptional,
  isActive: z.boolean().default(true),
});

export type CreateSupplierFormInput = z.input<typeof createSupplierSchema>;
export type CreateSupplierFormOutput = z.output<typeof createSupplierSchema>;

// ==========================================
// Update Supplier Schema
// ==========================================
export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierFormInput = z.input<typeof updateSupplierSchema>;
export type UpdateSupplierFormOutput = z.output<typeof updateSupplierSchema>;

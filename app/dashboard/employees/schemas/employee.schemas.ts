import { z } from "zod";

export const employeeQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional().default(""),
  position: z.enum(["system_manager", "cashier", "tailor"]).optional(),
  shift: z.enum(["morning", "night", "full_time"]).optional(),
  isActive: z.enum(["TRUE", "FALSE"]).optional(),
  resetRequested: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});

export const baseEmployeeSchema = z.object({
  name: z.string().min(3, "الاسم يجب أن يكون 3 حروف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  phone: z
    .string()
    .min(9, "رقم الهاتف يجب ان يكون 9 ارقام على الاقل")
    .regex(/^[0-9+ ]+$/, "رقم الهاتف يجب أن يحتوي على أرقام فقط"),

  position: z.enum(["system_manager", "cashier", "tailor"], {
    message: "يرجى اختيار وظيفة صالحة",
  }),

  shift: z.enum(["morning", "night", "full_time"], {
    message: "يرجى اختيار نوع الدوام",
  }),

  salary: z.preprocess(
    (val) => (val === "" || Number.isNaN(val) ? undefined : Number(val)),
    z.number({ message: "يرجى إدخال مبلغ صحيح" }).optional(),
  ),

  // غير مستخدم في الواجهة (أجرة الخياط تُحدد في كل طلب)؛ اختياري للتوافق فقط
  commissionRate: z.preprocess(
    (val) => (val === "" || Number.isNaN(val) ? undefined : Number(val)),
    z.number({ message: "يرجى إدخال نسبة مئوية صحيحة" }).optional(),
  ),

  isActive: z.union([z.boolean(), z.string()]).optional(),

  /** السماح بتسجيل الدخول (منفصل عن النشاط) */
  canLogin: z.union([z.boolean(), z.string()]).optional(),
});

/**
 * إخفاء مفتاح "السماح بالدخول" للخياطين.
 * لإظهاره لهم: خليه false.
 */
export const HIDE_LOGIN_TOGGLE_FOR_TAILORS = true;

// مخطط الإنشاء
export const createEmployeeSchema = baseEmployeeSchema;

// مخطط التحديث
export const updateEmployeeSchema = baseEmployeeSchema.partial();

export type EmployeeQueryParams = z.infer<typeof employeeQuerySchema>;
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;

export type Employee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  position: "system_manager" | "tailor" | "cashier";
  salary: number;
  commissionRate?: number;
  address?: string;
  shift: "morning" | "night" | "full_time";
  role: "owner" | "admin" | "tailor" | "cashier";
  status: "active" | "inactive";
  isActive: "TRUE" | "FALSE" | boolean;
  canLogin?: boolean;
  resetRequested: boolean;
};

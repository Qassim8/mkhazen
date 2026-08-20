import { z } from "zod";

export const employeeQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional().default(""),
  position: z.enum(["system_manager", "cashier", "tailor"]).optional(),
  shift: z.enum(["morning", "evening", "full_time"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const baseEmployeeSchema = z.object({
  name: z.string().min(3, "الاسم يجب أن يكون 3 حروف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  phone: z
    .string()
    .min(9, "رقم الهاتف غير مكتمل")
    .regex(/^[0-9+ ]+$/, "رقم الهاتف يجب أن يحتوي على أرقام فقط"),

  position: z.enum(["system_manager", "cashier", "tailor"], {
    invalid_type_error: "يرجى اختيار وظيفة صالحة",
  }),

  shift: z.enum(["morning", "evening", "full_time"], {
    invalid_type_error: "يرجى اختيار فترة العمل",
  }),

  salary: z.coerce.number().min(0).default(0),

  commissionRate: z.coerce
    .number()
    .min(0, "النسبة لا يمكن أن تكون أقل من 0")
    .max(100, "النسبة لا يمكن أن تتجاوز 100")
    .default(50),

  status: z.enum(["active", "inactive"]).default("active"),
});

// 2. مخطط الإنشاء مع التحقق الخاص (Refined Schema)
export const createEmployeeSchema = baseEmployeeSchema.superRefine(
  (data, ctx) => {
    if (
      data.position !== "tailor" &&
      data.commissionRate &&
      data.commissionRate > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "العمولة مخصصة فقط للترزية (الخياطين)",
        path: ["commissionRate"],
      });
    }
  },
);

// 3. مخطط التحديث (Partial) مأخوذ من Base مباشرة
export const updateEmployeeSchema = baseEmployeeSchema.partial();

export type EmployeeQueryParams = z.infer<typeof employeeQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

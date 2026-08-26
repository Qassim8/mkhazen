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

  commissionRate: z.preprocess(
    (val) => (val === "" || Number.isNaN(val) ? undefined : Number(val)),
    z.number({ message: "يرجى إدخال نسبة مئوية صحيحة" }).optional(),
  ),

  isActive: z.union([z.boolean(), z.string()]).optional(),
});

// مخطط الإنشاء مع التحقق
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

// مخطط التحديث
export const updateEmployeeSchema = baseEmployeeSchema.partial();

export type EmployeeQueryParams = z.infer<typeof employeeQuerySchema>;
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;

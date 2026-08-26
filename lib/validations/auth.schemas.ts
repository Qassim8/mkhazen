import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(8, { message: "البريد الإلكتروني مطلوب" })
    .email({ message: "يرجى إدخال بريد إلكتروني صحيح" }),
  password: z
    .string()
    .min(6, { message: "كلمة المرور يجب أن لا تقل عن 6 أحرف" }),
});

export const updateProfileSchema = z.object({
  name: z.string().min(3, { message: "الاسم من 4 احرف على الاقل" }),
  email: z.string().email({ message: "يرجى إدخال بريد إلكتروني صالح" }),
  phone: z.string().min(9, { message: "الهاتف يكون 9 ارقام على الاقل" }),
});

export const updatePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: "كلمة المرور الحالية مطلوبة" }),
    newPassword: z
      .string()
      .min(6, { message: "كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف" }),
    confirmPassword: z
      .string()
      .min(1, { message: "يرجى تأكيد كلمة المرور الجديدة" }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "كلمة المرور الجديدة وتأكيدها غير متطابقين",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية",
    path: ["newPassword"],
  });

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .min(1, { message: "يرجى إدخال البريد الإلكتروني أو اسم الموظف" }),
});

export const adminResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, { message: "كلمة المرور يجب أن لا تقل عن 6 أحرف" }),
    confirmPassword: z
      .string()
      .min(1, { message: "يرجى تأكيد كلمة المرور الجديدة" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمات المرور غير متطابقة",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

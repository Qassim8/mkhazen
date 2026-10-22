import { z } from "zod";

/**
 * البيع بالتقسيط — مخططات تحصيل الدفعات وتعديل المتبقي وإغلاق الدين.
 * المبالغ كلها بالجنيه (الدين بالجنيه فقط).
 */

const sdgAmount = (label: string) =>
  z
    .number({ error: `${label} مطلوب` })
    .finite(`${label} غير صالح`)
    .positive(`${label} يجب أن يكون أكبر من صفر`)
    .max(1_000_000_000, `${label} كبير جدًا`)
    .refine((value) => Number(value.toFixed(2)) === value, `${label} يجب ألا يتجاوز منزلتين عشريتين`);

export const creditPaymentSchema = z.object({
  amount: sdgAmount("مبلغ الدفعة"),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER"], { message: "طريقة الدفع غير صالحة" }),
  notes: z.string().trim().max(500, "الملاحظات طويلة جدًا").nullable().optional(),
});
export type CreditPaymentInput = z.infer<typeof creditPaymentSchema>;

export const creditAdjustSchema = z.object({
  newRemaining: sdgAmount("المتبقي الجديد"),
  reason: z.string().trim().min(3, "سبب التعديل مطلوب").max(500, "سبب التعديل طويل جدًا"),
});
export type CreditAdjustInput = z.infer<typeof creditAdjustSchema>;

export const closeCreditSchema = z.object({
  notes: z.string().trim().max(500, "الملاحظات طويلة جدًا").nullable().optional(),
});
export type CloseCreditInput = z.infer<typeof closeCreditSchema>;

export const receivablesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100, "نص البحث طويل جدًا").optional(),
  overdue: z.enum(["true", "false"]).optional(),
});
export type ReceivablesQueryInput = z.infer<typeof receivablesQuerySchema>;

import { z } from "zod";

export const createExchangeRateSchema = z.object({
  rate: z.coerce
    .number({ message: "سعر الصرف مطلوب" })
    .positive("سعر الصرف يجب أن يكون أكبر من صفر")
    .max(10_000_000, "سعر الصرف كبير جدًا، تأكد من القيمة"),

  notes: z
    .string()
    .trim()
    .max(300, "الملاحظات طويلة جدًا")
    .nullable()
    .optional(),
});

export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;

export const exchangeRatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExchangeRatesQueryInput = z.infer<typeof exchangeRatesQuerySchema>;

export interface ExchangeRate {
  id: string;
  rate: number;
  effectiveAt: string;
  notes: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CurrentExchangeRate {
  rate: number | null;
  effectiveAt: string | null;
  notes: string | null;
}

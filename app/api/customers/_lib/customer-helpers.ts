import { z } from "zod";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { cleanCustomerPhone, isValidCustomerPhone, normalizeCustomerPhone } from "@/lib/customer-phone";
import { supabaseAdmin } from "@/lib/supabase";

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "اسم العميل مطلوب").max(255, "اسم العميل طويل جدًا"),
  whatsappNumber: z
    .string()
    .trim()
    .refine(isValidCustomerPhone, "رقم الهاتف غير صالح (8 إلى 15 رقمًا)"),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جدًا").nullable().optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export interface DuplicateCustomer {
  id: string;
  name: string;
  whatsapp_number: string;
}

/** عملاء آخرون بنفس الرقم الموحَّد (تنبيه فقط، لا يمنع الحفظ) */
export async function findPhoneDuplicates(
  whatsappNumber: string,
  excludeId?: string,
): Promise<DuplicateCustomer[]> {
  const normalized = normalizeCustomerPhone(whatsappNumber);
  if (!normalized) return [];

  let query = supabaseAdmin
    .from("customers")
    .select("id, name, whatsapp_number")
    .eq("branch_id", MAIN_BRANCH_ID)
    .eq("phone_normalized", normalized)
    .order("created_at", { ascending: true })
    .limit(10);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw new Error(`تعذر فحص تكرار الهاتف: ${error.message}`);
  return (data ?? []) as DuplicateCustomer[];
}

/** العميل الذي يحمل نفس الرقم بالضبط (يمنعه القيد UNIQUE في قاعدة البيانات) */
export async function findExactPhoneOwner(whatsappNumber: string): Promise<DuplicateCustomer | null> {
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id, name, whatsapp_number")
    .eq("branch_id", MAIN_BRANCH_ID)
    .eq("whatsapp_number", cleanCustomerPhone(whatsappNumber))
    .maybeSingle();

  return (data as DuplicateCustomer | null) ?? null;
}

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * عميل البيع بالتقسيط: الدين مربوط بعميل دائمًا (customer_id إلزامي في complete_sales_checkout).
 *
 * • customerId موجود → نقرأ بياناته؛ والاسم/الهاتف على الفاتورة نسخة منه.
 * • غير ذلك → resolve_customer_by_phone: يُربط بعميل بنفس الرقم (phone_normalized) وإلا يُنشأ.
 */
export type CreditCustomerResult =
  | { ok: true; customerId: string; name: string; phone: string; created: boolean }
  | { ok: false; kind: "NOT_FOUND" }
  | { ok: false; kind: "DB"; error: unknown };

export async function resolveCreditCustomer(input: {
  customerId?: string | null;
  name?: string | null;
  phone?: string | null;
}): Promise<CreditCustomerResult> {
  if (input.customerId) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, whatsapp_number")
      .eq("id", input.customerId)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (error) return { ok: false, kind: "DB", error };
    if (!data) return { ok: false, kind: "NOT_FOUND" };

    return { ok: true, customerId: data.id, name: data.name, phone: data.whatsapp_number, created: false };
  }

  const { data, error } = await supabaseAdmin.rpc("resolve_customer_by_phone", {
    p_branch_id: MAIN_BRANCH_ID,
    p_name: input.name ?? null,
    p_phone: input.phone ?? null,
  });

  if (error) return { ok: false, kind: "DB", error };

  const resolved = data as { customer_id: string; name: string; whatsapp_number: string; created: boolean };
  return {
    ok: true,
    customerId: resolved.customer_id,
    name: resolved.name,
    phone: resolved.whatsapp_number,
    created: resolved.created === true,
  };
}

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * عميل طلب التفصيل (الاسم والهاتف مكتوبان في النموذج، مع اقتراحات اختيارية):
 * resolve_customer_by_phone يربط بعميل نفس الرقم الموحَّد (phone_normalized) ولا يستبدل اسمه
 * (يملؤه فقط لو كان فارغًا)، وإلا ينشئ عميلًا جديدًا. بعدها نمرّر لـ create/update_tailoring_order
 * اسم ورقم العميل المحفوظين، فيصيب upsert الدالة نفس الصف ولا يتكرر العميل.
 */
export type TailoringCustomerResult =
  | { ok: true; name: string; whatsapp: string }
  | { ok: false; error: unknown };

export async function resolveTailoringCustomer(input: {
  name: string | null;
  whatsapp: string | null;
}): Promise<TailoringCustomerResult> {
  const { data, error } = await supabaseAdmin.rpc("resolve_customer_by_phone", {
    p_branch_id: MAIN_BRANCH_ID,
    p_name: input.name,
    p_phone: input.whatsapp,
  });

  if (error) return { ok: false, error };

  const resolved = data as { name: string; whatsapp_number: string };
  return { ok: true, name: resolved.name, whatsapp: resolved.whatsapp_number };
}

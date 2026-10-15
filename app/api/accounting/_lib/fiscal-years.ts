import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

const SUDAN_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Khartoum

function sudanYear(date: Date) {
  return new Date(date.getTime() + SUDAN_OFFSET_MS).getUTCFullYear();
}

/** السنوات المالية: من أول سنة فيها قيد حتى السنة الحالية (الأحدث أولًا) */
export async function getFiscalYears(): Promise<number[]> {
  const currentYear = sudanYear(new Date());

  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .select("created_at")
    .eq("branch_id", MAIN_BRANCH_ID)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ created_at: string }>();

  if (error) throw new Error(`تعذر جلب السنوات المالية: ${error.message}`);

  const firstYear = data?.created_at ? Math.min(sudanYear(new Date(data.created_at)), currentYear) : currentYear;
  return Array.from({ length: currentYear - firstYear + 1 }, (_, index) => currentYear - index);
}

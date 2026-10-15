/** الرواتب والسلف — قراءة ملخص الشهر (موظفين بالراتب + خياطين) */
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

export interface PayrollEmployeeRow {
  userId: string;
  name: string;
  role: string;
  position: string | null;
  isActive: boolean;
  salarySdg: number;
  advancesSdg: number;
  salaryPaidSdg: number;
  takenSdg: number;
  remainingSdg: number;
}

export interface PayrollTailorRow {
  tailorId: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  monthDuesSdg: number;
  monthAdvancesSdg: number;
  monthPaidSdg: number;
  monthTakenSdg: number;
  remainingSdg: number;
}

export interface PayrollMonth {
  period: string;
  employees: PayrollEmployeeRow[];
  tailors: PayrollTailorRow[];
}

const SUDAN_OFFSET_MS = 2 * 60 * 60 * 1000;

/** أول يوم في الشهر (YYYY-MM-01)؛ الافتراضي الشهر الحالي بتوقيت السودان */
export function normalizePeriod(value: string | null | undefined) {
  if (value && /^\d{4}-\d{2}(-\d{2})?$/.test(value)) return `${value.slice(0, 7)}-01`;
  return `${new Date(Date.now() + SUDAN_OFFSET_MS).toISOString().slice(0, 7)}-01`;
}

const n = (value: unknown) => Number(value ?? 0) || 0;

export async function loadPayrollMonth(period: string): Promise<PayrollMonth> {
  const [employees, tailors] = await Promise.all([
    supabaseAdmin.rpc("get_payroll", { p_branch_id: MAIN_BRANCH_ID, p_period: period }),
    supabaseAdmin.rpc("get_tailor_month_summary", { p_branch_id: MAIN_BRANCH_ID, p_period: period }),
  ]);

  if (employees.error) throw new Error(`تعذر جلب الرواتب: ${employees.error.message}`);
  if (tailors.error) throw new Error(`تعذر جلب مستحقات الخياطين: ${tailors.error.message}`);

  return {
    period,
    employees: ((employees.data ?? []) as Record<string, unknown>[]).map((row) => ({
      userId: String(row.user_id),
      name: String(row.name ?? ""),
      role: String(row.role ?? ""),
      position: row.position != null ? String(row.position) : null,
      isActive: row.is_active !== false,
      salarySdg: n(row.salary_sdg),
      advancesSdg: n(row.advances_sdg),
      salaryPaidSdg: n(row.salary_paid_sdg),
      takenSdg: n(row.taken_sdg),
      remainingSdg: n(row.remaining_sdg),
    })),
    tailors: ((tailors.data ?? []) as Record<string, unknown>[]).map((row) => ({
      tailorId: String(row.tailor_id),
      name: String(row.tailor_name ?? ""),
      phone: row.tailor_phone != null ? String(row.tailor_phone) : null,
      isActive: row.is_active !== false,
      monthDuesSdg: n(row.month_dues_sdg),
      monthAdvancesSdg: n(row.month_advances_sdg),
      monthPaidSdg: n(row.month_paid_sdg),
      monthTakenSdg: n(row.month_taken_sdg),
      remainingSdg: n(row.remaining_sdg),
    })),
  };
}

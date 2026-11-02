/** الرواتب والسلف — قراءة ملخص الشهر (موظفين بالراتب + خياطين) */
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

export interface PayrollEmployeeRow {
  userId: string;
  name: string;
  role: string;
  position: string | null;
  isActive: boolean;
  /** الراتب المسجل (اقتراح فقط؛ اختياري) */
  salarySdg: number;
  /** رصيد السلف = السلف − المسترد − المخصوم من الرواتب */
  advanceBalanceSdg: number;
  /** حركات الشهر المختار */
  advancesMonthSdg: number;
  returnedMonthSdg: number;
  deductedMonthSdg: number;
  salaryPaidSdg: number;
  commissionPaidSdg: number;
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
  /** المتبقي من المستحقات */
  remainingSdg: number;
  /** رصيد السلف العام (السلف − المسترد نقدًا − المخصوم من المستحقات) */
  advanceBalanceSdg: number;
  /** سلف قديمة مربوطة بطلبات لم تُسلَّم (تُخصم تلقائيًا من أجرة طلبها عند التسليم كما كانت) */
  orderAdvancesSdg: number;
  advancesMonthSdg: number;
  returnedMonthSdg: number;
  deductedMonthSdg: number;
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

/** حركة مالية لموظف (سلفة / استرداد / راتب / عمولة) مع أرقام القيود للروابط */
export interface EmployeeMovement {
  id: string;
  type: "ADVANCE" | "ADVANCE_RETURN" | "SALARY" | "COMMISSION";
  period: string;
  amount: number;
  /** المخصوم من رصيد السلف (للراتب) */
  deductedAmount: number;
  paymentMethod: "CASH" | "BANK";
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  /** سلفة سُجّلت قبل نظام السلف المرن (مصروف رواتب ولا تدخل في الرصيد) */
  isLegacy: boolean;
  entryNumber: string | null;
  deductionEntryNumber: string | null;
  fxEntryNumber: string | null;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  role: string;
  position: string | null;
  phone: string | null;
  isActive: boolean;
  /** الراتب المسجل (اقتراح فقط) */
  salarySdg: number;
}

export async function loadEmployeeProfile(employeeId: string): Promise<EmployeeProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select('id, name, role, position, phone, salary, "isActive"')
    .eq("id", employeeId)
    .eq("branchId", MAIN_BRANCH_ID)
    .maybeSingle();

  if (error) throw new Error(`تعذر جلب الموظف: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id as string,
    name: String(data.name ?? ""),
    role: String(data.role ?? "").toLowerCase(),
    position: data.position != null ? String(data.position) : null,
    phone: data.phone != null ? String(data.phone) : null,
    isActive: data.isActive !== false,
    salarySdg: n(data.salary),
  };
}

/** سجل كامل بحركات الموظف (الأحدث أولًا) */
export async function loadEmployeeMovements(employeeId: string, limit = 500): Promise<EmployeeMovement[]> {
  const { data, error } = await supabaseAdmin
    .from("employee_payments")
    .select(
      "id, type, period, amount, deducted_amount, payment_method, notes, created_at, is_legacy, journal_entry_id, deduction_entry_id, fx_entry_id, creator:users!created_by ( name )",
    )
    .eq("user_id", employeeId)
    .eq("branch_id", MAIN_BRANCH_ID)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`تعذر جلب حركات الموظف: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const entryIds = rows
    .flatMap((row) => [row.journal_entry_id, row.deduction_entry_id, row.fx_entry_id])
    .filter((value): value is string => typeof value === "string");

  const numbers = new Map<string, string>();
  if (entryIds.length > 0) {
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from("journal_entries")
      .select("id, entry_number")
      .in("id", [...new Set(entryIds)]);

    if (entriesError) throw new Error(`تعذر جلب قيود الموظف: ${entriesError.message}`);
    for (const entry of entries ?? []) numbers.set(entry.id as string, entry.entry_number as string);
  }

  const numberOf = (id: unknown) => (typeof id === "string" ? (numbers.get(id) ?? null) : null);

  return rows.map((row) => {
    const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
    return {
      id: String(row.id),
      type: row.type as EmployeeMovement["type"],
      period: String(row.period),
      amount: n(row.amount),
      deductedAmount: n(row.deducted_amount),
      paymentMethod: row.payment_method === "BANK" ? "BANK" : "CASH",
      notes: row.notes != null ? String(row.notes) : null,
      createdAt: String(row.created_at),
      createdByName: (creator as { name?: string } | null)?.name ?? null,
      isLegacy: row.is_legacy === true,
      entryNumber: numberOf(row.journal_entry_id),
      deductionEntryNumber: numberOf(row.deduction_entry_id),
      fxEntryNumber: numberOf(row.fx_entry_id),
    };
  });
}

export async function loadPayrollMonth(period: string): Promise<PayrollMonth> {
  const [employees, tailors, advances] = await Promise.all([
    supabaseAdmin.rpc("get_employee_payroll", { p_branch_id: MAIN_BRANCH_ID, p_period: period }),
    supabaseAdmin.rpc("get_tailor_month_summary", { p_branch_id: MAIN_BRANCH_ID, p_period: period }),
    supabaseAdmin.rpc("get_tailor_advances", { p_branch_id: MAIN_BRANCH_ID, p_period: period, p_tailor_id: null }),
  ]);

  if (employees.error) throw new Error(`تعذر جلب الرواتب: ${employees.error.message}`);
  if (tailors.error) throw new Error(`تعذر جلب مستحقات الخياطين: ${tailors.error.message}`);
  if (advances.error) throw new Error(`تعذر جلب سلف الخياطين: ${advances.error.message}`);

  const advanceByTailor = new Map(
    ((advances.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.tailor_id), row]),
  );

  return {
    period,
    employees: ((employees.data ?? []) as Record<string, unknown>[]).map((row) => ({
      userId: String(row.user_id),
      name: String(row.name ?? ""),
      role: String(row.role ?? ""),
      position: row.position != null ? String(row.position) : null,
      isActive: row.is_active !== false,
      salarySdg: n(row.salary_sdg),
      advanceBalanceSdg: n(row.advance_balance_sdg),
      advancesMonthSdg: n(row.advances_month_sdg),
      returnedMonthSdg: n(row.returned_month_sdg),
      deductedMonthSdg: n(row.deducted_month_sdg),
      salaryPaidSdg: n(row.salary_paid_sdg),
      commissionPaidSdg: n(row.commission_paid_sdg),
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
      advanceBalanceSdg: n(advanceByTailor.get(String(row.tailor_id))?.general_balance_sdg),
      orderAdvancesSdg: n(advanceByTailor.get(String(row.tailor_id))?.order_advances_sdg),
      advancesMonthSdg: n(advanceByTailor.get(String(row.tailor_id))?.advances_month_sdg),
      returnedMonthSdg: n(advanceByTailor.get(String(row.tailor_id))?.returned_month_sdg),
      deductedMonthSdg: n(advanceByTailor.get(String(row.tailor_id))?.deducted_month_sdg),
    })),
  };
}

/** حركة سلف خياط (سلفة / استرداد نقدي / خصم من المستحقات) مع أرقام القيود للروابط */
export interface TailorAdvanceMovement {
  id: string;
  type: "ADVANCE" | "RETURN" | "DEDUCTION";
  amount: number;
  paymentMethod: "CASH" | "BANK" | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  entryNumbers: string[];
  fxEntryNumber: string | null;
}

export interface TailorProfile {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

export async function loadTailorProfile(tailorId: string): Promise<TailorProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select('id, name, phone, role, "isActive"')
    .eq("id", tailorId)
    .eq("branchId", MAIN_BRANCH_ID)
    .maybeSingle();

  if (error) throw new Error(`تعذر جلب الخياط: ${error.message}`);
  if (!data || String(data.role).toLowerCase() !== "tailor") return null;

  return {
    id: data.id as string,
    name: String(data.name ?? ""),
    phone: data.phone != null ? String(data.phone) : null,
    isActive: data.isActive !== false,
  };
}

/** سجل كامل بحركات سلف الخياط (الأحدث أولًا) */
export async function loadTailorAdvanceMovements(tailorId: string, limit = 500): Promise<TailorAdvanceMovement[]> {
  const { data, error } = await supabaseAdmin
    .from("tailor_advance_movements")
    .select("id, type, amount, payment_method, reference, notes, created_at, journal_entry_ids, fx_entry_id, creator:users!created_by ( name )")
    .eq("tailor_id", tailorId)
    .eq("branch_id", MAIN_BRANCH_ID)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`تعذر جلب حركات سلف الخياط: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.flatMap((row) => [
    ...((row.journal_entry_ids as string[] | null) ?? []),
    ...(typeof row.fx_entry_id === "string" ? [row.fx_entry_id] : []),
  ]);

  const numbers = new Map<string, string>();
  if (ids.length > 0) {
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from("journal_entries")
      .select("id, entry_number")
      .in("id", [...new Set(ids)]);

    if (entriesError) throw new Error(`تعذر جلب قيود الخياط: ${entriesError.message}`);
    for (const entry of entries ?? []) numbers.set(entry.id as string, entry.entry_number as string);
  }

  return rows.map((row) => {
    const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
    return {
      id: String(row.id),
      type: row.type as TailorAdvanceMovement["type"],
      amount: n(row.amount),
      paymentMethod: row.payment_method === "BANK" ? "BANK" : row.payment_method === "CASH" ? "CASH" : null,
      reference: row.reference != null ? String(row.reference) : null,
      notes: row.notes != null ? String(row.notes) : null,
      createdAt: String(row.created_at),
      createdByName: (creator as { name?: string } | null)?.name ?? null,
      entryNumbers: ((row.journal_entry_ids as string[] | null) ?? []).map((id) => numbers.get(id)).filter((x): x is string => Boolean(x)),
      fxEntryNumber: typeof row.fx_entry_id === "string" ? (numbers.get(row.fx_entry_id) ?? null) : null,
    };
  });
}

/** دفعة من مستحقات الخياط (سداد / خصم من السلف / سلفة قديمة من المستحقات) مع رقم القيد والطلب */
export interface TailorDuesPayment {
  id: string;
  createdAt: string;
  /** SETTLEMENT = سداد (أو خصم من السلف حسب الملاحظة)، DUES_ADVANCE = سلفة قديمة خُصمت من المستحقات، ADVANCE = دفعة مقدمة لطلب */
  paymentType: string;
  amountSdg: number;
  paymentMethod: "CASH" | "BANK";
  notes: string | null;
  orderNumber: string | null;
  entryNumber: string | null;
  /** القيد يخصم من رصيد السلف (TAILOR_ADVANCE_DEDUCTION) لا من الخزينة */
  isAdvanceDeduction: boolean;
}

export async function loadTailorDuesPayments(tailorId: string, limit = 500): Promise<TailorDuesPayment[]> {
  const { data, error } = await supabaseAdmin
    .from("tailor_commission_payments")
    .select("id, created_at, payment_type, amount, amount_original, currency, exchange_rate_used, payment_method, notes, journal_entry_id, sales_order_id")
    .eq("tailor_id", tailorId)
    .eq("branch_id", MAIN_BRANCH_ID)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`تعذر جلب مدفوعات الخياط: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const entryIds = [...new Set(rows.map((row) => row.journal_entry_id).filter((id): id is string => typeof id === "string"))];
  const orderIds = [...new Set(rows.map((row) => row.sales_order_id).filter((id): id is string => typeof id === "string"))];

  const [entries, orders] = await Promise.all([
    entryIds.length
      ? supabaseAdmin.from("journal_entries").select("id, entry_number, entry_type").in("id", entryIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseAdmin.from("sales_orders").select("id, order_number").in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (entries.error) throw new Error(`تعذر جلب قيود الخياط: ${entries.error.message}`);
  if (orders.error) throw new Error(`تعذر جلب طلبات الخياط: ${orders.error.message}`);

  const entryById = new Map((entries.data ?? []).map((entry) => [entry.id as string, entry as { entry_number: string; entry_type: string }]));
  const orderNumber = new Map((orders.data ?? []).map((order) => [order.id as string, order.order_number as string]));

  return rows.map((row) => {
    const entry = typeof row.journal_entry_id === "string" ? entryById.get(row.journal_entry_id) : undefined;
    const amountSdg =
      row.currency === "SDG" ? n(row.amount_original) : Math.round(n(row.amount) * n(row.exchange_rate_used) * 100) / 100;

    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      paymentType: String(row.payment_type),
      amountSdg,
      paymentMethod: row.payment_method === "BANK" ? "BANK" : "CASH",
      notes: row.notes != null ? String(row.notes) : null,
      orderNumber: typeof row.sales_order_id === "string" ? (orderNumber.get(row.sales_order_id) ?? null) : null,
      entryNumber: entry?.entry_number ?? null,
      isAdvanceDeduction: entry?.entry_type === "TAILOR_ADVANCE_DEDUCTION",
    };
  });
}

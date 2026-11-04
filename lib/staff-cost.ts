/**
 * lib/staff-cost.ts — مجموعة "تكلفة الموظفين" (عرض فقط)
 *
 * تجمع في العرض ثلاثة بنود منفصلة ثم إجماليها، دون دمج الحسابات في دفتر القيود:
 *   • الرواتب والعمولات: من دفعات الموظفين (employee_payments) كل واحد على حدة
 *   • مصروفات الموظفين اليومية: حساب STAFF_DAILY_EXPENSES (وجبات ومواصلات)
 * كل القيم بالدولار.
 */

export const STAFF_DAILY_EXPENSES_ACCOUNT = "STAFF_DAILY_EXPENSES";

export interface StaffCostItem {
  key: "salaries" | "commissions" | "dailyExpenses";
  label: string;
  valueUsd: number;
}

export interface StaffCost {
  items: StaffCostItem[];
  totalUsd: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildStaffCost(input: {
  salariesUsd: number;
  commissionsUsd: number;
  dailyExpensesUsd: number;
}): StaffCost {
  const items: StaffCostItem[] = [
    { key: "salaries", label: "الرواتب", valueUsd: round2(input.salariesUsd) },
    { key: "commissions", label: "العمولات", valueUsd: round2(input.commissionsUsd) },
    { key: "dailyExpenses", label: "المصروفات اليومية (وجبات ومواصلات)", valueUsd: round2(input.dailyExpensesUsd) },
  ];

  return { items, totalUsd: round2(items.reduce((sum, item) => sum + item.valueUsd, 0)) };
}

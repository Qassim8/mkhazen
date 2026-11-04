import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computePerformance, EXPENSE_CONFIG, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import { accountingAccountEnum } from "@/app/dashboard/accounting/schemas/accounting.schema";
import { STAFF_DAILY_EXPENSES_ACCOUNT, buildStaffCost } from "@/lib/staff-cost";

const entry = (debit: string, value: number): LedgerEntry => ({
  amount: value,
  amount_usd: value,
  currency: "USD",
  debit_account: debit,
  credit_account: "CASH",
  entry_type: "EXPENSE",
  created_at: "2026-06-15T10:00:00Z",
});

describe("مصروفات الموظفين اليومية (STAFF_DAILY_EXPENSES)", () => {
  it("الحساب معرّف في الـ enum وتوزيع المصروفات", () => {
    assert.equal(accountingAccountEnum.safeParse(STAFF_DAILY_EXPENSES_ACCOUNT).success, true);
    assert.equal(EXPENSE_CONFIG.STAFF_DAILY_EXPENSES.label, "مصروفات الموظفين اليومية (وجبات ومواصلات)");
    assert.ok(STAFF_DAILY_EXPENSES_ACCOUNT in EXPENSE_CONFIG);
  });

  it("يدخل في المصروفات التشغيلية وفي توزيعها دون أن يختلط بالرواتب", () => {
    const performance = computePerformance([entry("STAFF_DAILY_EXPENSES", 40), entry("SALARIES", 300), entry("UTILITIES", 60)]);

    assert.equal(performance.expenses, 400);
    const byAccount = Object.fromEntries(performance.expenseBreakdown.map((item) => [item.account, item.value]));
    assert.equal(byAccount.STAFF_DAILY_EXPENSES, 40);
    assert.equal(byAccount.SALARIES, 300);
  });

  it("مجموعة تكلفة الموظفين: ثلاثة بنود منفصلة ثم الإجمالي", () => {
    const staffCost = buildStaffCost({ salariesUsd: 300, commissionsUsd: 50.5, dailyExpensesUsd: 40 });

    assert.deepEqual(
      staffCost.items.map((item) => [item.key, item.valueUsd]),
      [
        ["salaries", 300],
        ["commissions", 50.5],
        ["dailyExpenses", 40],
      ],
    );
    assert.equal(staffCost.totalUsd, 390.5);
  });
});

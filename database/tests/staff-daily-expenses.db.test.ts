/**
 * 20261104_02_staff_daily_expenses — الحساب الجديد STAFF_DAILY_EXPENSES
 * (مصروفات الموظفين اليومية: وجبات ومواصلات) في record_expense_with_payable
 * و correct_manual_journal_entry، على المخطط الحي الحقيقي بعد تسلسل الإصدار كاملًا.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import {
  BRANCH_ID,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  seedBase,
  type Users,
} from "./db-harness";

after(releaseTemplate);

describe("STAFF_DAILY_EXPENSES (20261104_02)", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await fundAccount(db, "CASH", 1000);
  });
  after(() => db.close());

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const recordExpense = (account: string, userId = users.cashier, amount = 40) =>
    svc<{ r: { entry_ids: string[] } }>(
      `SELECT public.record_expense_with_payable($1, $2, $3, $4, 'USD', 'CASH', 0, $4, 0, NULL, 'فطور الموظفين', NULL) AS r`,
      [BRANCH_ID, userId, account, amount],
    );

  it("record_expense_with_payable: accepts the new account (cashier too) and posts DR STAFF_DAILY_EXPENSES / CR CASH", async () => {
    const { rows } = await recordExpense("STAFF_DAILY_EXPENSES");
    const entries = await db.query<{ entry_type: string; debit_account: string; credit_account: string; amount: string }>(
      `SELECT entry_type, debit_account, credit_account, amount FROM public.journal_entries WHERE id = ANY($1::uuid[])`,
      [rows[0].r.entry_ids],
    );

    assert.deepEqual(
      entries.rows.map((row) => [row.entry_type, row.debit_account, row.credit_account, num(row.amount)]),
      [["EXPENSE", "STAFF_DAILY_EXPENSES", "CASH", 40]],
    );
  });

  it("record_expense_with_payable: other accounts are still refused (salaries stay on the payroll page)", async () => {
    assert.match(await rpcError(recordExpense("SALARIES")), /حساب المصروف غير صالح/);
    assert.match(await rpcError(recordExpense("NOT_AN_ACCOUNT")), /حساب المصروف غير صالح/);
  });

  it("correct_manual_journal_entry: an expense can be corrected to the new account; unknown accounts are still refused", async () => {
    const original = await svc<{ id: string }>(
      `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, description, debit_account, credit_account, created_by, currency)
       VALUES ($1, $2, 'EXPENSE', 25, 'مصروف', 'OTHER_EXPENSE', 'CASH', $3, 'USD') RETURNING id`,
      [`JE-${randomUUID().slice(0, 8)}`, BRANCH_ID, users.owner],
    );
    const entryId = original.rows[0].id;

    const correct = (account: string) =>
      svc<{ r: Record<string, unknown> }>(
        `SELECT public.correct_manual_journal_entry($1,$2,$3,25,'USD','CASH',$4,'تصحيح نوع المصروف',NULL,NULL) AS r`,
        [BRANCH_ID, users.owner, entryId, account],
      );

    assert.match(await rpcError(correct("SALARIES")), /الرواتب والسلف/);
    assert.match(await rpcError(correct("NOT_AN_ACCOUNT")), /حساب المصروف غير صالح/);

    const result = (await correct("STAFF_DAILY_EXPENSES")).rows[0].r;
    const created = await db.query<{ debit_account: string; credit_account: string; amount: string }>(
      `SELECT debit_account, credit_account, amount FROM public.journal_entries WHERE id = $1`,
      [result.new_entry_id],
    );

    assert.deepEqual(
      [created.rows[0].debit_account, created.rows[0].credit_account, num(created.rows[0].amount)],
      ["STAFF_DAILY_EXPENSES", "CASH", 25],
    );
  });
});

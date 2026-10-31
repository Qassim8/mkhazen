/**
 * 20261029_01_flexible_payroll on the REAL live schema, after the full release sequence,
 * called as service_role. Run: npm run test:db
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
  runVerify,
  seedBase,
  type Users,
} from "./db-harness";

type Json = Record<string, unknown>;

after(releaseTemplate);

const thisMonth = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 7) + "-01";

describe("flexible employee payroll and advances (20261029_01)", () => {
  let db: PGliteInterface;
  let users: Users;

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const setRate = (rate: number) =>
    db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, $2, clock_timestamp())`, [BRANCH_ID, rate]);

  const pay = (
    employee: string,
    type: "ADVANCE" | "ADVANCE_RETURN" | "SALARY" | "COMMISSION",
    amount: number,
    opts: { method?: string; deduct?: number; period?: string; notes?: string | null; userId?: string } = {},
  ) =>
    svc<{ r: Json }>(`SELECT public.pay_employee($1, $2, $3, $4::date, $5, $6, $7, $8, $9) AS r`, [
      BRANCH_ID,
      opts.userId ?? users.admin,
      employee,
      opts.period ?? thisMonth(),
      type,
      amount,
      opts.method ?? "CASH",
      opts.notes ?? null,
      opts.deduct ?? 0,
    ]);

  const balance = async (employee: string) =>
    num((await svc<{ b: string }>(`SELECT public.get_employee_advance_balance($1) AS b`, [employee])).rows[0].b);

  const usdBalance = async (employee: string) =>
    num((await svc<{ b: string }>(`SELECT public.get_employee_advance_usd_balance($1) AS b`, [employee])).rows[0].b);

  const cash = async () =>
    num((await db.query<{ b: string }>(`SELECT public.get_account_balance($1, 'CASH', 'SDG') AS b`, [BRANCH_ID])).rows[0].b);

  const sumOf = async (account: string, side: "debit" | "credit", where = "TRUE") =>
    num(
      (
        await db.query<{ s: string }>(
          `SELECT COALESCE(sum(amount), 0) AS s FROM public.journal_entries WHERE ${side}_account = $1 AND currency = 'SDG' AND ${where}`,
          [account],
        )
      ).rows[0].s,
    );

  const entry = async (id: string) =>
    (
      await db.query<{ entry_type: string; debit_account: string; credit_account: string; amount: string; amount_usd: string; currency: string; description: string }>(
        `SELECT entry_type, debit_account, credit_account, amount, amount_usd, currency, description FROM public.journal_entries WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const newEmployee = async (name: string, salary: number | null, role = "CASHIER") => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO public.users (id, name, email, password, role, "branchId", salary, "isActive")
       VALUES ($1, $2, $3, 'x', $4::"Role", $5, $6, true)`,
      [id, name, `${id}@test.local`, role, BRANCH_ID, salary],
    );
    return id;
  };

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await setRate(2500);
    await fundAccount(db, "CASH", 5_000_000, "SDG");
    await fundAccount(db, "BANK", 1_000_000, "SDG");
  });
  after(() => db.close());

  it("an advance is an open amount (no salary needed) booked as an asset, not an expense", async () => {
    const employee = await newEmployee("بلا راتب", null);
    const cashBefore = await cash();
    const expensesBefore = await sumOf("SALARIES", "debit");

    const r = (await pay(employee, "ADVANCE", 500_000, { notes: "ظرف طارئ" })).rows[0].r;

    assert.equal(num(r.advance_balance), 500_000);
    assert.equal(await balance(employee), 500_000);
    assert.equal(await cash(), cashBefore - 500_000);
    assert.equal(await sumOf("SALARIES", "debit"), expensesBefore, "an advance is not a salary expense");

    const e = await entry(String(r.journal_entry_id));
    assert.deepEqual(
      [e.entry_type, e.debit_account, e.credit_account, num(e.amount), e.currency],
      ["EMPLOYEE_ADVANCE", "EMPLOYEE_ADVANCES", "CASH", 500_000, "SDG"],
    );
  });

  it("advance, partial cash return, then the rest deducted from a salary → balance 0 and the books close", async () => {
    await setRate(2500);
    const employee = await newEmployee("سلفة كاملة", 80_000);
    const cashStart = await cash();
    const salariesStart = await sumOf("SALARIES", "debit");

    await pay(employee, "ADVANCE", 100_000); // 40 USD @ 2500
    assert.equal(await balance(employee), 100_000);

    const ret = (await pay(employee, "ADVANCE_RETURN", 30_000, { method: "BANK" })).rows[0].r; // 12 USD
    assert.equal(num(ret.advance_balance), 70_000);
    const returned = await entry(String(ret.journal_entry_id));
    assert.deepEqual([returned.debit_account, returned.credit_account, returned.entry_type], ["BANK", "EMPLOYEE_ADVANCES", "EMPLOYEE_ADVANCE"]);

    // the pound weakens, then a 120,000 salary with the remaining 70,000 deducted
    await setRate(3000);
    const salary = (await pay(employee, "SALARY", 120_000, { deduct: 70_000, notes: "راتب أكتوبر" })).rows[0].r;

    assert.equal(await balance(employee), 0, "balance = advances − returned − deducted = 0");
    assert.equal(num(salary.net), 50_000);
    assert.equal(num(salary.deducted), 70_000);

    const netEntry = await entry(String(salary.journal_entry_id));
    assert.deepEqual([netEntry.debit_account, netEntry.credit_account, num(netEntry.amount)], ["SALARIES", "CASH", 50_000]);
    const deduction = await entry(String(salary.deduction_entry_id));
    assert.deepEqual([deduction.debit_account, deduction.credit_account, num(deduction.amount)], ["SALARIES", "EMPLOYEE_ADVANCES", 70_000]);

    // SALARIES takes the full salary; cash only the net
    assert.equal((await sumOf("SALARIES", "debit")) - salariesStart, 120_000);
    // cash: −100,000 advance, +0 (the return went to the bank), −50,000 net salary
    assert.equal(await cash(), cashStart - 150_000);

    // USD residual of the advance (40 − 12 − 70,000/3000) is closed on CURRENCY_EXCHANGE
    // 40 − 12 − 23.33 = 4.67 still an asset → a loss
    assert.ok(salary.fx_entry_id, "an exchange entry closes the residual");
    const fx = await entry(String(salary.fx_entry_id));
    assert.deepEqual(
      [fx.entry_type, fx.currency, fx.debit_account, fx.credit_account, num(fx.amount_usd)],
      ["CURRENCY_EXCHANGE", "USD", "CURRENCY_EXCHANGE", "EMPLOYEE_ADVANCES", 4.67],
    );
    assert.equal(await usdBalance(employee), 0);

    await setRate(2500);
  });

  it("salary needs no set amount and can be paid any amount at any time (past month, with a period note)", async () => {
    const employee = await newEmployee("راتب حر", null);
    const past = "2026-01-01";

    const r = (await pay(employee, "SALARY", 12_345.67, { period: past, notes: "راتب يناير - دفعة أولى" })).rows[0].r;
    assert.equal(r.period, past);
    assert.equal(num(r.net), 12_345.67);

    const e = await entry(String(r.journal_entry_id));
    assert.deepEqual([e.debit_account, e.credit_account, e.entry_type, num(e.amount)], ["SALARIES", "CASH", "EXPENSE", 12_345.67]);
    assert.match(e.description, /راتب يناير/);

    // again, any amount, same month: no cap against a monthly salary
    await pay(employee, "SALARY", 1_000_000, { period: past, method: "BANK" });
    assert.equal(await balance(employee), 0, "salary payments never create advance balance");

    // a future month is still refused
    assert.match(await rpcError(pay(employee, "SALARY", 100, { period: "2099-01-01" })), /مستقبلي/);
  });

  it("a full-deduction salary (net 0) needs no cash and still records the expense", async () => {
    const employee = await newEmployee("خصم كامل", 100_000);
    await pay(employee, "ADVANCE", 40_000);
    const cashBefore = await cash();
    const salariesBefore = await sumOf("SALARIES", "debit");

    const r = (await pay(employee, "SALARY", 40_000, { deduct: 40_000 })).rows[0].r;
    assert.equal(num(r.net), 0);
    assert.equal(await cash(), cashBefore);
    assert.equal((await sumOf("SALARIES", "debit")) - salariesBefore, 40_000);
    assert.equal(await balance(employee), 0);
    assert.equal(r.journal_entry_id, r.deduction_entry_id);
  });

  it("commission is SALARIES / cash with a commission description and never touches the advance balance", async () => {
    const employee = await newEmployee("عمولة", 50_000);
    await pay(employee, "ADVANCE", 25_000);
    const cashBefore = await cash();

    const r = (await pay(employee, "COMMISSION", 8_000, { method: "BANK", notes: "نسبة 5% من مبيعات أكتوبر" })).rows[0].r;

    const e = await entry(String(r.journal_entry_id));
    assert.deepEqual([e.debit_account, e.credit_account, e.entry_type, num(e.amount)], ["SALARIES", "BANK", "EXPENSE", 8_000]);
    assert.match(e.description, /عمولة/);
    assert.equal(await balance(employee), 25_000, "the advance balance is unchanged");
    assert.equal(await cash(), cashBefore, "paid from the bank");

    assert.match(await rpcError(pay(employee, "COMMISSION", 100, { deduct: 50 })), /الراتب فقط/);
  });

  it("rejections: return or deduction above the balance, deduction above the salary, cash shortage, roles", async () => {
    const employee = await newEmployee("حدود", 10_000);
    await pay(employee, "ADVANCE", 10_000);

    assert.match(await rpcError(pay(employee, "ADVANCE_RETURN", 10_000.01)), /يتجاوز رصيد سلف/);
    assert.match(await rpcError(pay(employee, "SALARY", 50_000, { deduct: 10_000.01 })), /يتجاوز رصيد سلف/);
    assert.match(await rpcError(pay(employee, "SALARY", 5_000, { deduct: 6_000 })), /يتجاوز مبلغ الراتب/);
    assert.match(await rpcError(pay(employee, "ADVANCE", 100, { deduct: 50 })), /الراتب فقط/);
    assert.match(await rpcError(pay(employee, "ADVANCE_RETURN", 0)), /المبلغ غير صالح/);
    assert.match(await rpcError(pay(employee, "ADVANCE_RETURN", 10.123)), /المبلغ غير صالح/);

    // not enough in the till
    assert.match(await rpcError(pay(employee, "ADVANCE", 999_999_999)), /الرصيد غير كافٍ في الخزينة/);
    assert.match(await rpcError(pay(employee, "SALARY", 999_999_999, { method: "BANK" })), /الرصيد غير كافٍ في البنك/);
    assert.match(await rpcError(pay(employee, "COMMISSION", 999_999_999)), /الرصيد غير كافٍ/);

    // a net-zero deduction needs no cash even when the till is short
    const rejected = await balance(employee);
    assert.equal(rejected, 10_000, "rejected calls leave the balance untouched");

    // roles and tailors
    assert.match(await rpcError(pay(employee, "ADVANCE", 100, { userId: users.cashier })), /للمالك أو المدير فقط/);
    assert.match(await rpcError(pay(users.tailor, "SALARY", 100)), /مستحقات الخياطين/);
    assert.match(await rpcError(pay(users.tailor, "ADVANCE", 100)), /مستحقات الخياطين/);
  });

  it("legacy advances (booked as salary expense before this change) do not enter the advance balance", async () => {
    const employee = await newEmployee("قديم", 90_000);
    await db.query(
      `INSERT INTO public.employee_payments (branch_id, user_id, period, type, amount, payment_method, created_by, is_legacy)
       VALUES ($1, $2, $3::date, 'ADVANCE', 20000, 'CASH', $4, true)`,
      [BRANCH_ID, employee, thisMonth(), users.admin],
    );
    assert.equal(await balance(employee), 0);
    assert.match(await rpcError(pay(employee, "ADVANCE_RETURN", 1)), /يتجاوز رصيد سلف/);
  });

  it("get_payroll: balance per employee and the month's movements; summary for the accounting card", async () => {
    const employee = await newEmployee("كشف", 70_000);
    await pay(employee, "ADVANCE", 30_000);
    await pay(employee, "ADVANCE_RETURN", 5_000);
    await pay(employee, "SALARY", 60_000, { deduct: 10_000 });
    await pay(employee, "COMMISSION", 4_000);

    const { rows } = await svc<Record<string, string | boolean>>(`SELECT * FROM public.get_payroll($1, $2::date)`, [BRANCH_ID, thisMonth()]);
    const row = rows.find((r) => r.user_id === employee)!;
    assert.deepEqual(
      [
        num(row.salary_sdg),
        num(row.advance_balance_sdg),
        num(row.advances_month_sdg),
        num(row.returned_month_sdg),
        num(row.deducted_month_sdg),
        num(row.salary_paid_sdg),
        num(row.commission_paid_sdg),
      ],
      [70_000, 15_000, 30_000, 5_000, 10_000, 60_000, 4_000],
    );
    assert.ok(!rows.some((r) => r.user_id === users.tailor), "tailors are not in the employee payroll");
    assert.ok(!rows.some((r) => r.user_id === users.owner), "the owner is not in the payroll");

    const summary = (await svc<{ s: Json }>(`SELECT public.get_employee_advances_summary($1) AS s`, [BRANCH_ID])).rows[0].s;
    const expected = (
      await db.query<{ s: string; n: string }>(
        `SELECT COALESCE(sum(public.get_employee_advance_balance(id)) FILTER (WHERE public.get_employee_advance_balance(id) > 0), 0) AS s,
                count(*) FILTER (WHERE public.get_employee_advance_balance(id) > 0) AS n
         FROM public.users WHERE lower(role::text) <> 'tailor'`,
      )
    ).rows[0];
    assert.equal(num(summary.total_balance_sdg), num(expected.s));
    assert.equal(num(summary.employees_count), num(expected.n));
    assert.ok(num(summary.book_usd) > 0);
  });

  it("the tailor dues system is untouched: no EMPLOYEE_ADVANCES entry is ever created by tailor payments", async () => {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.journal_entries
       WHERE (debit_account = 'TAILOR_ADVANCES' OR credit_account = 'TAILOR_ADVANCES') AND (debit_account = 'EMPLOYEE_ADVANCES' OR credit_account = 'EMPLOYEE_ADVANCES')`,
    );
    assert.equal(num(rows[0].n), 0);
  });

  it("verify.sql still passes", async () => {
    assert.deepEqual((await runVerify(db)).failed, []);
  });
});

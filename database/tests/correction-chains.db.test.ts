/**
 * تصحيح القيود اليدوية: النسخة السارية + العكس لنفس حساب الدفع (20261107_01)،
 * وإصلاح البيانات القديمة (20261107_02 preview / 20261107_03 apply)،
 * وأن المصروفات في التقارير صافي (مدين − دائن).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";

import { computePerformance, type LedgerEntry } from "@/app/api/accounting/_lib/ledger";
import {
  BRANCH_ID,
  M,
  RELEASE_SEQUENCE,
  asRole,
  createLiveDb,
  fundAccount,
  num,
  releaseTemplate,
  rpcError,
  seedBase,
  sql,
  type Users,
} from "./db-harness";

after(releaseTemplate);

type Row = Record<string, unknown>;

describe("correct_manual_journal_entry: current version + reversal to the reversed entry's payment account", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await fundAccount(db, "CASH", 5000);
    await fundAccount(db, "BANK", 5000);
  });
  after(() => db.close());

  const svc = <T,>(text: string, params: unknown[] = []) => asRole(db, "service_role", () => db.query<T>(text, params));

  const expense = async (account: string, amount: number, payment: "CASH" | "BANK" = "CASH") =>
    (
      await svc<{ id: string }>(
        `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, description, debit_account, credit_account, created_by, currency)
         VALUES ($1, $2, 'EXPENSE', $3, 'مصروف', $4, $5, $6, 'USD') RETURNING id`,
        [`JE-${randomUUID().slice(0, 8)}`, BRANCH_ID, amount, account, payment, users.owner],
      )
    ).rows[0].id;

  const correct = (entryId: string, opts: { amount?: number; method?: "CASH" | "BANK"; account?: string }) =>
    svc<{ r: { reversal_entry_id: string; new_entry_id: string; reversed_entry_id: string } }>(
      `SELECT public.correct_manual_journal_entry($1,$2,$3,$4,'USD',$5,$6,'تصحيح',NULL,NULL) AS r`,
      [BRANCH_ID, users.owner, entryId, opts.amount ?? 100, opts.method ?? "CASH", opts.account ?? "RENTS"],
    );

  const entry = async (id: string) =>
    (await db.query<Row>(`SELECT debit_account, credit_account, correction_of_id, is_correction_reversal FROM public.journal_entries WHERE id = $1`, [id])).rows[0];

  const ledger = async (): Promise<LedgerEntry[]> =>
    (
      await db.query<Row>(
        `SELECT amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at FROM public.journal_entries WHERE branch_id = $1`,
        [BRANCH_ID],
      )
    ).rows.map((row) => ({
      amount: num(row.amount),
      amount_usd: num(row.amount_usd),
      currency: row.currency as "USD" | "SDG",
      debit_account: String(row.debit_account),
      credit_account: String(row.credit_account),
      entry_type: String(row.entry_type),
      created_at: new Date(row.created_at as string).toISOString(),
    }));

  const net = async (account: string) => {
    const rows = await ledger();
    return Math.round(
      rows.reduce(
        (sum, e) => sum + (e.debit_account === account ? num(e.amount_usd) : 0) - (e.credit_account === account ? num(e.amount_usd) : 0),
        0,
      ) * 100,
    ) / 100;
  };

  const expensesTotal = async () => computePerformance(await ledger()).expenses;

  it("expense from CASH, then correcting its account: total expenses and cash unchanged, the amount moves between the two expense accounts", async () => {
    const id = await expense("UTILITIES", 100, "CASH");
    const before = { expenses: await expensesTotal(), cash: await net("CASH"), utilities: await net("UTILITIES"), rents: await net("RENTS") };

    const { rows } = await correct(id, { account: "RENTS", method: "CASH" });

    assert.equal(await expensesTotal(), before.expenses, "total expenses are the net, so they do not change");
    assert.equal(await net("CASH"), before.cash);
    assert.equal(await net("UTILITIES"), before.utilities - 100);
    assert.equal(await net("RENTS"), before.rents + 100);

    const reversal = await entry(rows[0].r.reversal_entry_id);
    assert.equal(reversal.debit_account, "CASH", "the reversal returns the money to the payment account of the reversed entry");
    assert.equal(reversal.credit_account, "UTILITIES");
    assert.equal(reversal.is_correction_reversal, true);
  });

  it("an expense paid from BANK is reversed back to BANK (not a fixed account)", async () => {
    const id = await expense("UTILITIES", 60, "BANK");
    const bank = await net("BANK");
    const expenses = await expensesTotal();

    const { rows } = await correct(id, { amount: 60, account: "MAINTENANCE", method: "BANK" });

    assert.equal((await entry(rows[0].r.reversal_entry_id)).debit_account, "BANK");
    assert.equal(await net("BANK"), bank);
    assert.equal(await expensesTotal(), expenses);
  });

  it("correcting twice gives the same result: the second correction works on the current version, not the original", async () => {
    const id = await expense("UTILITIES", 100, "CASH");
    const before = { expenses: await expensesTotal(), cash: await net("CASH"), utilities: await net("UTILITIES"), rents: await net("RENTS"), maintenance: await net("MAINTENANCE") };

    const first = (await correct(id, { account: "RENTS" })).rows[0].r;
    const second = (await correct(id, { account: "MAINTENANCE" })).rows[0].r;

    // الثانية عكست النسخة الجديدة من التصحيح الأول، لا القيد الأصلي مرة أخرى
    assert.equal(second.reversed_entry_id, first.new_entry_id);
    assert.equal((await entry(second.reversal_entry_id)).correction_of_id, first.new_entry_id);
    const reversalsOfOriginal = await db.query(`SELECT 1 FROM public.journal_entries WHERE correction_of_id = $1 AND is_correction_reversal`, [id]);
    assert.equal(reversalsOfOriginal.rows.length, 1);

    assert.equal(await expensesTotal(), before.expenses);
    assert.equal(await net("CASH"), before.cash);
    assert.equal(await net("UTILITIES"), before.utilities - 100);
    assert.equal(await net("RENTS"), before.rents);
    assert.equal(await net("MAINTENANCE"), before.maintenance + 100);

    // تمرير النسخة الحالية مباشرة يعطي النتيجة نفسها
    const third = (await correct(second.new_entry_id, { account: "RENTS" })).rows[0].r;
    assert.equal(third.reversed_entry_id, second.new_entry_id);
    assert.equal(await net("MAINTENANCE"), before.maintenance);
    assert.equal(await net("RENTS"), before.rents + 100);
    assert.equal(await expensesTotal(), before.expenses);
  });

  it("if the payment account was changed by the first correction, the second reversal returns to that account", async () => {
    const id = await expense("UTILITIES", 100, "CASH");
    const cash = await net("CASH");
    const bank = await net("BANK");

    await correct(id, { account: "RENTS", method: "BANK" }); // CASH → BANK
    assert.equal(await net("CASH"), cash + 100);
    assert.equal(await net("BANK"), bank - 100);

    const second = (await correct(id, { account: "RENTS", method: "CASH" })).rows[0].r; // BANK → CASH
    assert.equal((await entry(second.reversal_entry_id)).debit_account, "BANK");
    assert.equal(await net("CASH"), cash);
    assert.equal(await net("BANK"), bank);
  });

  it("reversals and current-version rules do not weaken the existing guards", async () => {
    const id = await expense("UTILITIES", 10, "CASH");
    const { rows } = await correct(id, { amount: 10 });
    assert.match(await rpcError(correct(rows[0].r.reversal_entry_id, {})), /قيد عكسي/);
    assert.match(await rpcError(correct(id, { account: "SALARIES" })), /الرواتب والسلف/);
  });
});

describe("expenses are net (debit − credit) in the reports", () => {
  const entry = (debit: string, credit: string, value: number): LedgerEntry => ({
    amount: value,
    amount_usd: value,
    currency: "USD",
    debit_account: debit,
    credit_account: credit,
    entry_type: "EXPENSE",
    created_at: "2026-06-15T10:00:00Z",
  });

  it("a correction (original + reversal + new) counts only the new amount, per account and in total", () => {
    const performance = computePerformance([
      entry("UTILITIES", "CASH", 100),
      entry("CASH", "UTILITIES", 100), // العكس
      entry("RENTS", "CASH", 100),
    ]);

    assert.equal(performance.expenses, 100);
    assert.deepEqual(
      Object.fromEntries(performance.expenseBreakdown.map((item) => [item.account, item.value])),
      { RENTS: 100 },
    );
    assert.equal(performance.monthly[5].expenses, 100);
  });
});

/* =====================================================================
   إصلاح البيانات القديمة (preview ثم apply)
===================================================================== */

describe("data fix for legacy correction chains (20261107_02 preview / 20261107_03 apply)", () => {
  let db: PGliteInterface;
  let users: Users;
  let seq = 0;
  let originX: string; // عُكس 3 مرات (ب) + أحد العكسيات رجع للبنك
  let originY: string; // عكس واحد رجع للبنك بدل الخزنة (أ)
  let originZ: string; // بالجنيه، عُكس مرتين (ب)
  const lastNew: Record<string, string> = {};

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
    await db.query(`INSERT INTO public.exchange_rates (branch_id, rate, effective_at) VALUES ($1, 2500, clock_timestamp())`, [BRANCH_ID]);

    const insert = async (opts: {
      number?: string;
      debit: string;
      credit: string;
      amount: number;
      currency?: "USD" | "SDG";
      of?: string | null;
      reversal?: boolean;
      at: number;
    }) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.journal_entries
             (entry_number, branch_id, entry_type, amount, description, debit_account, credit_account, created_by, created_at,
              currency, exchange_rate_used, correction_of_id, is_correction_reversal)
           VALUES ($1, $2, 'EXPENSE', $3, 'قيد', $4, $5, $6, now() + ($7 || ' seconds')::interval, $8, $9, $10, $11) RETURNING id`,
          [
            opts.number ?? `JE-2026-${(++seq).toString(16).toUpperCase().padStart(10, "0")}`,
            BRANCH_ID,
            opts.amount,
            opts.debit,
            opts.credit,
            users.owner,
            String(opts.at),
            opts.currency ?? "USD",
            (opts.currency ?? "USD") === "SDG" ? 2500 : null,
            opts.of ?? null,
            opts.reversal ?? false,
          ],
        )
      ).rows[0].id;

    const fix = () => `JE-FIX-${(++seq).toString(16).toUpperCase().padStart(10, "0")}`;

    // X: 100 من الخزنة، عُكس 3 مرات (واحد رجع للبنك)، وثلاث نسخ جديدة (80، 70، 60)
    originX = await insert({ debit: "UTILITIES", credit: "CASH", amount: 100, at: 1 });
    await insert({ number: fix(), debit: "CASH", credit: "UTILITIES", amount: 100, of: originX, reversal: true, at: 2 });
    await insert({ debit: "RENTS", credit: "CASH", amount: 80, of: originX, at: 3 });
    await insert({ number: fix(), debit: "BANK", credit: "UTILITIES", amount: 100, of: originX, reversal: true, at: 4 });
    await insert({ debit: "RENTS", credit: "CASH", amount: 70, of: originX, at: 5 });
    await insert({ number: fix(), debit: "CASH", credit: "UTILITIES", amount: 100, of: originX, reversal: true, at: 6 });
    lastNew.X = await insert({ debit: "RENTS", credit: "CASH", amount: 60, of: originX, at: 7 });

    // Y: عكس واحد رجع للبنك بدل الخزنة
    originY = await insert({ debit: "UTILITIES", credit: "CASH", amount: 50, at: 8 });
    await insert({ number: fix(), debit: "BANK", credit: "UTILITIES", amount: 50, of: originY, reversal: true, at: 9 });
    lastNew.Y = await insert({ debit: "UTILITIES", credit: "CASH", amount: 40, of: originY, at: 10 });

    // Z: بالجنيه (سعر 2500)، عُكس مرتين
    originZ = await insert({ debit: "UTILITIES", credit: "CASH", amount: 5000, currency: "SDG", at: 11 });
    await insert({ number: fix(), debit: "CASH", credit: "UTILITIES", amount: 5000, currency: "SDG", of: originZ, reversal: true, at: 12 });
    await insert({ debit: "RENTS", credit: "CASH", amount: 4000, currency: "SDG", of: originZ, at: 13 });
    await insert({ number: fix(), debit: "CASH", credit: "UTILITIES", amount: 5000, currency: "SDG", of: originZ, reversal: true, at: 14 });
    lastNew.Z = await insert({ debit: "RENTS", credit: "CASH", amount: 3000, currency: "SDG", of: originZ, at: 15 });

    // قيد عادي لا علاقة له بالتصحيح: يجب ألا يمسه الإصلاح
    await insert({ debit: "MAINTENANCE", credit: "CASH", amount: 25, at: 16 });
  });
  after(() => db.close());

  const accountNet = async (): Promise<Record<string, number>> => {
    const { rows } = await db.query<{ k: string; a: string }>(
      `SELECT account || '|' || currency AS k, round(sum(amt), 2) AS a
       FROM (
         SELECT debit_account AS account, currency, amount AS amt FROM public.journal_entries
         UNION ALL
         SELECT credit_account, currency, -amount FROM public.journal_entries
       ) t GROUP BY 1`,
    );
    return Object.fromEntries(rows.map((row) => [row.k, num(row.a)]));
  };

  const snapshot = async () =>
    (
      await db.query<{ n: string; h: string }>(
        `SELECT count(*) AS n,
                md5(string_agg(id::text || amount::text || debit_account || credit_account || currency || is_correction_reversal::text || COALESCE(correction_of_id::text, '') || created_at::text,
                               ',' ORDER BY id)) AS h
         FROM public.journal_entries`,
      )
    ).rows[0];

  const chainNet = async (origin: string): Promise<Record<string, number>> => {
    const { rows } = await db.query<{ k: string; a: string }>(
      `WITH members AS (
         SELECT id FROM public.journal_entries WHERE id = $1 OR correction_of_id = $1
         UNION
         SELECT a.id FROM public.journal_entries c
           JOIN public.journal_entries a ON a.correction_of_id = c.id AND a.entry_number LIKE 'JE-FIXADJ-%'
           WHERE c.correction_of_id = $1
       )
       SELECT account || '|' || currency AS k, round(sum(amt), 2) AS a
       FROM (
         SELECT e.debit_account AS account, e.currency, e.amount AS amt FROM public.journal_entries e WHERE e.id IN (SELECT id FROM members)
         UNION ALL
         SELECT e.credit_account, e.currency, -e.amount FROM public.journal_entries e WHERE e.id IN (SELECT id FROM members)
       ) t GROUP BY 1`,
      [origin],
    );
    return Object.fromEntries(rows.map((row) => [row.k, num(row.a)]).filter(([, value]) => value !== 0));
  };

  const lastNewNet = async (id: string): Promise<Record<string, number>> => {
    const { rows } = await db.query<Row>(`SELECT debit_account, credit_account, currency, amount FROM public.journal_entries WHERE id = $1`, [id]);
    const e = rows[0];
    return { [`${e.debit_account}|${e.currency}`]: num(e.amount), [`${e.credit_account}|${e.currency}`]: -num(e.amount) };
  };

  const runApply = async () => {
    try {
      await db.exec(sql(M.fixChainsApply));
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => undefined);
      throw error;
    }
  };

  it("preview is read-only and reports per-account current / correct / diff, plus totals", async () => {
    const before = await snapshot();
    const { rows } = await db.query<Row>(sql(M.fixChainsPreview));
    assert.deepEqual(await snapshot(), before, "preview wrote nothing");

    const summary = rows.find((row) => row.section === "1_SUMMARY");
    assert.match(String(summary?.label), /\(أ\): 1 — \(ب\): 6 — سلاسل: 3 — تحتاج مراجعة يدوية: 0/);

    // كل صف في كل سلسلة: الصحيح = الحالي + الفرق
    for (const row of rows.filter((item) => item.section === "2_CASE")) {
      assert.equal(num(row.correct_amount), Math.round((num(row.current_amount) + num(row.diff_amount)) * 100) / 100);
    }

    // إجماليات الفرق: الخزنة تزيد والبنك ينقص (بالدولار: X ثم Y)
    const totals = Object.fromEntries(
      rows.filter((item) => item.section === "3_TOTAL").map((item) => [`${item.account}|${item.currency}`, num(item.diff_amount)]),
    );
    // X: الخزنة +50 والبنك −100 (إلغاء العكس الذي رجع للبنك)، Y: الخزنة +50 والبنك −50
    assert.equal(totals["CASH|USD"], 100);
    assert.equal(totals["BANK|USD"], -150);
  });

  it("apply: every chain nets to its last intended copy only; no entry is updated or deleted; the ledger moves exactly by the previewed totals", async () => {
    const preview = await db.query<Row>(sql(M.fixChainsPreview));
    const totals = Object.fromEntries(
      preview.rows.filter((item) => item.section === "3_TOTAL").map((item) => [`${item.account}|${item.currency}`, num(item.diff_amount)]),
    );

    const beforeSnapshot = await snapshot();
    const beforeNet = await accountNet();
    const existingIds = (await db.query<{ id: string }>(`SELECT id FROM public.journal_entries`)).rows.map((row) => row.id);

    await runApply();

    // لا حذف ولا تعديل: كل قيد قديم كما هو، والجديد 7 تسويات فقط
    const afterCount = Number((await snapshot()).n);
    assert.equal(afterCount, Number(beforeSnapshot.n) + 7);
    const untouched = await db.query<{ h: string }>(
      `SELECT md5(string_agg(id::text || amount::text || debit_account || credit_account || currency || is_correction_reversal::text || COALESCE(correction_of_id::text, '') || created_at::text, ',' ORDER BY id)) AS h
       FROM public.journal_entries WHERE id = ANY($1::uuid[])`,
      [existingIds],
    );
    assert.equal(untouched.rows[0].h, beforeSnapshot.h);

    const afterNet = await accountNet();
    const keys = new Set([...Object.keys(beforeNet), ...Object.keys(afterNet)]);
    for (const key of keys) {
      const moved = Math.round(((afterNet[key] ?? 0) - (beforeNet[key] ?? 0)) * 100) / 100;
      assert.equal(moved, totals[key] ?? 0, `account ${key} moved by the previewed total`);
    }

    // كل سلسلة صافيها = آخر نسخة مقصودة فقط (بالعملة الأصلية)
    assert.deepEqual(await chainNet(originX), await lastNewNet(lastNew.X));
    assert.deepEqual(await chainNet(originY), await lastNewNet(lastNew.Y));
    assert.deepEqual(await chainNet(originZ), await lastNewNet(lastNew.Z));

    // قيد المصروف العادي لم يتأثر
    assert.equal(afterNet["MAINTENANCE|USD"], 25);

    // التسويات: أرقامها JE-FIXADJ-* ومعلَّمة عكسية فلا تُصحَّح
    const adjustments = await db.query<Row>(`SELECT is_correction_reversal FROM public.journal_entries WHERE entry_number LIKE 'JE-FIXADJ-%'`);
    assert.equal(adjustments.rows.length, 7);
    assert.ok(adjustments.rows.every((row) => row.is_correction_reversal === true));
  });

  it("apply refuses to run twice and changes nothing the second time", async () => {
    const before = await snapshot();
    await assert.rejects(runApply(), /تم تطبيق هذا الإصلاح من قبل/);
    assert.deepEqual(await snapshot(), before);
  });
});

describe("apply refuses cases that need manual review", () => {
  let db: PGliteInterface;
  let users: Users;

  before(async () => {
    db = await createLiveDb({ migrations: RELEASE_SEQUENCE });
    users = await seedBase(db);
  });
  after(() => db.close());

  it("an extra copy that was itself corrected later is reported and nothing is applied", async () => {
    const insert = async (number: string, debit: string, credit: string, amount: number, of: string | null, reversal: boolean, at: number) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.journal_entries (entry_number, branch_id, entry_type, amount, description, debit_account, credit_account, created_by, created_at, currency, correction_of_id, is_correction_reversal)
           VALUES ($1, $2, 'EXPENSE', $3, 'قيد', $4, $5, $6, now() + ($7 || ' seconds')::interval, 'USD', $8, $9) RETURNING id`,
          [number, BRANCH_ID, amount, debit, credit, users.owner, String(at), of, reversal],
        )
      ).rows[0].id;

    const origin = await insert("JE-2026-REVIEW0001", "UTILITIES", "CASH", 100, null, false, 1);
    await insert("JE-FIX-REVIEW0001", "CASH", "UTILITIES", 100, origin, true, 2);
    const firstNew = await insert("JE-2026-REVIEW0002", "RENTS", "CASH", 80, origin, false, 3);
    await insert("JE-FIX-REVIEW0002", "CASH", "UTILITIES", 100, origin, true, 4);
    await insert("JE-2026-REVIEW0003", "RENTS", "CASH", 70, origin, false, 5);
    // النسخة الأولى صُحّحت هي نفسها لاحقًا
    await insert("JE-FIX-REVIEW0003", "CASH", "RENTS", 80, firstNew, true, 6);
    await insert("JE-2026-REVIEW0004", "RENTS", "CASH", 75, firstNew, false, 7);

    const count = async () => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.journal_entries`)).rows[0].n);
    const before = await count();

    const preview = await db.query<Row>(sql(M.fixChainsPreview));
    assert.ok(preview.rows.some((row) => row.section === "4_REVIEW" && /صُحّحت هي نفسها لاحقًا/.test(String(row.label))));

    await assert.rejects(
      (async () => {
        try {
          await db.exec(sql(M.fixChainsApply));
        } catch (error) {
          await db.exec("ROLLBACK").catch(() => undefined);
          throw error;
        }
      })(),
      /تحتاج مراجعة يدوية/,
    );
    assert.equal(await count(), before);
  });
});

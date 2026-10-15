"use client";

/**
 * السلف والمستحقات (تحت الموظفين):
 *   أ) بالراتب (الكل عدا الخياطين والمالك): سلفة (مع المأخوذ لا تتجاوز الراتب) / صرف المتبقي كله أو جزء.
 *      كل دفعة = مصروف رواتب (مدين SALARIES / دائن الخزينة أو البنك، بالجنيه).
 *   ب) الخياطين: مستحقات الشهر، المأخوذ (سلف + دفعات)، المتبقي؛ السداد والسلفة
 *      تُخصم من مستحقات الخياطين (ليست مصروفًا).
 */

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LuFileText, LuHandCoins, LuScissors, LuUsers, LuWalletCards } from "react-icons/lu";

import { serverFetch } from "@/lib/api-client";
import { formatSDG } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import {
  getTailorStatement,
  payTailorDues,
} from "@/app/dashboard/accounting/services/accounting.services";
import type { TailorStatement } from "@/app/dashboard/accounting/schemas/accounting.schema";
import TailorStatementModal from "./TailorStatementModal";
import type {
  PayrollEmployeeRow,
  PayrollMonth,
  PayrollTailorRow,
} from "@/app/api/payroll/_lib/payroll";

type Tab = "employees" | "tailors";

type PayTarget =
  | { kind: "EMPLOYEE"; row: PayrollEmployeeRow; type: "ADVANCE" | "SALARY" }
  | { kind: "TAILOR"; row: PayrollTailorRow; type: "ADVANCE" | "SETTLEMENT" };

const ROLE_LABELS: Record<string, string> = {
  owner: "المالك",
  admin: "المدير",
  cashier: "الكاشير",
};

function monthLabel(period: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { year: "numeric", month: "long" }).format(
    new Date(`${period}T00:00:00`),
  );
}

export default function PayrollClient({ data, initialTab }: { data: PayrollMonth; initialTab: Tab }) {
  const router = useRouter();
  const pathname = usePathname();
  const idempotency = useIdempotencyKey();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [target, setTarget] = useState<PayTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "BANK">("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statement, setStatement] = useState<TailorStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState<string | null>(null);

  async function openStatement(tailorId: string) {
    setStatementLoading(tailorId);
    try {
      const { data: result } = await getTailorStatement(tailorId);
      setStatement(result);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر جلب كشف الخياط.");
    } finally {
      setStatementLoading(null);
    }
  }

  const month = data.period.slice(0, 7);

  function navigate(next: { period?: string; tab?: Tab }) {
    const params = new URLSearchParams({ period: next.period ?? month, tab: next.tab ?? tab });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function open(next: PayTarget) {
    setTarget(next);
    setAmount(
      next.type === "ADVANCE" ? "" : next.row.remainingSdg.toFixed(2),
    );
    setMethod("CASH");
    setNotes("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    if (value > target.row.remainingSdg) {
      toast.error(`المبلغ يتجاوز المتبقي (${formatSDG(target.row.remainingSdg)}).`);
      return;
    }

    setSaving(true);
    try {
      if (target.kind === "EMPLOYEE") {
        const payload = {
          employeeId: target.row.userId,
          period: data.period,
          type: target.type,
          amount: value,
          paymentMethod: method,
          notes: notes.trim() || null,
        };
        const response = await serverFetch<{ message?: string }>("/api/payroll", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Idempotency-Key": idempotency.keyFor(payload) },
        });
        toast.success(response.message ?? "تم التسجيل.");
      } else {
        const payload = {
          tailorId: target.row.tailorId,
          kind: target.type,
          amount: target.type === "SETTLEMENT" ? target.row.remainingSdg : value,
          paymentMethod: method,
          notes: notes.trim() || null,
        };
        const response = await payTailorDues(payload, { idempotencyKey: idempotency.keyFor(payload) });
        toast.success(response.message ?? "تم التسجيل.");
      }
      idempotency.reset();
      setTarget(null);
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفعة.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    target?.kind === "EMPLOYEE"
      ? target.type === "ADVANCE"
        ? `سلفة للموظف ${target.row.name}`
        : `صرف راتب ${target.row.name}`
      : target
        ? target.type === "ADVANCE"
          ? `سلفة للخياط ${target.row.name}`
          : `سداد مستحقات ${target.row.name}`
        : "";

  return (
    <main dir="rtl" className="space-y-6 p-4 pb-12">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-950">السلف والمستحقات</h1>
          <p className="mt-1 text-sm text-gray-500">{monthLabel(data.period)}</p>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-gray-600">الشهر</span>
          <input
            type="month"
            value={month}
            onChange={(event) => event.target.value && navigate({ period: event.target.value })}
            className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(
          [
            ["employees", "بالراتب", LuUsers],
            ["tailors", "الخياطين", LuScissors],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              navigate({ tab: id });
            }}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
              tab === id ? "border-(--primary-red) text-(--primary-red)" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          {tab === "employees" ? (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right">الموظف</th>
                  <th className="px-4 py-3 text-right">الراتب</th>
                  <th className="px-4 py-3 text-right">السلف</th>
                  <th className="px-4 py-3 text-right">المدفوع</th>
                  <th className="px-4 py-3 text-right">المتبقي</th>
                  <th className="px-4 py-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.employees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      لا يوجد موظفون بالراتب.
                    </td>
                  </tr>
                )}
                {data.employees.map((row) => (
                  <tr key={row.userId} className={row.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">{ROLE_LABELS[row.role] ?? row.role}{row.isActive ? "" : " — غير نشط"}</p>
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">{formatSDG(row.salarySdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right text-amber-700">{formatSDG(row.advancesSdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right text-emerald-700">{formatSDG(row.salaryPaidSdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right font-black">{formatSDG(row.remainingSdg)}</td>
                    <td className="px-4 py-3">
                      {row.remainingSdg > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => open({ kind: "EMPLOYEE", row, type: "SALARY" })} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white">
                            <LuWalletCards className="h-3.5 w-3.5" /> صرف الراتب
                          </button>
                          <button type="button" onClick={() => open({ kind: "EMPLOYEE", row, type: "ADVANCE" })} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                            <LuHandCoins className="h-3.5 w-3.5" /> سلفة
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right">الخياط</th>
                  <th className="px-4 py-3 text-right">مستحقات الشهر</th>
                  <th className="px-4 py-3 text-right">المأخوذ (سلف + دفعات)</th>
                  <th className="px-4 py-3 text-right">المتبقي (كل الشهور)</th>
                  <th className="px-4 py-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.tailors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">لا يوجد خياطون.</td>
                  </tr>
                )}
                {data.tailors.map((row) => (
                  <tr key={row.tailorId} className={row.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{row.name}</p>
                      {!row.isActive && <p className="text-xs text-gray-400">غير نشط</p>}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">{formatSDG(row.monthDuesSdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right">
                      {formatSDG(row.monthTakenSdg)}
                      <span className="block text-[10px] text-amber-700">سلف: {formatSDG(row.monthAdvancesSdg)}</span>
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right font-black">{formatSDG(row.remainingSdg)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openStatement(row.tailorId)}
                          disabled={statementLoading === row.tailorId}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <LuFileText className="h-3.5 w-3.5" />
                          {statementLoading === row.tailorId ? "جارٍ التحميل..." : "كشف"}
                        </button>
                      {row.remainingSdg > 0 && (
                        <>
                          <button type="button" onClick={() => open({ kind: "TAILOR", row, type: "SETTLEMENT" })} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white">
                            <LuWalletCards className="h-3.5 w-3.5" /> سداد كامل
                          </button>
                          <button type="button" onClick={() => open({ kind: "TAILOR", row, type: "ADVANCE" })} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                            <LuHandCoins className="h-3.5 w-3.5" /> سلفة
                          </button>
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {statement && <TailorStatementModal statement={statement} onClose={() => setStatement(null)} />}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submit} dir="rtl" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl" noValidate>
            <h3 className="text-sm font-black">{title}</h3>
            <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              المتبقي: <strong>{formatSDG(target.row.remainingSdg)}</strong>
              <span className="mt-1 block">
                {target.kind === "EMPLOYEE"
                  ? "مصروف رواتب بالجنيه (مدين الرواتب / دائن الخزينة أو البنك)."
                  : "يُخصم من مستحقات الخياط (ليس مصروفًا)."}
              </span>
            </p>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">المبلغ (ج.س)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                readOnly={target.kind === "TAILOR" && target.type === "SETTLEMENT"}
                disabled={saving}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm read-only:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">طريقة الدفع</span>
              <select value={method} onChange={(event) => setMethod(event.target.value as "CASH" | "BANK")} disabled={saving} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm">
                <option value="CASH">نقداً / الخزينة</option>
                <option value="BANK">حوالة / البنك</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">ملاحظات</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} disabled={saving} className="mt-1 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={saving} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-gray-900 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {saving ? "جارٍ الحفظ..." : "تأكيد"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

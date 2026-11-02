"use client";

/**
 * الموظفين — الرواتب والسلف:
 *   أ) الموظفون (عدا الخياطين والمالك): رصيد السلف لكل موظف وما دُفع له هذا الشهر.
 *      السلفة مبلغ مفتوح غير مرتبط بالراتب (أصل EMPLOYEE_ADVANCES) وتُسترد؛ الراتب بأي مبلغ.
 *   ب) الخياطون: رصيد المستحقات ورصيد السلف منفصلان. السلفة مبلغ مفتوح (TAILOR_ADVANCES) يُسترد
 *      نقدًا أو يُخصم عند دفع المستحقات بمبلغ يحدده المستخدم؛ لا خصم تلقائي.
 */

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import { LuFileText, LuHandCoins, LuPercent, LuScissors, LuUndo2, LuUsers, LuWalletCards } from "react-icons/lu";

import { formatSDG } from "@/lib/currency";
import { getTailorStatement } from "@/app/dashboard/accounting/services/accounting.services";
import type { TailorStatement } from "@/app/dashboard/accounting/schemas/accounting.schema";
import TailorStatementModal from "./TailorStatementModal";
import EmployeePayModal, { type EmployeePayType } from "./EmployeePayModal";
import TailorPayModal, { type TailorPayType } from "./TailorPayModal";
import type {
  PayrollEmployeeRow,
  PayrollMonth,
  PayrollTailorRow,
} from "@/app/api/payroll/_lib/payroll";

type Tab = "employees" | "tailors";

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

  const [tab, setTab] = useState<Tab>(initialTab);
  const [tailorModal, setTailorModal] = useState<{ row: PayrollTailorRow; type: TailorPayType } | null>(null);
  const [employeeModal, setEmployeeModal] = useState<{ row: PayrollEmployeeRow; type: EmployeePayType } | null>(null);
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

  return (
    <main dir="rtl" className="space-y-6 p-4 pb-12">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-950">الموظفين</h1>
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
                  <th className="px-4 py-3 text-right">الراتب (مقترح)</th>
                  <th className="px-4 py-3 text-right">رصيد السلف</th>
                  <th className="px-4 py-3 text-right">سلف هذا الشهر</th>
                  <th className="px-4 py-3 text-right">رواتب هذا الشهر</th>
                  <th className="px-4 py-3 text-right">عمولات هذا الشهر</th>
                  <th className="px-4 py-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.employees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      لا يوجد موظفون.
                    </td>
                  </tr>
                )}
                {data.employees.map((row) => (
                  <tr key={row.userId} className={row.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/employees/${row.userId}`} className="font-bold text-gray-900 hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-xs text-gray-400">{ROLE_LABELS[row.role] ?? row.role}{row.isActive ? "" : " — غير نشط"}</p>
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">{row.salarySdg > 0 ? formatSDG(row.salarySdg) : "—"}</td>
                    <td dir="ltr" className={`px-4 py-3 text-right font-black ${row.advanceBalanceSdg > 0 ? "text-amber-700" : "text-gray-500"}`}>
                      {formatSDG(row.advanceBalanceSdg)}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">
                      {formatSDG(row.advancesMonthSdg)}
                      {row.returnedMonthSdg > 0 && (
                        <span className="block text-[10px] text-emerald-700">مسترد: {formatSDG(row.returnedMonthSdg)}</span>
                      )}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right text-emerald-700">
                      {formatSDG(row.salaryPaidSdg)}
                      {row.deductedMonthSdg > 0 && (
                        <span className="block text-[10px] text-amber-700">مخصوم من السلف: {formatSDG(row.deductedMonthSdg)}</span>
                      )}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">{formatSDG(row.commissionPaidSdg)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setEmployeeModal({ row, type: "SALARY" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white">
                          <LuWalletCards className="h-3.5 w-3.5" /> دفع راتب
                        </button>
                        <button type="button" onClick={() => setEmployeeModal({ row, type: "ADVANCE" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800">
                          <LuHandCoins className="h-3.5 w-3.5" /> سلفة
                        </button>
                        <button type="button" onClick={() => setEmployeeModal({ row, type: "COMMISSION" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-bold text-blue-800">
                          <LuPercent className="h-3.5 w-3.5" /> عمولة
                        </button>
                        {row.advanceBalanceSdg > 0 && (
                          <button type="button" onClick={() => setEmployeeModal({ row, type: "ADVANCE_RETURN" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                            <LuUndo2 className="h-3.5 w-3.5" /> استرداد
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right">الخياط</th>
                  <th className="px-4 py-3 text-right">مستحقات الشهر</th>
                  <th className="px-4 py-3 text-right">المدفوع من المستحقات هذا الشهر</th>
                  <th className="px-4 py-3 text-right">رصيد المستحقات (كل الشهور)</th>
                  <th className="px-4 py-3 text-right">رصيد السلف</th>
                  <th className="px-4 py-3 text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.tailors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">لا يوجد خياطون.</td>
                  </tr>
                )}
                {data.tailors.map((row) => (
                  <tr key={row.tailorId} className={row.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/employees/${row.tailorId}`} className="font-bold text-gray-900 hover:underline">
                        {row.name}
                      </Link>
                      {!row.isActive && <p className="text-xs text-gray-400">غير نشط</p>}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-right">{formatSDG(row.monthDuesSdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right">{formatSDG(row.monthTakenSdg)}</td>
                    <td dir="ltr" className="px-4 py-3 text-right font-black">{formatSDG(row.remainingSdg)}</td>
                    <td dir="ltr" className={`px-4 py-3 text-right font-black ${row.advanceBalanceSdg > 0 ? "text-amber-700" : "text-gray-500"}`}>
                      {formatSDG(row.advanceBalanceSdg)}
                      {row.orderAdvancesSdg > 0 && (
                        <span className="block text-[10px] font-normal text-gray-500">
                          + سلف طلبات لم تُسلَّم: {formatSDG(row.orderAdvancesSdg)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openStatement(row.tailorId)}
                          disabled={statementLoading === row.tailorId}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <LuFileText className="h-3.5 w-3.5" />
                          {statementLoading === row.tailorId ? "جارٍ التحميل..." : "كشف"}
                        </button>
                        {row.remainingSdg > 0 && (
                          <button type="button" onClick={() => setTailorModal({ row, type: "SETTLEMENT" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white">
                            <LuWalletCards className="h-3.5 w-3.5" /> دفع مستحقات
                          </button>
                        )}
                        <button type="button" onClick={() => setTailorModal({ row, type: "ADVANCE" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800">
                          <LuHandCoins className="h-3.5 w-3.5" /> سلفة
                        </button>
                        {row.advanceBalanceSdg > 0 && (
                          <button type="button" onClick={() => setTailorModal({ row, type: "ADVANCE_RETURN" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                            <LuUndo2 className="h-3.5 w-3.5" /> استرداد
                          </button>
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

      {employeeModal && (
        <EmployeePayModal
          employee={employeeModal.row}
          type={employeeModal.type}
          period={data.period}
          onClose={() => setEmployeeModal(null)}
          onDone={() => {
            setEmployeeModal(null);
            router.refresh();
          }}
        />
      )}

      {tailorModal && (
        <TailorPayModal
          tailor={tailorModal.row}
          type={tailorModal.type}
          onClose={() => setTailorModal(null)}
          onDone={() => {
            setTailorModal(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

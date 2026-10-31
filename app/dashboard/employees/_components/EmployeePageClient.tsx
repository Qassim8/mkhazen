"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuHandCoins, LuPercent, LuUndo2, LuWalletCards } from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import { formatSDG } from "@/lib/currency";
import type { EmployeeMovement, EmployeeProfile } from "@/app/api/payroll/_lib/payroll";

import EmployeePayModal, { type EmployeePayType } from "../payroll/_components/EmployeePayModal";

interface Props {
  profile: EmployeeProfile;
  /** YYYY-MM-01 (الشهر الحالي) */
  period: string;
  summary: {
    advanceBalanceSdg: number;
    advancesMonthSdg: number;
    returnedMonthSdg: number;
    deductedMonthSdg: number;
    salaryPaidSdg: number;
    commissionPaidSdg: number;
  };
  movements: EmployeeMovement[];
}

const TYPE_LABELS: Record<EmployeeMovement["type"], string> = {
  ADVANCE: "سلفة",
  ADVANCE_RETURN: "استرداد سلفة",
  SALARY: "راتب",
  COMMISSION: "عمولة (نسبة من الأرباح)",
};

const TYPE_TONES: Record<EmployeeMovement["type"], string> = {
  ADVANCE: "bg-amber-50 text-amber-800",
  ADVANCE_RETURN: "bg-emerald-50 text-emerald-800",
  SALARY: "bg-gray-100 text-gray-800",
  COMMISSION: "bg-blue-50 text-blue-800",
};

const ROLE_LABELS: Record<string, string> = { owner: "المالك", admin: "المدير", cashier: "الكاشير" };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Card({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone ?? "text-gray-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function EntryLink({ number }: { number: string | null }) {
  if (!number) return null;
  return (
    <Link
      href={`/dashboard/accounting/journals?search=${encodeURIComponent(number)}`}
      dir="ltr"
      className="block font-mono text-[11px] font-bold text-gray-700 underline"
    >
      {number}
    </Link>
  );
}

export default function EmployeePageClient({ profile, period, summary, movements }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<EmployeePayType | null>(null);

  const target = {
    userId: profile.id,
    name: profile.name,
    salarySdg: profile.salarySdg,
    advanceBalanceSdg: summary.advanceBalanceSdg,
  };

  return (
    <div dir="rtl" className="space-y-6 pb-12">
      <BackLink href="/dashboard/employees" label="العودة إلى الموظفين" />

      <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-950">{profile.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {ROLE_LABELS[profile.role] ?? profile.role}
            {profile.phone ? ` — ${profile.phone}` : ""}
            {profile.isActive ? "" : " — غير نشط"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ADVANCE", "سلفة", LuHandCoins, "border border-amber-300 bg-amber-50 text-amber-800"],
              ["ADVANCE_RETURN", "استرداد", LuUndo2, "border border-emerald-300 bg-emerald-50 text-emerald-800"],
              ["SALARY", "دفع راتب", LuWalletCards, "bg-gray-900 text-white"],
              ["COMMISSION", "عمولة", LuPercent, "border border-blue-300 bg-blue-50 text-blue-800"],
            ] as const
          ).map(([type, label, Icon, tone]) => (
            <button
              key={type}
              type="button"
              disabled={type === "ADVANCE_RETURN" && summary.advanceBalanceSdg <= 0}
              onClick={() => setModal(type)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label="الراتب"
          value={profile.salarySdg > 0 ? formatSDG(profile.salarySdg) : "غير محدد"}
          hint="اقتراح فقط؛ يُصرف أي مبلغ في أي وقت"
        />
        <Card
          label="رصيد السلف"
          value={formatSDG(summary.advanceBalanceSdg)}
          tone={summary.advanceBalanceSdg > 0 ? "text-amber-700" : undefined}
          hint="السلف − المسترد − المخصوم"
        />
        <Card
          label="المدفوع هذا الشهر"
          value={formatSDG(summary.salaryPaidSdg + summary.commissionPaidSdg)}
          tone="text-emerald-700"
          hint={`رواتب ${formatSDG(summary.salaryPaidSdg)} — عمولات ${formatSDG(summary.commissionPaidSdg)}`}
        />
        <Card
          label="سلف هذا الشهر"
          value={formatSDG(summary.advancesMonthSdg)}
          hint={`مسترد ${formatSDG(summary.returnedMonthSdg)} — مخصوم ${formatSDG(summary.deductedMonthSdg)}`}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-gray-900">سجل الحركات</h2>

        {movements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            لا توجد حركات لهذا الموظف بعد
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-225 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">النوع</th>
                  <th className="px-4 py-3 text-right font-bold">الفترة</th>
                  <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                  <th className="px-4 py-3 text-right font-bold">الأثر على السلف</th>
                  <th className="px-4 py-3 text-right font-bold">ملاحظات</th>
                  <th className="px-4 py-3 text-right font-bold">القيود</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((movement) => (
                  <tr key={movement.id} className="align-top">
                    <td className="px-4 py-3 text-gray-600">
                      {dateTime(movement.createdAt)}
                      {movement.createdByName && <span className="block text-[11px] text-gray-400">{movement.createdByName}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TYPE_TONES[movement.type]}`}>
                        {TYPE_LABELS[movement.type]}
                      </span>
                      {movement.isLegacy && (
                        <span className="mt-1 block text-[11px] text-gray-400">سلفة قديمة (سُجّلت كمصروف رواتب)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{movement.period.slice(0, 7)}</td>
                    <td className="px-4 py-3 font-black">
                      {formatSDG(movement.amount)}
                      <span className="block text-[11px] font-normal text-gray-400">
                        {movement.paymentMethod === "BANK" ? "البنك" : "الخزينة"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold">
                      {movement.isLegacy ? (
                        <span className="text-gray-400">لا أثر</span>
                      ) : movement.type === "ADVANCE" ? (
                        <span className="text-amber-700">+ {formatSDG(movement.amount)}</span>
                      ) : movement.type === "ADVANCE_RETURN" ? (
                        <span className="text-emerald-700">− {formatSDG(movement.amount)}</span>
                      ) : movement.type === "SALARY" && movement.deductedAmount > 0 ? (
                        <span className="text-emerald-700">
                          − {formatSDG(movement.deductedAmount)}
                          <span className="block font-normal text-gray-500">
                            صافي مدفوع {formatSDG(movement.amount - movement.deductedAmount)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">لا أثر</span>
                      )}
                    </td>
                    <td className="max-w-60 px-4 py-3 text-xs text-gray-600">{movement.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <EntryLink number={movement.entryNumber} />
                      {movement.deductionEntryNumber && movement.deductionEntryNumber !== movement.entryNumber && (
                        <EntryLink number={movement.deductionEntryNumber} />
                      )}
                      <EntryLink number={movement.fxEntryNumber} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <EmployeePayModal
          employee={target}
          type={modal}
          period={period}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

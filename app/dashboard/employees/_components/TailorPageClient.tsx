"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuHandCoins, LuUndo2, LuWalletCards } from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import { formatSDG } from "@/lib/currency";
import type {
  PayrollTailorRow,
  TailorAdvanceMovement,
  TailorDuesPayment,
  TailorProfile,
} from "@/app/api/payroll/_lib/payroll";

import TailorPayModal, { type TailorPayType } from "../payroll/_components/TailorPayModal";

interface Props {
  profile: TailorProfile;
  summary: Pick<
    PayrollTailorRow,
    | "monthDuesSdg"
    | "monthTakenSdg"
    | "remainingSdg"
    | "advanceBalanceSdg"
    | "orderAdvancesSdg"
    | "advancesMonthSdg"
    | "returnedMonthSdg"
    | "deductedMonthSdg"
  >;
  movements: TailorAdvanceMovement[];
  payments: TailorDuesPayment[];
}

const MOVEMENT_LABELS: Record<TailorAdvanceMovement["type"], string> = {
  ADVANCE: "سلفة",
  RETURN: "استرداد نقدي",
  DEDUCTION: "خصم من المستحقات",
};

const MOVEMENT_TONES: Record<TailorAdvanceMovement["type"], string> = {
  ADVANCE: "bg-amber-50 text-amber-800",
  RETURN: "bg-emerald-50 text-emerald-800",
  DEDUCTION: "bg-blue-50 text-blue-800",
};

const PAYMENT_LABELS: Record<string, string> = {
  SETTLEMENT: "سداد مستحقات",
  DUES_ADVANCE: "سلفة قديمة (خُصمت من المستحقات)",
  ADVANCE: "دفعة مقدمة لطلب",
};

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

/** صفحة الخياط: رصيد المستحقات ورصيد السلف منفصلان، والأزرار، وسجل كامل بروابط القيود */
export default function TailorPageClient({ profile, summary, movements, payments }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<TailorPayType | null>(null);

  const target = {
    tailorId: profile.id,
    name: profile.name,
    remainingSdg: summary.remainingSdg,
    advanceBalanceSdg: summary.advanceBalanceSdg,
  };

  return (
    <div dir="rtl" className="space-y-6 pb-12">
      <BackLink href="/dashboard/employees" label="العودة إلى الموظفين" />

      <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-950">{profile.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            خياط{profile.phone ? ` — ${profile.phone}` : ""}
            {profile.isActive ? "" : " — غير نشط"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={summary.remainingSdg <= 0}
            onClick={() => setModal("SETTLEMENT")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuWalletCards className="h-4 w-4" />
            دفع مستحقات
          </button>
          <button
            type="button"
            onClick={() => setModal("ADVANCE")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-800"
          >
            <LuHandCoins className="h-4 w-4" />
            سلفة
          </button>
          <button
            type="button"
            disabled={summary.advanceBalanceSdg <= 0}
            onClick={() => setModal("ADVANCE_RETURN")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuUndo2 className="h-4 w-4" />
            استرداد
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label="رصيد المستحقات"
          value={formatSDG(summary.remainingSdg)}
          tone={summary.remainingSdg > 0 ? "text-rose-700" : undefined}
          hint="أجرة طلباته المثبتة − ما دُفع له (كل الشهور)"
        />
        <Card
          label="رصيد السلف"
          value={formatSDG(summary.advanceBalanceSdg)}
          tone={summary.advanceBalanceSdg > 0 ? "text-amber-700" : undefined}
          hint="السلف − المسترد نقدًا − المخصوم من المستحقات"
        />
        <Card
          label="مستحقات هذا الشهر"
          value={formatSDG(summary.monthDuesSdg)}
          hint={`المدفوع منها: ${formatSDG(summary.monthTakenSdg)}`}
        />
        <Card
          label="سلف هذا الشهر"
          value={formatSDG(summary.advancesMonthSdg)}
          hint={`مسترد ${formatSDG(summary.returnedMonthSdg)} — مخصوم ${formatSDG(summary.deductedMonthSdg)}`}
        />
      </section>

      {summary.orderAdvancesSdg > 0 && (
        <p className="-mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          إضافة إلى الرصيد أعلاه: سلف قديمة مربوطة بطلبات لم تُسلَّم بقيمة <strong>{formatSDG(summary.orderAdvancesSdg)}</strong>
          ، تُخصم تلقائيًا من أجرة طلبها عند التسليم كما كانت، ولا يشملها الاسترداد ولا الخصم اليدوي.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-black text-gray-900">سجل السلف</h2>

        {movements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            لا توجد حركات سلف بعد
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-175 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">النوع</th>
                  <th className="px-4 py-3 text-right font-bold">المبلغ</th>
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
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${MOVEMENT_TONES[movement.type]}`}>
                        {MOVEMENT_LABELS[movement.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-black">
                      {movement.type === "ADVANCE" ? "+ " : "− "}
                      {formatSDG(movement.amount)}
                      {movement.paymentMethod && (
                        <span className="block text-[11px] font-normal text-gray-400">
                          {movement.paymentMethod === "BANK" ? "البنك" : "الخزينة"}
                        </span>
                      )}
                    </td>
                    <td className="max-w-60 px-4 py-3 text-xs text-gray-600">{movement.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      {movement.entryNumbers.map((number) => (
                        <EntryLink key={number} number={number} />
                      ))}
                      <EntryLink number={movement.fxEntryNumber} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-gray-900">سجل مدفوعات المستحقات</h2>

        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            لا توجد مدفوعات مستحقات بعد
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-175 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">النوع</th>
                  <th className="px-4 py-3 text-right font-bold">الطلب</th>
                  <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                  <th className="px-4 py-3 text-right font-bold">القيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <tr key={payment.id} className="align-top">
                    <td className="px-4 py-3 text-gray-600">{dateTime(payment.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {payment.isAdvanceDeduction ? "خصم من رصيد السلف" : (PAYMENT_LABELS[payment.paymentType] ?? payment.paymentType)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700" dir="ltr">
                      {payment.orderNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-black">
                      {formatSDG(payment.amountSdg)}
                      <span className="block text-[11px] font-normal text-gray-400">
                        {payment.isAdvanceDeduction ? "من رصيد السلف" : payment.paymentMethod === "BANK" ? "البنك" : "الخزينة"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <EntryLink number={payment.entryNumber} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <TailorPayModal
          tailor={target}
          type={modal}
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

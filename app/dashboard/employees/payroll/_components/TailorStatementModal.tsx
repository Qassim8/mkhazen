"use client";

/** كشف الخياط: طلباته المثبتة، والمدفوعات، والسلف (منفصلة) */

import { LuX } from "react-icons/lu";

import { formatSDG, formatUSD } from "@/lib/currency";
import type { TailorStatement } from "@/app/dashboard/accounting/schemas/accounting.schema";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  SETTLEMENT: "سداد مستحقات",
  DUES_ADVANCE: "سلفة",
  ADVANCE: "دفعة مقدمة (قبل التثبيت)",
};

function dateTimeLabel(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Khartoum",
  }).format(new Date(value));
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {children}
    </div>
  );
}

export default function TailorStatementModal({
  statement,
  onClose,
}: {
  statement: TailorStatement;
  onClose: () => void;
}) {
  return (
    <ModalShell>
      <div dir="rtl" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black">كشف الخياط {statement.summary.tailorName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "الأجرة المستحقة", value: statement.summary.costSdg, cls: "text-gray-950" },
            { label: "المدفوع", value: statement.summary.paidSdg, cls: "text-emerald-700" },
            { label: "السلف", value: statement.summary.advancesSdg, cls: "text-amber-700" },
            { label: "المتبقي", value: statement.summary.remainingSdg, cls: "text-red-600" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">{card.label}</p>
              <p dir="ltr" className={`mt-1 text-right text-sm font-black ${card.cls}`}>
                {formatSDG(card.value)}
              </p>
            </div>
          ))}
        </div>

        <h4 className="mb-2 mt-5 text-sm font-black">الطلبات المثبتة تكلفتها</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-right">الطلب</th>
                <th className="px-3 py-2 text-right">تاريخ التثبيت</th>
                <th className="px-3 py-2 text-right">الأجرة</th>
                <th className="px-3 py-2 text-right">المدفوع</th>
                <th className="px-3 py-2 text-right">السلف</th>
                <th className="px-3 py-2 text-right">المتبقي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {statement.orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">لا توجد طلبات مثبتة.</td>
                </tr>
              )}
              {statement.orders.map((order) => (
                <tr key={order.salesOrderId}>
                  <td className="px-3 py-2">
                    <a href={`/dashboard/tailoring/${order.salesOrderId}`} className="font-bold text-blue-700 hover:underline">
                      {order.orderNumber}
                    </a>
                    {order.itemName && <span className="block text-gray-400">{order.itemName}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{dateTimeLabel(order.costRecognizedAt)}</td>
                  <td dir="ltr" className="px-3 py-2 text-right">{formatSDG(order.costSdg)}</td>
                  <td dir="ltr" className="px-3 py-2 text-right text-emerald-700">{formatSDG(order.paidSdg)}</td>
                  <td dir="ltr" className="px-3 py-2 text-right text-amber-700">{formatSDG(order.advancesSdg)}</td>
                  <td dir="ltr" className="px-3 py-2 text-right font-black">{formatSDG(order.remainingSdg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(["SETTLEMENT", "DUES_ADVANCE"] as const).map((type) => {
          const rows = statement.payments.filter((payment) =>
            type === "SETTLEMENT" ? payment.paymentType !== "DUES_ADVANCE" : payment.paymentType === type,
          );
          return (
            <div key={type}>
              <h4 className="mb-2 mt-5 text-sm font-black">
                {type === "SETTLEMENT" ? "المدفوعات" : "السلف"}
              </h4>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                      <th className="px-3 py-2 text-right">النوع</th>
                      <th className="px-3 py-2 text-right">الطلب</th>
                      <th className="px-3 py-2 text-right">المبلغ</th>
                      <th className="px-3 py-2 text-right">الطريقة</th>
                      <th className="px-3 py-2 text-right">ملاحظات / المرجع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">لا يوجد.</td>
                      </tr>
                    )}
                    {rows.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-3 py-2 text-gray-500">{dateTimeLabel(payment.createdAt)}</td>
                        <td className="px-3 py-2 font-semibold">{PAYMENT_TYPE_LABELS[payment.paymentType]}</td>
                        <td className="px-3 py-2">{payment.orderNumber ?? "-"}</td>
                        <td dir="ltr" className="px-3 py-2 text-right font-black">
                          {formatSDG(payment.amountSdg)}
                          <span className="block text-[10px] font-semibold text-gray-400">≈ {formatUSD(payment.amountUsd)}</span>
                        </td>
                        <td className="px-3 py-2">{payment.paymentMethod === "BANK" ? "البنك" : "الخزينة"}</td>
                        <td className="px-3 py-2 text-gray-500">{payment.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}

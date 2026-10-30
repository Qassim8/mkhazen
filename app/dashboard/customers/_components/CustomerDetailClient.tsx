"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuPencil, LuPhone, LuScissors } from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import { formatSDG } from "@/lib/currency";

import type { CustomerDetail, CustomerOrderRow } from "../services/customers.services";
import { CustomerFormModal, DuplicateWarning } from "./CustomerModals";

const METHOD_LABELS: Record<string, string> = {
  CASH: "نقداً / الخزينة",
  CARD: "بطاقة",
  BANK_TRANSFER: "حوالة / البنك",
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function CustomerDetailClient({
  customer,
  canUpdate,
  canViewSales,
}: {
  customer: CustomerDetail;
  canUpdate: boolean;
  canViewSales: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const orderHref = (order: CustomerOrderRow) =>
    order.kind === "TAILORING"
      ? `/dashboard/tailoring/${order.id}`
      : canViewSales
        ? `/dashboard/sales/${order.id}`
        : `/dashboard/pos/receipt/${order.id}`;

  const { stats } = customer;

  return (
    <div dir="rtl" className="space-y-6 pb-12">
      <BackLink href="/dashboard/customers" label="العودة إلى العملاء" />

      <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-950">{customer.name}</h1>
          <a
            href={`https://wa.me/${customer.whatsappNumber.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
          >
            <LuPhone className="h-4 w-4" />
            {customer.whatsappNumber}
          </a>
          {customer.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{customer.notes}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/tailoring/new?customerId=${encodeURIComponent(customer.id)}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-(--primary-red)/30 bg-rose-50 px-4 text-sm font-bold text-(--primary-red) hover:bg-rose-100"
          >
            <LuScissors className="h-4 w-4" />
            طلب تفصيل
          </Link>
          {canUpdate && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <LuPencil className="h-4 w-4" />
              تعديل
            </button>
          )}
        </div>
      </header>

      <DuplicateWarning duplicates={customer.duplicates} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="عدد الفواتير" value={String(stats.invoiceCount)} />
        <Card label="إجمالي المشتريات" value={formatSDG(stats.totalPurchases)} />
        <Card label="إجمالي المدفوع" value={formatSDG(stats.totalPaid)} tone="text-emerald-700" />
        <Card
          label="متبقٍ على طلبات قيد التنفيذ"
          value={formatSDG(stats.tailoringInProgressRemaining)}
          tone={stats.tailoringInProgressRemaining > 0 ? "text-amber-700" : undefined}
        />
        <Card
          label="متبقٍ مستحق (سُلِّمت)"
          value={formatSDG(stats.tailoringDueRemaining)}
          tone={stats.tailoringDueRemaining > 0 ? "text-red-600" : undefined}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-gray-900">الفواتير والطلبات</h2>

        {customer.orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            لا توجد فواتير لهذا العميل بعد
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {customer.orders.map((order) => (
                <Link
                  key={order.id}
                  href={orderHref(order)}
                  className="block rounded-2xl border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p dir="ltr" className="text-left font-mono text-xs font-bold text-gray-900">
                        {order.orderNumber}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {order.kind === "TAILORING" ? `تفصيل${order.itemName ? ` — ${order.itemName}` : ""}` : "كاشير"} —{" "}
                        {formatDateTime(order.completedAt ?? order.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">
                      {order.statusLabel}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">الإجمالي</p>
                      <p className="font-bold">{formatSDG(order.total)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">المدفوع</p>
                      <p className="font-bold text-emerald-700">{formatSDG(order.paid)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">المتبقي</p>
                      <p className={`font-bold ${order.remaining > 0 ? "text-amber-700" : ""}`}>{formatSDG(order.remaining)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
              <table className="w-full min-w-200 text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-right font-bold">الرقم</th>
                    <th className="px-4 py-3 text-right font-bold">النوع</th>
                    <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                    <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                    <th className="px-4 py-3 text-right font-bold">المدفوع</th>
                    <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                    <th className="px-4 py-3 text-right font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customer.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <Link href={orderHref(order)} dir="ltr" className="font-mono text-xs font-bold text-gray-900 underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {order.kind === "TAILORING" ? "تفصيل" : "كاشير"}
                        {order.itemName && <span className="block text-[11px] text-gray-400">{order.itemName}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDateTime(order.completedAt ?? order.createdAt)}</td>
                      <td className="px-4 py-3 font-bold">{formatSDG(order.total)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{formatSDG(order.paid)}</td>
                      <td className={`px-4 py-3 font-bold ${order.remaining > 0 ? "text-amber-700" : "text-gray-500"}`}>
                        {formatSDG(order.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                          {order.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-gray-900">سجل الدفعات</h2>

        {customer.payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            لا توجد دفعات مسجلة
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-150 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">الفاتورة</th>
                  <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                  <th className="px-4 py-3 text-right font-bold">الطريقة</th>
                  <th className="px-4 py-3 text-right font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(payment.paymentDate)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900" dir="ltr">
                      {payment.orderNumber}
                    </td>
                    <td className="px-4 py-3 font-black">{formatSDG(payment.amount)}</td>
                    <td className="px-4 py-3 text-gray-700">{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{payment.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <CustomerFormModal
          customer={{
            id: customer.id,
            name: customer.name,
            whatsappNumber: customer.whatsappNumber,
            notes: customer.notes,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

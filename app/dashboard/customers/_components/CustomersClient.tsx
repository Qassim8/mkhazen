"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { LuPencil, LuPhone, LuScissors, LuTrash2 } from "react-icons/lu";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { formatSDG } from "@/lib/currency";

import {
  deleteCustomer,
  type CustomerRecord,
  type CustomersMeta,
  type DuplicateGroup,
} from "../services/customers.services";
import { ConfirmModal, CustomerFormModal } from "./CustomerModals";
import DuplicatesSection from "./DuplicatesSection";

interface Props {
  customers: CustomerRecord[];
  meta: CustomersMeta;
  canDelete: boolean;
  duplicateGroups: DuplicateGroup[];
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function CustomersClient({ customers, meta, canDelete, duplicateGroups }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<{ customer: CustomerRecord | null } | null>(null);
  const [deleting, setDeleting] = useState<CustomerRecord | null>(null);

  const refresh = () => router.refresh();

  const rowActions = (customer: CustomerRecord) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={`/dashboard/customers/${customer.id}`}
        className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
      >
        التفاصيل
      </Link>
      <button
        type="button"
        onClick={() => setForm({ customer })}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 md:min-h-9"
      >
        <LuPencil className="h-3.5 w-3.5" />
        تعديل
      </button>
      <Link
        href={`/dashboard/tailoring/new?customerId=${encodeURIComponent(customer.id)}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-(--primary-red)/30 bg-rose-50 px-3 text-xs font-bold text-(--primary-red) hover:bg-rose-100 md:min-h-9"
      >
        <LuScissors className="h-3.5 w-3.5" />
        طلب تفصيل
      </Link>
      {canDelete && (
        <button
          type="button"
          onClick={() => setDeleting(customer)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50 md:min-h-9"
        >
          <LuTrash2 className="h-3.5 w-3.5" />
          حذف
        </button>
      )}
    </div>
  );

  return (
    <div dir="rtl" className="space-y-5 pb-12">
      <PageHeader
        title="العملاء"
        subtitle="مركز واحد لعملاء الكاشير والتفصيل وفواتيرهم"
        buttonTitle="عميل جديد"
        redirect={() => setForm({ customer: null })}
      />

      <DuplicatesSection groups={duplicateGroups} onMerged={refresh} />

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar placeholder="بحث بالاسم أو الهاتف..." searchKey="search" />
          <ResetFilters />
        </div>
      </Suspense>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          لا يوجد عملاء مطابقون
        </div>
      ) : (
        <>
          {/* الجوال: بطاقات */}
          <div className="space-y-3 md:hidden">
            {customers.map((customer) => (
              <div key={customer.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <Link href={`/dashboard/customers/${customer.id}`} className="block">
                  <p className="font-black text-gray-900">{customer.name}</p>
                  <p dir="ltr" className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-gray-500">
                    {customer.whatsappNumber}
                    <LuPhone className="h-3 w-3" />
                  </p>
                </Link>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-400">الفواتير</dt>
                    <dd className="font-bold text-gray-800">{customer.invoiceCount}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">إجمالي المشتريات</dt>
                    <dd className="font-bold text-gray-800">{formatSDG(customer.totalPurchases)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">آخر تعامل</dt>
                    <dd className="font-bold text-gray-800">{formatDate(customer.lastActivity)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">المتبقي (تفصيل)</dt>
                    <dd className={`font-bold ${customer.tailoringRemaining > 0 ? "text-amber-700" : "text-gray-800"}`}>
                      {formatSDG(customer.tailoringRemaining)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 border-t border-gray-100 pt-3">{rowActions(customer)}</div>
              </div>
            ))}
          </div>

          {/* الشاشات الأكبر: جدول */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full min-w-225 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الاسم</th>
                  <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                  <th className="px-4 py-3 text-right font-bold">عدد الفواتير</th>
                  <th className="px-4 py-3 text-right font-bold">إجمالي المشتريات</th>
                  <th className="px-4 py-3 text-right font-bold">آخر تعامل</th>
                  <th className="px-4 py-3 text-right font-bold">المتبقي على طلبات التفصيل</th>
                  <th className="px-4 py-3 text-right font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="font-black text-gray-900 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.notes && (
                        <p className="mt-0.5 max-w-60 truncate text-[11px] text-gray-400">{customer.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {customer.whatsappNumber}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">{customer.invoiceCount}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">{formatSDG(customer.totalPurchases)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(customer.lastActivity)}</td>
                    <td
                      className={`px-4 py-3 font-bold ${customer.tailoringRemaining > 0 ? "text-amber-700" : "text-gray-500"}`}
                    >
                      {formatSDG(customer.tailoringRemaining)}
                    </td>
                    <td className="px-4 py-3">{rowActions(customer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
        <Pagination meta={meta} />
      </Suspense>

      {form && (
        <CustomerFormModal
          customer={form.customer}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="حذف العميل"
          confirmLabel="حذف نهائي"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              const result = await deleteCustomer(deleting.id);
              toast.success(result.message);
              setDeleting(null);
              refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "تعذر حذف العميل");
            }
          }}
          body={
            deleting.invoiceCount > 0 ? (
              <p>
                لا يمكن حذف «{deleting.name}» لأن له {deleting.invoiceCount} فاتورة. استخدم الدمج بدل الحذف.
              </p>
            ) : (
              <p>سيُحذف العميل «{deleting.name}» نهائيًا (مسموح لأنه بلا فواتير).</p>
            )
          }
        />
      )}
    </div>
  );
}

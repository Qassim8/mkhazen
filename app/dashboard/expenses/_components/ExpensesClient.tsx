"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import Table from "@/components/shared/Table";
import { formatMoney } from "@/lib/currency";

import type { MyExpense } from "../services/expenses.services";
import ExpenseModal from "./ExpenseModal";

const ACCOUNT_LABELS: Record<string, string> = {
  UTILITIES: "كهرباء / ماء / إنترنت",
  RENTS: "إيجار",
  MAINTENANCE: "صيانة",
  OTHER_EXPENSE: "مصروفات أخرى",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const columns: ColumnDef<MyExpense, unknown>[] = [
  {
    accessorKey: "createdAt",
    header: "التاريخ",
    cell: ({ row }) => (
      <span className="text-xs font-semibold text-gray-500">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "entryNumber",
    header: "رقم القيد",
    cell: ({ row }) => (
      <span dir="ltr" className="text-xs font-bold text-gray-700">
        {row.original.entryNumber}
      </span>
    ),
  },
  {
    accessorKey: "expenseAccount",
    header: "نوع المصروف",
    cell: ({ row }) => (
      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
        {ACCOUNT_LABELS[row.original.expenseAccount] ?? row.original.expenseAccount}
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: "البيان",
    cell: ({ row }) => (
      <span className="block max-w-72 truncate font-bold text-gray-900">
        {row.original.description || "-"}
      </span>
    ),
  },
  {
    accessorKey: "paymentMethod",
    header: "طريقة الدفع",
    cell: ({ row }) => (
      <span className="text-xs font-semibold text-gray-600">
        {row.original.paymentMethod === "BANK" ? "البنك" : "الخزينة"}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    header: "المبلغ",
    cell: ({ row }) => (
      <span dir="ltr" className="text-sm font-black text-gray-900">
        {formatMoney(row.original.amount, row.original.currency)}
      </span>
    ),
  },
];

interface Props {
  initialData: MyExpense[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  allowRent: boolean;
}

export default function ExpensesClient({ initialData, meta, allowRent }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="المصروفات"
        subtitle="تسجيل مصروف جديد وعرض مصروفاتك"
        buttonTitle="مصروف جديد"
        redirect={() => setShowModal(true)}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50/50 p-4">
          <h3 className="text-xs font-black text-gray-900">مصروفاتي</h3>
          <p className="mt-1 text-xs text-gray-500">المصروفات التي سجّلتها بحسابك</p>
        </div>

        {initialData.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">لا توجد مصروفات مسجلة</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table data={initialData} columns={columns} />
          </div>
        )}
      </div>

      <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
        <Pagination meta={meta} />
      </Suspense>

      {showModal && (
        <ExpenseModal
          allowRent={allowRent}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import Table from "@/components/shared/Table";
import { formatMoney } from "@/lib/currency";
import {
  PayableHistoryModal,
  PayPayableModal,
} from "@/app/dashboard/accounting/_components/PayableModals";

import type { MyExpense } from "../services/expenses.services";
import ExpenseModal from "./ExpenseModal";

const ACCOUNT_LABELS: Record<string, string> = {
  STAFF_DAILY_EXPENSES: "مصروفات الموظفين اليومية",
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

const SOURCE_LABELS: Record<MyExpense["source"], string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  CAPITAL: "دفعه المالك من ماله",
  PAYABLE: "مستحق على المحل",
};

/** الجزء المتبقي من مصروف مجزأ: المتبقي وزر الدفع وسجل الدفعات */
function PayableCell({ expense, onChanged }: { expense: MyExpense; onChanged: () => void }) {
  const [modal, setModal] = useState<"pay" | "history" | null>(null);
  const payable = expense.payable;

  if (!payable) {
    return <span className="text-xs font-semibold text-gray-600">{SOURCE_LABELS[expense.source]}</span>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-600">{SOURCE_LABELS.PAYABLE}</p>
      <p className="text-xs font-black text-amber-700">
        {payable.status === "OPEN"
          ? `المتبقي ${formatMoney(payable.remainingAmount, expense.currency)}`
          : "سُدِّد بالكامل"}
        {payable.status === "OPEN" && payable.dueDate && (
          <span className="block text-[10px] font-normal text-gray-400">يستحق {payable.dueDate}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {payable.status === "OPEN" && (
          <button
            type="button"
            onClick={() => setModal("pay")}
            className="min-h-9 rounded-lg bg-(--primary-red) px-2.5 text-[11px] font-bold text-white hover:opacity-90"
          >
            دفع
          </button>
        )}
        <button
          type="button"
          onClick={() => setModal("history")}
          className="min-h-9 rounded-lg border border-gray-200 px-2.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
        >
          السجل
        </button>
      </div>

      {modal === "pay" && (
        <PayPayableModal
          payable={{
            id: payable.id,
            description: expense.description || "مصروف",
            currency: expense.currency,
            remainingAmount: payable.remainingAmount,
          }}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {modal === "history" && (
        <PayableHistoryModal
          payableId={payable.id}
          title={expense.description || "مصروف"}
          canViewAccounting={false}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const columns = (onChanged: () => void): ColumnDef<MyExpense, unknown>[] => [
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
    cell: ({ row }) => <PayableCell expense={row.original} onChanged={onChanged} />,
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
            <Table data={initialData} columns={columns(() => router.refresh())} />
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

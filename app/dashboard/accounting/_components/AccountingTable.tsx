"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { LuArrowDownLeft, LuArrowUpRight } from "react-icons/lu";

import Table from "@/components/shared/Table";

import {
  JournalEntry,
  AccountingAccount,
  JournalEntryType,
} from "../schemas/accounting.schema";

interface AccountingTableProps {
  data: JournalEntry[];
}

const ACCOUNT_LABELS: Record<AccountingAccount, string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  INVENTORY: "المخزون",
  WORK_IN_PROGRESS: "إنتاج تحت التشغيل",
  SUPPLIERS: "الموردون",
  CAPITAL: "رأس المال",
  SALES: "المبيعات",
  CUSTOMER_ADVANCES: "عربون العملاء",
  TAILORS_PAYABLE: "مستحقات الخياطين",
  TAILOR_ADVANCES: "دفعات مقدمة للخياطين",
  COGS: "تكلفة المنتجات المباعة",
  ASSETS: "الأصول",
  UTILITIES: "الخدمات والمرافق",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  OTHER_EXPENSE: "مصروفات أخرى",
  OTHER_INCOME: "إيرادات أخرى",
  RENTS: "الإيجارات",
};

const ENTRY_TYPE_LABELS: Record<JournalEntryType, string> = {
  CAPITAL: "رأس مال",

  PURCHASE: "شراء",
  PURCHASE_PAYMENT: "دفع للمورد",

  SALE: "بيع",
  SALE_PAYMENT: "تحصيل بيع",

  CUSTOMER_ADVANCE: "عربون عميل",

  TAILOR_ADVANCE: "دفعة مقدمة للخياط",
  TAILOR_COST: "تكلفة الخياطة",
  TAILOR_ADVANCE_APPLICATION: "تسوية دفعة الخياط",
  TAILOR_PAYMENT: "سداد مستحق خياط",

  TAILORING_MATERIAL: "خامة طلب تفصيل",
  PRODUCTION: "تصنيع",

  COGS: "تكلفة المنتجات المباعة",

  INVENTORY_ADJUSTMENT: "تعديل المخزون",
  SALES_RETURN: "إرجاع مبيعات",

  EXPENSE: "مصروف",
  ASSET: "أصل",

  OTHER: "أخرى",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const columns: ColumnDef<JournalEntry, unknown>[] = [
  {
    accessorKey: "created_at",
    header: "التاريخ",
    cell: ({ getValue }) => (
      <span className="text-xs font-semibold text-gray-500">
        {formatDate(getValue() as string | undefined)}
      </span>
    ),
  },
  {
    accessorKey: "entry_number",
    header: "رقم القيد",
    cell: ({ getValue }) => (
      <span dir="ltr" className="text-xs font-bold text-gray-700">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: "entry_type",
    header: "النوع",
    cell: ({ getValue }) => {
      const type = getValue() as JournalEntryType;

      return (
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
          {ENTRY_TYPE_LABELS[type] ?? type}
        </span>
      );
    },
  },
  {
    accessorKey: "description",
    header: "البيان",
    cell: ({ getValue }) => (
      <span className="block max-w-65 truncate font-bold text-gray-900">
        {(getValue() as string | null) || "-"}
      </span>
    ),
  },
  {
    accessorKey: "debit_account",
    header: "المدين",
    cell: ({ getValue }) => {
      const account = getValue() as AccountingAccount;

      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
          <LuArrowDownLeft className="h-3.5 w-3.5" />
          {ACCOUNT_LABELS[account] ?? account}
        </span>
      );
    },
  },
  {
    accessorKey: "credit_account",
    header: "الدائن",
    cell: ({ getValue }) => {
      const account = getValue() as AccountingAccount;

      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          <LuArrowUpRight className="h-3.5 w-3.5" />
          {ACCOUNT_LABELS[account] ?? account}
        </span>
      );
    },
  },
  {
    accessorKey: "amount",
    header: "المبلغ",
    cell: ({ getValue }) => (
      <span dir="ltr" className="text-sm font-black text-gray-900">
        {formatNumber(getValue() as number)} ر.س
      </span>
    ),
  },
  {
    accessorKey: "reference",
    header: "المرجع",
    cell: ({ getValue }) => {
      const value = (getValue() as string | null) || "-";

      return (
        <span
          title={value}
          className="block max-w-40 truncate text-xs text-gray-500"
        >
          {value}
        </span>
      );
    },
  },
];

export default function AccountingTable({ data }: AccountingTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50/50 p-4">
        <h3 className="text-xs font-black text-gray-900">سجل قيود اليومية</h3>

        <p className="mt-1 text-xs text-gray-500">
          جميع العمليات المالية المسجلة
        </p>
      </div>

      {data.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-500">
          لا توجد قيود مسجلة
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <Table data={data} columns={columns} />
        </div>
      )}
    </div>
  );
}

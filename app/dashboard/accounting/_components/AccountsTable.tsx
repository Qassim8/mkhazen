"use client";
import Table from "@/components/shared/Table";
import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { LuFileText } from "react-icons/lu";
import { Account } from "@/types/types";

const mockAccounts: Account[] = [
  {
    id: "1",
    code: "1110",
    name: "الخزينة النقدية (الكاش)",
    type: "ASSET",
    balance: 4500,
  },
  {
    id: "2",
    code: "1120",
    name: "حساب تطبيق بنكك",
    type: "ASSET",
    balance: 12500,
  },
  {
    id: "3",
    code: "1140",
    name: "مخزون الأقمشة والثياب",
    type: "ASSET",
    balance: 35000,
  },
  {
    id: "4",
    code: "2110",
    name: "ذمم الموردين (ديون علينا)",
    type: "LIABILITY",
    balance: 8000,
  },
  {
    id: "5",
    code: "4110",
    name: "مبيعات الجاهز",
    type: "REVENUE",
    balance: 18500,
  },
  {
    id: "6",
    code: "5120",
    name: "مصروف إيجار المحل",
    type: "EXPENSE",
    balance: 1200,
  },
];

const AccountsTable = () => {
  const [accounts] = useState<Account[]>(mockAccounts);

  const columns: ColumnDef<Account>[] = [
    {
      accessorKey: "code",
      header: "رمز الحساب",
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-gray-500">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "اسم الحساب",
      cell: (info) => (
        <div className="flex items-center gap-2 font-bold text-gray-900">
          <LuFileText className="text-gray-400" />
          {info.getValue() as string}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "النوع",
      cell: (info) => {
        const type = info.getValue() as string;
        const labels: Record<string, { label: string; style: string }> = {
          ASSET: {
            label: "أصول",
            style: "bg-blue-50 text-blue-700 border-blue-200",
          },
          LIABILITY: {
            label: "التزامات",
            style: "bg-amber-50 text-amber-700 border-amber-200",
          },
          EQUITY: {
            label: "حقوق ملكية",
            style: "bg-purple-50 text-purple-700 border-purple-200",
          },
          REVENUE: {
            label: "إيرادات",
            style: "bg-emerald-50 text-emerald-700 border-emerald-200",
          },
          EXPENSE: {
            label: "مصروفات",
            style: "bg-red-50 text-red-700 border-red-200",
          },
        };
        const item = labels[type] || { label: type, style: "bg-gray-100" };
        return (
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${item.style}`}
          >
            {item.label}
          </span>
        );
      },
    },
    {
      accessorKey: "balance",
      header: "الرصيد الحالي",
      cell: (info) => (
        <span className="font-black text-gray-900">
          {(info.getValue() as number).toLocaleString("ar-SD", {
            minimumFractionDigits: 2,
          })}{" "}
          ج.س
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <Table data={accounts} columns={columns} />
    </div>
  );
};

export default AccountsTable;

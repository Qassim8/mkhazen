import Table from "@/components/shared/Table";
import React from "react";

import { ColumnDef } from "@tanstack/react-table";
import { FormattedTransaction } from "@/types/types";
import { mockJournalEntries } from "@/data/data";

const AccountingTable = () => {
  const columns: ColumnDef<FormattedTransaction>[] = [
    {
      accessorKey: "date",
      header: "التاريخ",
      cell: (info) => (
        <span className="text-xs font-semibold text-gray-500">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "البيان / الوصف",
      cell: (info) => (
        <span className="font-bold text-gray-900">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "debitAccount",
      header: "الحساب المدين (+)",
      cell: (info) => (
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "creditAccount",
      header: "الحساب الدائن (-)",
      cell: (info) => (
        <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "القيمة المالية",
      cell: (info) => (
        <span className="font-black text-sm text-gray-900">
          ${(info.getValue() as number).toFixed(2)}
        </span>
      ),
    },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-xs font-black text-gray-900">
          سجل قيود اليومية العامة (Journal Entries)
        </h3>
      </div>
      <Table data={mockJournalEntries} columns={columns} />
    </div>
  );
};

export default AccountingTable;

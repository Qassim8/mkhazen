"use client";

import Table from "@/components/shared/Table";
import { useTable } from "@/store/useTable";
import { Employee } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuSquarePen, LuTrash2 } from "react-icons/lu";
import { deleteEmployee } from "../services/employees.services";

const columnHelper = createColumnHelper<Employee>();

interface Props {
  initialData: Employee[];
}

const EmployeesTable = ({ initialData }: Props) => {
  const toggleMenu = useTable((state) => state.toggleOpenMenu);
  const showDeleteConfirmation = useTable(
    (state) => state.showDeleteConfirmation,
  );

  const columns = [
    columnHelper.accessor("name", {
      header: "الموظف",
      cell: (info) => (
        <div className="flex flex-col max-w-45">
          <span className="font-semibold text-gray-900 truncate">
            {info.getValue()}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {info.row.original.job}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("department", {
      header: "القسم",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-gray-700 text-sm">
          <span>{info.getValue()} pcs</span>
        </div>
      ),
    }),

    columnHelper.accessor("shift", {
      header: "الدوام",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor("salary", {
      header: "الراتب",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.accessor("status", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        const isActive = status === "active";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive
                ? "bg-emerald-100/50 text-emerald-800"
                : "bg-rose-100/50 text-rose-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {isActive ? "نشط" : "غير نشط"}
          </span>
        );
      },
    }),

    columnHelper.accessor("phone", {
      header: "الهاتف",
      cell: (info) => (
        <div
          className="flex items-center gap-1 text-sm text-gray-600 max-w-40"
          title={info.getValue()}
        >
          <span className="truncate">{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="عرض الموظف"
              className="rounded-lg p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleMenu(row.id)}
            >
              <LuEye className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="تعديل الموظف"
              className="rounded-lg p-1 text-blue-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleMenu(row.id)}
            >
              <LuSquarePen className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="حذف الموظف"
              className="rounded-lg p-1 text-red-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() =>
                showDeleteConfirmation(
                  row.original.id,
                  deleteEmployee,
                  row.original.name,
                )
              }
            >
              <LuTrash2 className="h-5 w-5" />
            </button>
          </div>
        );
      },
    }),
  ];

  return <Table data={initialData} columns={columns} />;
};

export default EmployeesTable;

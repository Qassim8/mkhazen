"use client";

import Table from "@/components/layout/Table";
import { employees } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Employee } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";

const columnHelper = createColumnHelper<Employee>();

const EmployeesTable = () => {
  const openMenuId = useTable((state) => state.openMenuId);
  const setOpenMenuId = useTable((state) => state.setOpenMenuId);
  const toggleMenu = useTable((state) => state.toggleOpenMenu);

  const columns = [
    columnHelper.accessor("name", {
      header: "Employee",
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
      header: "Department",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-gray-700 text-sm">
          <span>{info.getValue()} pcs</span>
        </div>
      ),
    }),

    columnHelper.accessor("shift", {
      header: "Shift",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.accessor("status", {
      header: "Status",
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
            {isActive ? "active" : "inactive"}
          </span>
        );
      },
    }),

    columnHelper.accessor("phone", {
      header: "phone",
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
        const isOpen = openMenuId === row.id;
        return (
          <div className="relative">
            <button
              type="button"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleMenu(row.id)}
            >
              <FiMoreHorizontal className="h-5 w-5" />
            </button>

            {isOpen && (
              <div className="absolute right-0 z-20 mt-2 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => setOpenMenuId(null)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      },
    }),
  ];

  return <Table data={employees} columns={columns} />;
};

export default EmployeesTable;

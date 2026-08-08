"use client";
import Table from "@/components/shared/Table";
import { movements } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Movement } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";
import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuCalendar,
  LuHash,
  LuRefreshCcw,
  LuUser,
} from "react-icons/lu";

const columnHelper = createColumnHelper<Movement>();

const MovementTable = () => {
  const openMenuId = useTable((state) => state.openMenuId);
  const setOpenMenuId = useTable((state) => state.setOpenMenuId);
  const toggleMenu = useTable((state) => state.toggleOpenMenu);

  const columns = [
    // 1. تاريخ الحركة
    columnHelper.accessor("date", {
      header: "Date",
      cell: (info) => {
        const dateVal = info.getValue();
        return (
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <LuCalendar className="h-4 w-4 text-gray-400" />
            <span>
              {dateVal.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        );
      },
    }),

    // 2. اسم المنتج
    columnHelper.accessor("product", {
      header: "Product",
      cell: (info) => (
        <span
          className="font-semibold text-gray-900 truncate max-w-50"
          title={info.getValue()}
        >
          {info.getValue()}
        </span>
      ),
    }),

    // 3. نوع الحركة (مع الأيقونات المطلوبة والتلوين الذكي)
    columnHelper.accessor("type", {
      header: "Type",
      cell: (info) => {
        const type = info.getValue();

        if (type === "Stock In") {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <LuArrowDownLeft className="h-4 w-4 text-emerald-600" />
              Stock In
            </span>
          );
        }

        if (type === "Stock Out") {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 border border-rose-200">
              <LuArrowUpRight className="h-4 w-4 text-rose-600" />
              Stock Out
            </span>
          );
        }

        // في حال كانت الحركة Adjustment
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200">
            <LuRefreshCcw className="h-3.5 w-3.5 text-blue-600 animate-spin-slow" />
            Adjustment
          </span>
        );
      },
    }),

    // 4. الكمية
    columnHelper.accessor("qty", {
      header: "Qty",
      cell: (info) => {
        const qty = info.getValue();
        const isNegative = qty < 0;
        return (
          <span
            className={`font-mono font-bold ${isNegative ? "text-rose-600" : "text-gray-900"}`}
          >
            {isNegative ? qty : `+${qty}`}
          </span>
        );
      },
    }),

    // 5. الموظف المسؤول
    columnHelper.accessor("employee", {
      header: "Employee",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-700">
          <LuUser className="h-3.5 w-3.5 text-gray-400" />
          <span>{info.getValue()}</span>
        </div>
      ),
    }),

    // 6. المرجع أو رقم المستند
    columnHelper.accessor("reference", {
      header: "Reference",
      cell: (info) => (
        <div className="flex items-center gap-1 text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 w-fit">
          <LuHash className="h-3 w-3" />
          {info.getValue()}
        </div>
      ),
    }),

    // 7. حالة الطلب / العملية
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();

        const config = {
          Completed: "bg-emerald-100/70 text-emerald-800 dot-emerald-500",
          Pending: "bg-amber-100/70 text-amber-800 dot-amber-500",
          Failed: "bg-rose-100/70 text-rose-800 dot-rose-500",
        };

        const currentStyle =
          config[status] || "bg-gray-100 text-gray-800 dot-gray-500";
        const dotColor =
          status === "Completed"
            ? "bg-emerald-500"
            : status === "Pending"
              ? "bg-amber-500"
              : "bg-rose-500";

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${currentStyle}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {status}
          </span>
        );
      },
    }),

    // 8. عمود العمليات المشترك (الـ Zustand المتناسق)
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const isOpen = openMenuId === row.id;
        return (
          <div className="relative">
            <button
              type="button"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleMenu(row.id)} // استخدام دالة الـ Zustand الموحدة
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

  return <Table columns={columns} data={movements} />;
};

export default MovementTable;

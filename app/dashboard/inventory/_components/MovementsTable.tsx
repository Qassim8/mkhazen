"use client";

import { useState } from "react";
import Table from "@/components/shared/Table";
import { createColumnHelper } from "@tanstack/react-table";
import { InventoryMovement } from "../services/inventory.services";
import MovementDetailsModal from "./MovementDetailsModal";
import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuCalendar,
  LuHash,
  LuRefreshCcw,
  LuEye,
} from "react-icons/lu";

const columnHelper = createColumnHelper<InventoryMovement>();

interface MovementTableProps {
  movements: InventoryMovement[];
}

const MovementTable = ({ movements }: MovementTableProps) => {
  const [selectedMovement, setSelectedMovement] =
    useState<InventoryMovement | null>(null);

  const columns = [
    columnHelper.accessor("created_at", {
      header: "التاريخ",
      cell: (info) => {
        const dateVal = new Date(info.getValue());
        return (
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <LuCalendar className="h-4 w-4 text-gray-400" />
            <span>
              {dateVal.toLocaleDateString("ar-EG", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        );
      },
    }),

    columnHelper.accessor("products.name", {
      header: "المنتج",
      cell: (info) => (
        <span className="font-semibold text-gray-900 truncate max-w-50 block">
          {info.getValue() || "منتج غير محدد"}
        </span>
      ),
    }),

    columnHelper.accessor("movement_type", {
      header: "نوع الحركة",
      cell: (info) => {
        const type = info.getValue();
        if (type === "STOCK_IN") {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <LuArrowDownLeft className="h-4 w-4 text-emerald-600" />
              Stock In
            </span>
          );
        }
        if (type === "STOCK_OUT") {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 border border-rose-200">
              <LuArrowUpRight className="h-4 w-4 text-rose-600" />
              Stock Out
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200">
            <LuRefreshCcw className="h-3.5 w-3.5 text-amber-600" />
            Adjustment
          </span>
        );
      },
    }),

    columnHelper.accessor("quantity", {
      header: "الكمية",
      cell: (info) => {
        const qty = info.getValue();
        return (
          <span
            className={`font-mono font-bold ${qty < 0 ? "text-rose-600" : "text-emerald-600"}`}
          >
            {qty > 0 ? `+${qty}` : qty}
          </span>
        );
      },
    }),

    columnHelper.accessor("reference", {
      header: "المرجع",
      cell: (info) => (
        <div className="flex items-center gap-1 text-xs font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 w-fit">
          <LuHash className="h-3 w-3" />
          {info.getValue() || "آلي"}
        </div>
      ),
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <button
            type="button"
            aria-label="عرض التفاصيل"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
            onClick={() => setSelectedMovement(row.original)}
          >
            <LuEye className="h-5 w-5" />
          </button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <Table columns={columns} data={movements} />
      <MovementDetailsModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
      />
    </>
  );
};

export default MovementTable;

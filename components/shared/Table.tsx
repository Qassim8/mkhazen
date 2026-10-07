"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { RowData, TableOptions } from "@tanstack/react-table";
import type { ReactNode } from "react";

interface TableProps<TData extends RowData> {
  data: TData[];
  columns: TableOptions<TData>["columns"];
  emptyMessage?: ReactNode;
  loading?: boolean;
  loadingMessage?: ReactNode;
  tableClassName?: string;
}

export default function Table<TData extends RowData>({
  columns,
  data,
  emptyMessage = "لا توجد بيانات",
  loading = false,
  loadingMessage = "جارٍ تحميل البيانات...",
  tableClassName = "",
}: TableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className={`w-full border-collapse text-start text-sm ${tableClassName}`}
        >
          {/* Header */}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-t border-gray-200 bg-gray-100/50 text-start"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3.5 font-medium text-gray-500 tracking-wide text-start"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-gray-100">
            {loading || table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(table.getVisibleLeafColumns().length, 1)}
                  className="px-5 py-16 text-center text-gray-400"
                >
                  {loading ? loadingMessage : emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors duration-150 hover:bg-gray-50/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-6 py-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

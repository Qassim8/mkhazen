"use client";

import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";
import { Product } from "@/types/types";
import Image from "next/image";
import { products } from "@/data/data";

const columnHelper = createColumnHelper<Product>();

const Table = () => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Product",
        cell: (info) => (
          <div className="flex items-center gap-3">
            <Image
              src={info.row.original.image}
              alt={info.getValue()}
              className="h-10 w-10 rounded-lg border border-gray-200 bg-gray-100 object-cover"
              width={10}
              height={10}
            />
            <span className="font-medium text-gray-900">{info.getValue()}</span>
          </div>
        ),
      }),
      columnHelper.accessor("sku", {
        header: "SKU",
        cell: (info) => (
          <span className="font-mono text-xs uppercase text-gray-500">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("category", {
        header: "Category",
        cell: (info) => (
          <span className="font-medium text-gray-800">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("supplier", {
        header: "Supplier",
        cell: (info) => (
          <span className="text-gray-600">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("qty", {
        header: "Qty",
        cell: (info) => (
          <span className="font-semibold text-gray-900">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("price", {
        header: "Price",
        cell: (info) => (
          <span className="font-medium text-gray-900">
            ${info.getValue().toFixed(2)}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const status = info.getValue();
          const isLowStock = status === "Low stock";
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isLowStock
                  ? "bg-amber-100/70 text-amber-800"
                  : "bg-emerald-100/70 text-emerald-800"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLowStock ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
              {status}
            </span>
          );
        },
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
                onClick={() => setOpenMenuId(isOpen ? null : row.id)}
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
    ],
    [openMenuId],
  );

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          {/* Header */}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-t border-gray-200 bg-gray-100/50"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3.5 font-medium text-gray-500 tracking-wide"
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
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50/60 transition-colors duration-150"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Table;

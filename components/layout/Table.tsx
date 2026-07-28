"use client";

import React from "react";
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

// 3. تعريف الأعمدة بالتنسيقات الخاصة لكل خلية
const columns = [
  // عمود Product (يجمع بين الصورة والاسم)
  columnHelper.accessor("name", {
    header: "Product",
    cell: (info) => (
      <div className="flex items-center gap-3">
        <Image
          src={info.row.original.image}
          alt={info.getValue()}
          className="w-10 h-10 rounded-lg object-cover bg-gray-100 border border-gray-200"
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
      <span className="font-mono text-xs text-gray-500 uppercase">
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
    cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
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
  // عمود Status مع الشارات الملونة
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const isLowStock = status === "Low stock";
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isLowStock
              ? "bg-amber-100/70 text-amber-800"
              : "bg-emerald-100/70 text-emerald-800"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLowStock ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
          {status}
        </span>
      );
    },
  }),
  // عمود الإجراءات (النقاط الثلاث)
  columnHelper.display({
    id: "actions",
    cell: () => (
      <button className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
        <FiMoreHorizontal className="w-5 h-5" />
      </button>
    ),
  }),
];

const Table = () => {
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

"use client";

import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";

// 1. تعريف نوع البيانات (TypeScript Interface - اختياري)
type Product = {
  id: string;
  name: string;
  image: string;
  sku: string;
  category: string;
  supplier: string;
  qty: number;
  price: number;
  status: "In stock" | "Low stock" | "Out of stock";
};

// 2. بيانات تجريبية مطابقة للصورة
const data: Product[] = [
  {
    id: "1",
    name: "Ceramic Pour-Over Kettle",
    image:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=100&q=80",
    sku: "BEV-KTL-003",
    category: "Beverages",
    supplier: "Atlas Distribution",
    qty: 62,
    price: 48.0,
    status: "In stock",
  },
  {
    id: "2",
    name: "Cold Brew Coffee Maker",
    image:
      "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=100&q=80",
    sku: "BEV-CBM-010",
    category: "Beverages",
    supplier: "Atlas Distribution",
    qty: 33,
    price: 39.0,
    status: "In stock",
  },
  {
    id: "3",
    name: "Compact Mirrorless Camera",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=100&q=80",
    sku: "CAM-MIR-006",
    category: "Cameras",
    supplier: "Kyoto Supply Co.",
    qty: 8,
    price: 899.0,
    status: "Low stock",
  },
  {
    id: "4",
    name: "Cordless Drill Kit",
    image:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=100&q=80",
    sku: "TLS-DRL-005",
    category: "Tools",
    supplier: "Brisbane Wholesale",
    qty: 41,
    price: 179.5,
    status: "In stock",
  },
  {
    id: "5",
    name: "Hardcover Design Anthology",
    image:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=100&q=80",
    sku: "BOK-DSN-008",
    category: "Books",
    supplier: "Nordwind Trading",
    qty: 210,
    price: 42.0,
    status: "In stock",
  },
  {
    id: "6",
    name: "Linen Table Lamp",
    image:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=100&q=80",
    sku: "HOM-LMP-007",
    category: "Home & Lighting",
    supplier: "Atlas Distribution",
    qty: 55,
    price: 74.0,
    status: "In stock",
  },
  {
    id: "7",
    name: "Mechanical Keyboard 75%",
    image:
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=100&q=80",
    sku: "ELE-KEY-002",
    category: "Electronics",
    supplier: "Nordwind Trading",
    qty: 14,
    price: 139.9,
    status: "Low stock",
  },
];

const columnHelper = createColumnHelper<Product>();

// 3. تعريف الأعمدة بالتنسيقات الخاصة لكل خلية
const columns = [
  // عمود Product (يجمع بين الصورة والاسم)
  columnHelper.accessor("name", {
    header: "Product",
    cell: (info) => (
      <div className="flex items-center gap-3">
        <img
          src={info.row.original.image}
          alt={info.getValue()}
          className="w-10 h-10 rounded-lg object-cover bg-gray-100 border border-gray-200"
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
    data,
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

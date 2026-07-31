"use client";
import Table from "@/components/layout/Table";
import { products } from "@/data/data";
import { Product } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";

const columnHelper = createColumnHelper<Product>();
const ProductTable = () => {
  const columns = [
    columnHelper.accessor("name", {
      header: "Product",
      cell: (info) => (
        <div className="flex gap-3">
          <span className="font-mono font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs">
            {info.row.original.id}
          </span>
          <div className="flex flex-col max-w-45">
            <span className="font-semibold text-gray-900 truncate">
              {info.getValue()}
            </span>
            <span className="text-xs text-gray-500 truncate">
              {info.row.original.name}
            </span>
          </div>
        </div>
      ),
    }),

    columnHelper.accessor("qty", {
      header: "Sold",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-gray-700 text-sm">
          <span>{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.accessor("price", {
      header: "Revenue",
      cell: (info) => (
        <span className="font-mono font-bold text-gray-900">
          ${(info.getValue() * (info.row.original.qty ?? 1)).toFixed(2)}
        </span>
      ),
    }),
  ];

  return (
    <div className="frame p-0! h-full">
      <Table data={products.slice(0, 5)} columns={columns} />
    </div>
  );
};

export default ProductTable;

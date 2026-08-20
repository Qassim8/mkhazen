"use client";
import Table from "@/components/shared/Table";
import { products } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Product } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import Image from "next/image";
import { LuEye, LuSquarePen, LuTrash2 } from "react-icons/lu";

const columnHelper = createColumnHelper<Product>();

const deleteProduct = async (productId: string | number) => {
  console.log("حذف المنتج:", productId);
};

const ProductsTable = () => {
  const showDeleteConfirmation = useTable(
    (state) => state.showDeleteConfirmation,
  );

  const columns = [
    columnHelper.accessor("name", {
      header: "المنتج",
      cell: (info) => (
        <div className="flex items-center gap-3">
          <div className="relative w-16 md:w-20 h-16 md:h-20 flex justify-center items-center">
            <Image
              src={info.row.original.image}
              alt={info.getValue()}
              className="h-full w-full rounded-lg border border-gray-200 bg-gray-100 object-cover"
              fill
            />
          </div>
          <span className="font-medium text-gray-900">{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor("sku", {
      header: "الرمز",
      cell: (info) => (
        <span className="font-mono text-xs uppercase text-gray-500">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("category", {
      header: "الصنف",
      cell: (info) => (
        <span className="font-medium text-gray-800">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("supplier", {
      header: "المورد",
      cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
    }),
    columnHelper.accessor("qty", {
      header: "الكمية",
      cell: (info) => (
        <span className="font-semibold text-gray-900">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("price", {
      header: "السعر",
      cell: (info) => (
        <span className="font-medium text-gray-900">
          ${info.getValue().toFixed(2)}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        const isLowStock = status === "Low stock";
        const outOfStock = status === "Out of stock";
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isLowStock
                ? "bg-amber-100/70 text-amber-800"
                : outOfStock
                  ? "bg-red-100/70 text-red-800"
                  : "bg-emerald-100/70 text-emerald-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isLowStock
                  ? "bg-amber-500"
                  : outOfStock
                    ? "bg-red-500"
                    : "bg-emerald-500"
              }`}
            />
            {status === "In stock"
              ? "متوفر"
              : status === "Out of stock"
                ? "نفذ"
                : "على وشك النفاذ"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="عرض المنتج"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => undefined}
            >
              <LuEye className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="تعديل المنتج"
              className="rounded-lg p-1 text-blue-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => undefined}
            >
              <LuSquarePen className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="حذف المنتج"
              className="rounded-lg p-1 text-red-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() =>
                showDeleteConfirmation(
                  row.original.id ?? row.id,
                  deleteProduct,
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

  return <Table columns={columns} data={products} />;
};

export default ProductsTable;

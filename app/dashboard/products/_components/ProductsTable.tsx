"use client";

import Table from "@/components/shared/Table";
import { useModalStore } from "@/store/useModalStore";
import { createColumnHelper } from "@tanstack/react-table";
import Image from "next/image";
import { LuEye, LuSquarePen, LuTrash2 } from "react-icons/lu";
import ProductViewModal from "./ProductViewModal";
import { Product } from "../schemas/product.schemas";
import { deleteProduct } from "../services/products.services";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import ProductUpdateModal from "./ProductUpdateModal";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

const columnHelper = createColumnHelper<Product>();

interface ProductsTableProps {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
}

const ProductsTable = ({
  products,
  categories,
  suppliers,
}: ProductsTableProps) => {
  const openModal = useModalStore((state) => state.openModal);

  const columns = [
    columnHelper.accessor("name", {
      header: "المنتج",
      cell: (info) => {
        const image = info.row.original.images?.[0] || "/placeholder.png";
        return (
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              <Image
                src={image}
                alt={info.getValue()}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-gray-900">
                {info.getValue()}
              </span>
              <span className="text-xs text-gray-400">
                {info.row.original.purchaseUnit} /{" "}
                {info.row.original.sellingUnit}
              </span>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("sku", {
      header: "الرمز",
      cell: (info) => (
        <span className="font-mono text-xs uppercase text-gray-500">
          {info.getValue() || "—"}
        </span>
      ),
    }),
    columnHelper.accessor("category", {
      header: "الفئة",
      cell: (info) => (
        <span className="font-medium text-gray-800">
          {info.getValue()?.name || "—"}
        </span>
      ),
    }),
    columnHelper.accessor("supplier", {
      header: "المورد",
      cell: (info) => (
        <span className="text-gray-600">{info.getValue()?.name || "—"}</span>
      ),
    }),
    columnHelper.accessor("stockQuantity", {
      header: "الكمية",
      cell: (info) => (
        <span className="font-semibold text-gray-900">
          {info.getValue()} {info.row.original.sellingUnit}
        </span>
      ),
    }),
    columnHelper.accessor("sellingPrice", {
      header: "الأسعار",
      cell: (info) => (
        <div className="flex flex-col text-xs">
          <span className="font-medium text-emerald-600">
            {info.getValue()} ريال (بيع)
          </span>
          <span className="text-gray-400">
            {info.row.original.purchasePrice} ريال (تكلفة)
          </span>
        </div>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "الحالة",
      cell: ({ row }) => {
        const stock = row.original.stockQuantity;
        const minStock = row.original.minStockLevel ?? 5;
        const isOutOfStock = stock <= 0;
        const isLowStock = stock <= minStock && !isOutOfStock;

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isOutOfStock
                ? "bg-red-100/70 text-red-800"
                : isLowStock
                  ? "bg-amber-100/70 text-amber-800"
                  : "bg-emerald-100/70 text-emerald-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isOutOfStock
                  ? "bg-red-500"
                  : isLowStock
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            {isOutOfStock ? "نفذت الكمية" : isLowStock ? "منخفض" : "متوفر"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "الإجراءات",
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-2">
          {/* معاينة */}
          <button
            type="button"
            aria-label="عرض المنتج"
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            onClick={() =>
              openModal("VIEW", {
                title: "تفاصيل المنتج",
                content: <ProductViewModal product={row.original} />,
              })
            }
          >
            <LuEye className="h-5 w-5" />
          </button>

          {/* تعديل */}
          <button
            type="button"
            aria-label="تعديل المنتج"
            className="rounded-lg p-1 text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            onClick={() =>
              openModal("UPDATE", {
                title: "تعديل بيانات المنتج",
                content: (
                  <ProductUpdateModal
                    categories={categories}
                    suppliers={suppliers}
                    initialData={row.original}
                  />
                ),
              })
            }
          >
            <LuSquarePen className="h-5 w-5" />
          </button>

          {/* حذف */}
          <button
            type="button"
            aria-label="حذف المنتج"
            className="rounded-lg p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            onClick={() =>
              openModal("DELETE_CONFIRM", {
                rowId: row.original.id,
                itemName: row.original.name,
                actionFunction: deleteProduct,
                content: <DeleteConfirmationModal />,
              })
            }
          >
            <LuTrash2 className="h-5 w-5" />
          </button>
        </div>
      ),
    }),
  ];

  return <Table columns={columns} data={products} />;
};

export default ProductsTable;

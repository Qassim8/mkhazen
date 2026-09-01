"use client";

import Table from "@/components/shared/Table";
import { useModalStore } from "@/store/useModalStore";
import { createColumnHelper } from "@tanstack/react-table";
import Image from "next/image";
import { LuEye, LuSquarePen, LuTrash2, LuLayers } from "react-icons/lu";
import ProductViewModal from "./ProductViewModal";
import { Product } from "../schemas/product.schemas";
import { deleteProduct } from "../services/products.services";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import ProductUpdateModal from "./ProductUpdateModal";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  const columns = [
    // 📦 اسم المنتج والخيارات
    columnHelper.accessor("name", {
      header: "المنتج",
      cell: (info) => {
        const product = info.row.original;
        // أخذ صورة المتغير الأول أو الصورة الرئيسية أو الـ placeholder
        const image =
          product.variants?.[0]?.images?.[0] ||
          product.images?.[0] ||
          "/placeholder.png";
        const variantsCount = product.variants?.length || 0;

        return (
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <Image
                src={image}
                alt={info.getValue()}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-gray-900 text-sm">
                {info.getValue()}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">
                  {product.purchaseUnit} / {product.sellingUnit}
                </span>
                {variantsCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                    <LuLayers className="h-3 w-3 text-gray-500" />
                    {variantsCount} خيارات
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    }),

    // 🏷️ رمز الـ SKU
    // 🏷️ رمز الـ SKU
    columnHelper.display({
      id: "sku",
      header: "الرمز (SKU)",
      cell: ({ row }) => {
        // نأخذ الـ SKU المباشر من المنتج أو من أول متغير
        const firstVariantSku = row.original.variants?.[0]?.sku;
        const displaySku = firstVariantSku || "—";

        return (
          <span className="font-mono text-xs uppercase text-gray-500 font-medium">
            {displaySku}
          </span>
        );
      },
    }),

    // 📂 الفئة
    columnHelper.accessor("category", {
      header: "الفئة",
      cell: (info) => (
        <span className="font-semibold text-xs text-gray-800 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg inline-block">
          {info.getValue()?.name || "—"}
        </span>
      ),
    }),

    // 🏭 المورد
    columnHelper.accessor("supplier", {
      header: "المورد",
      cell: (info) => (
        <span className="text-xs font-medium text-gray-600">
          {info.getValue()?.name || "—"}
        </span>
      ),
    }),

    // 📊 إجمالي الكمية بالمخزن
    columnHelper.display({
      id: "totalStock",
      header: "إجمالي الكمية",
      cell: ({ row }) => {
        const variants = row.original.variants || [];
        const totalStock =
          variants.length > 0
            ? variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
            : row.original.variants?.[0]?.stockQuantity || 0;

        return (
          <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-900">
              {totalStock.toLocaleString()} {row.original.sellingUnit}
            </span>
            {variants.length > 1 && (
              <span className="text-[10px] text-gray-400">
                موزعة على {variants.length} خيارات
              </span>
            )}
          </div>
        );
      },
    }),

    // 💰 الأسعار ومدى الأسعار
    columnHelper.display({
      id: "priceRange",
      header: "الأسعار",
      cell: ({ row }) => {
        const variants = row.original.variants || [];

        if (variants.length > 0) {
          const prices = variants.map((v) => v.sellingPrice || 0);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);

          const purchasePrices = variants.map((v) => v.purchasePrice || 0);
          const minPurchase = Math.min(...purchasePrices);

          return (
            <div className="flex flex-col text-xs">
              <span className="font-bold text-emerald-600">
                {minPrice === maxPrice
                  ? `${minPrice} ريال`
                  : `${minPrice} - ${maxPrice} ريال`}
              </span>
              <span className="text-[11px] text-gray-400">
                تكلفة: {minPurchase} ريال
              </span>
            </div>
          );
        }

        return (
          <div className="flex flex-col text-xs">
            <span className="font-bold text-emerald-600">
              {row.original.variants?.[0]?.sellingPrice || 0} ريال
            </span>
            <span className="text-[11px] text-gray-400">
              تكلفة: {row.original.variants?.[0]?.purchasePrice || 0} ريال
            </span>
          </div>
        );
      },
    }),

    // 🟢/🔴 حالة التوفر
    columnHelper.display({
      id: "status",
      header: "الحالة",
      cell: ({ row }) => {
        const variants = row.original.variants || [];
        const totalStock =
          variants.length > 0
            ? variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
            : row.original.variants?.[0]?.stockQuantity || 0;

        const minStock = row.original.variants?.[0]?.minStockLevel ?? 5;
        const isOutOfStock = totalStock <= 0;
        const isLowStock = totalStock <= minStock && !isOutOfStock;

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOutOfStock
                ? "bg-red-50 text-red-700 border border-red-100"
                : isLowStock
                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
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

    // ⚙️ الإجراءات
    columnHelper.display({
      id: "actions",
      header: "الإجراءات",
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          {/* معاينة */}
          <button
            type="button"
            aria-label="عرض المنتج"
            className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
            onClick={() =>
              router.push(`/dashboard/products/${row.original.id}`)
            }
          >
            <LuEye className="h-4 w-4" />
          </button>

          {/* تعديل */}
          <button
            type="button"
            aria-label="تعديل المنتج"
            className="rounded-xl p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
            onClick={() =>
              router.push(`/dashboard/products/${row.original.id}/edit`)
            }
          >
            <LuSquarePen className="h-4 w-4" />
          </button>

          {/* حذف */}
          <button
            type="button"
            aria-label="حذف المنتج"
            className="rounded-xl p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 cursor-pointer"
            onClick={() =>
              openModal("DELETE_CONFIRM", {
                rowId: row.original.id,
                itemName: row.original.name,
                actionFunction: deleteProduct,
                content: <DeleteConfirmationModal />,
              })
            }
          >
            <LuTrash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ];

  return <Table columns={columns} data={products} />;
};

export default ProductsTable;

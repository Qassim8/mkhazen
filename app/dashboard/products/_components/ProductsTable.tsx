"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuLayers, LuSquarePen, LuTrash2 } from "react-icons/lu";

import Table from "@/components/shared/Table";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";

import { useModalStore } from "@/store/useModalStore";

import { deleteProduct } from "../services/products.services";

import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";
import { Product } from "../schemas/product.schemas";

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

  const categoryMap = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  const supplierMap = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );

  const columns = [
    columnHelper.accessor("name", {
      header: "المنتج",

      cell: (info) => {
        const product = info.row.original;

        const variants = product.variants ?? [];

        const image =
          variants.find((variant) => variant.images?.length)?.images?.[0] ||
          product.images?.[0] ||
          "/placeholder.png";

        const variantsCount = variants.length;

        return (
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <Image
                src={image}
                alt={info.getValue()}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-gray-900">
                {info.getValue()}
              </span>

              <div className="mt-0.5 flex items-center gap-2">
                {product.purchaseUnit && product.sellingUnit && (
                  <span className="text-xs text-gray-400">
                    {product.purchaseUnit} / {product.sellingUnit}
                  </span>
                )}

                {variantsCount > 1 && (
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

    columnHelper.display({
      id: "sku",
      header: "رمز SKU",

      cell: ({ row }) => {
        const sku = row.original.variants?.[0]?.sku;

        return (
          <span className="font-mono text-xs font-medium uppercase text-gray-500">
            {sku || "—"}
          </span>
        );
      },
    }),

    columnHelper.accessor("categoryId", {
      header: "الفئة",

      cell: (info) => {
        const categoryId = info.getValue();
        const categoryName = categoryId
          ? categoryMap.get(categoryId)
          : undefined;

        return (
          <span className="inline-block rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-800">
            {categoryName || "—"}
          </span>
        );
      },
    }),

    columnHelper.accessor("supplierId", {
      header: "المورد",

      cell: (info) => {
        const supplierId = info.getValue();

        return (
          <span className="text-xs font-medium text-gray-600">
            {(supplierId && supplierMap.get(supplierId)) || "—"}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "totalStock",
      header: "إجمالي الكمية",

      cell: ({ row }) => {
        const product = row.original;
        const variants = product.variants ?? [];

        const totalStock = variants.reduce(
          (sum, variant) => sum + Number(variant.stockQuantity || 0),
          0,
        );

        return (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-900">
              {totalStock.toLocaleString()} {product.sellingUnit || ""}
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

    columnHelper.display({
      id: "priceRange",
      header: "الأسعار",

      cell: ({ row }) => {
        const variants = row.original.variants ?? [];

        if (variants.length === 0) {
          return <span className="text-xs text-gray-400">—</span>;
        }

        const sellingPrices = variants.map(
          (variant) => Number(variant.sellingPrice) || 0,
        );

        const purchasePrices = variants.map(
          (variant) => Number(variant.purchasePrice) || 0,
        );

        const minSellingPrice = Math.min(...sellingPrices);
        const maxSellingPrice = Math.max(...sellingPrices);

        const minPurchasePrice = Math.min(...purchasePrices);

        return (
          <div className="flex flex-col text-xs">
            <span className="font-bold text-emerald-600">
              {minSellingPrice === maxSellingPrice
                ? `${minSellingPrice.toLocaleString()} ريال`
                : `${minSellingPrice.toLocaleString()} - ${maxSellingPrice.toLocaleString()} ريال`}
            </span>

            <span className="text-[11px] text-gray-400">
              تكلفة تبدأ من {minPurchasePrice.toLocaleString()} ريال
            </span>
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "status",
      header: "الحالة",

      cell: ({ row }) => {
        const variants = row.original.variants ?? [];

        const totalStock = variants.reduce(
          (sum, variant) => sum + Number(variant.stockQuantity || 0),
          0,
        );

        const minimumRequiredStock = variants.reduce(
          (sum, variant) => sum + Number(variant.minStockLevel || 0),
          0,
        );

        const isOutOfStock = totalStock <= 0;

        const isLowStock = totalStock > 0 && totalStock <= minimumRequiredStock;

        const isInStock = totalStock > minimumRequiredStock;

        const statusClass = isOutOfStock
          ? "bg-red-50 text-red-700 border-red-100"
          : isLowStock
            ? "bg-amber-50 text-amber-700 border-amber-100"
            : "bg-emerald-50 text-emerald-700 border-emerald-100";

        const dotClass = isOutOfStock
          ? "bg-red-500"
          : isLowStock
            ? "bg-amber-500"
            : "bg-emerald-500";

        const statusText = isOutOfStock
          ? "نفذت الكمية"
          : isLowStock
            ? "منخفض"
            : "متوفر";

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />

            {statusText}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      header: "الإجراءات",

      cell: ({ row }) => {
        const product = row.original;

        return (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              aria-label="عرض المنتج"
              title="عرض المنتج"
              className="cursor-pointer rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              onClick={() => router.push(`/dashboard/products/${product.id}`)}
            >
              <LuEye className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="تعديل المنتج"
              title="تعديل المنتج"
              className="cursor-pointer rounded-xl p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              onClick={() =>
                router.push(`/dashboard/products/${product.id}/edit`)
              }
            >
              <LuSquarePen className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="حذف المنتج"
              title="حذف المنتج"
              className="cursor-pointer rounded-xl p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
              onClick={() =>
                openModal("DELETE_CONFIRM", {
                  rowId: product.id,
                  itemName: product.name,
                  actionFunction: deleteProduct,
                  content: <DeleteConfirmationModal />,
                })
              }
            >
              <LuTrash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    }),
  ];

  return <Table columns={columns} data={products} />;
};

export default ProductsTable;

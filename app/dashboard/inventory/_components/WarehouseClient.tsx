"use client";

import { Suspense, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  LuArrowDownToLine,
  LuArrowUpFromLine,
  LuPackage,
  LuPackagePlus,
  LuRefreshCcw,
  LuSlidersHorizontal,
} from "react-icons/lu";

import Pagination from "@/components/shared/Pagination";
import TableFilter from "@/components/shared/TableFilter";
import { ResetFilters } from "@/components/shared/ResetFilters";

import TableSearchbar from "@/components/shared/TableSearchbar";

import AdjustmentModal from "./AdjustmentModal";
import AreaChartComponent from "./BarChart";
import Movement from "./Movement";
import MovementTable from "./MovementsTable";

import {
  InventoryMovement,
  InventoryVariant,
} from "../services/inventory.services";

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  movements: InventoryMovement[];
  movementMeta: Meta;
  inventory: InventoryVariant[];
}

export default function WarehouseClient({
  movements,
  movementMeta,
  inventory,
}: Props) {
  const router = useRouter();

  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] =
    useState<InventoryVariant | null>(null);
  const totalStock = useMemo(
    () =>
      inventory.reduce((sum, item) => sum + Number(item.stockQuantity || 0), 0),
    [inventory],
  );

  const lowStockCount = useMemo(
    () =>
      inventory.filter((item) => {
        const stock = Number(item.stockQuantity || 0);

        const minimum = Number(item.minStockLevel || 0);

        return stock > 0 && stock <= minimum;
      }).length,
    [inventory],
  );

  const outOfStockCount = useMemo(
    () =>
      inventory.filter((item) => Number(item.stockQuantity || 0) <= 0).length,
    [inventory],
  );

  return (
    <main dir="rtl">
      <header className="pt-3 pb-5 flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-3xl font-bold">المخزون</h1>
          <p className="text-xs md:text-sm text-gray-500">
            متابعة حركة المخزون والتعديلات
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="flex items-center justify-center gap-2 py-2 px-4 text-white bg-(--primary-red) hover:bg-(--primary-red-hover) rounded-lg transition-colors duration-300 cursor-pointer"
            onClick={() => setIsAdjustmentOpen(true)}
          >
            <span className="text-xs md:text-sm">تسوية مخزنية</span>
            <LuRefreshCcw />
          </button>
          <Link
            href="/dashboard/inventory/opening-stock"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
          >
            <LuPackagePlus className="h-4 w-4" />
            المخزون الافتتاحي
          </Link>
        </div>
      </header>

      {/* البضاعة اللي كانت موجودة قبل النظام تتسجل من هنا، مش بتسوية */}
      <div className="mb-6 flex justify-end"></div>

      {/* =====================================================
          SUMMARY
      ====================================================== */}

      <div className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="frame">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
              <LuPackage className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm text-gray-500">إجمالي الكمية الحالية</p>

              <p className="mt-1 font-mono text-xl font-bold text-gray-900">
                {totalStock.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        </div>

        <div className="frame">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <LuArrowDownToLine className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm text-gray-500">الحركات المسجلة</p>

              <p className="mt-1 font-mono text-xl font-bold text-gray-900">
                {movementMeta.total}
              </p>
            </div>
          </div>
        </div>

        <div className="frame">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <LuSlidersHorizontal className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm text-gray-500">مخزون منخفض</p>

              <p className="mt-1 font-mono text-xl font-bold text-gray-900">
                {lowStockCount}
              </p>
            </div>
          </div>
        </div>

        <div className="frame">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <LuArrowUpFromLine className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm text-gray-500">نافد</p>

              <p className="mt-1 font-mono text-xl font-bold text-gray-900">
                {outOfStockCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          CHART + TIMELINE
      ====================================================== */}

      <div className="mb-8 grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AreaChartComponent movements={movements} />
        </div>

        <div className="frame">
          <Movement movements={movements.slice(0, 6)} />
        </div>
      </div>

      {/* =====================================================
          MOVEMENTS
      ====================================================== */}

      <div className="frame overflow-hidden p-0! mb-7">
        <Suspense fallback={<div className="h-20 animate-pulse bg-gray-50" />}>
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/50 p-4 md:flex-row md:items-center">
            <div className="grow">
              <TableSearchbar placeholder="ابحث في الحركات..." />
            </div>

            <TableFilter
              label="نوع الحركة"
              paramKey="type"
              options={[
                {
                  label: "كل الحركات",
                  value: "ALL",
                },
                {
                  label: "شراء",
                  value: "PURCHASE",
                },
                {
                  label: "بيع",
                  value: "SALE",
                },
                {
                  label: "مرتجع شراء",
                  value: "PURCHASE_RETURN",
                },
                {
                  label: "مرتجع بيع",
                  value: "SALE_RETURN",
                },
                {
                  label: "مخزون افتتاحي",
                  value: "OPENING_STOCK",
                },
                {
                  label: "تسوية إدخال",
                  value: "ADJUSTMENT_IN",
                },
                {
                  label: "تسوية إخراج",
                  value: "ADJUSTMENT_OUT",
                },
                {
                  label: "تفصيل وخياطة",
                  value: "PRODUCTION_ISSUE",
                },
                {
                  label: "تصنيع",
                  value: "PRODUCTION_RECEIPT",
                },
                {
                  label: "إهداء",
                  value: "GIFT",
                },
              ]}
            />
            <ResetFilters />
          </div>
        </Suspense>

        <MovementTable movements={movements} />

        <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
          <Pagination
            meta={{
              total: movementMeta.total,
              totalPages: movementMeta.totalPages,
              page: movementMeta.page,
              limit: movementMeta.limit,
            }}
          />
        </Suspense>
      </div>

      {/* =====================================================
          ADJUSTMENT
      ====================================================== */}

      <AdjustmentModal
        isOpen={isAdjustmentOpen}
        onClose={() => {
          setIsAdjustmentOpen(false);
          setSelectedVariant(null);
        }}
        onSuccess={() => {
          setIsAdjustmentOpen(false);
          setSelectedVariant(null);
          router.refresh();
        }}
        variants={inventory}
        selectedVariant={selectedVariant}
      />
    </main>
  );
}

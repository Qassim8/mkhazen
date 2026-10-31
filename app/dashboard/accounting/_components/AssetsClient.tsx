"use client";

import { useState } from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { LuBanknote, LuHistory, LuPlus } from "react-icons/lu";

import Table from "@/components/shared/Table";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";

import { Asset } from "../schemas/accounting.schema";
import NewAssetModal from "./NewAssetsModal";
import { PayableHistoryModal, PayPayableModal } from "./PayableModals";

interface AssetsClientProps {
  initialData: Asset[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  totalValue: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  MACHINE: "ماكينة",
  AIR_CONDITIONER: "مكيف",
  COMPUTER: "حاسوب",
  PRINTER: "طابعة",
  FURNITURE: "أثاث",
  OTHER: "أخرى",
};

const CATEGORY_OPTIONS = [
  { value: "MACHINE", label: "ماكينة" },
  { value: "AIR_CONDITIONER", label: "مكيف" },
  { value: "COMPUTER", label: "حاسوب" },
  { value: "PRINTER", label: "طابعة" },
  { value: "FURNITURE", label: "أثاث" },
  { value: "OTHER", label: "أخرى" },
];

const PAYMENT_LABELS = {
  CASH: "الخزينة",
  BANK: "البنك",
  OPENING: "رصيد افتتاحي",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildColumns(actions: {
  onPay: (asset: Asset) => void;
  onHistory: (asset: Asset) => void;
}): ColumnDef<Asset, unknown>[] {
  return [
  {
    accessorKey: "name",
    header: "الأصل",
    cell: ({ row }) => (
      <div>
        <span className="text-sm font-bold text-gray-900">
          {row.original.name}
        </span>

        {row.original.notes && (
          <span className="mt-1 block max-w-62.5 truncate text-xs text-gray-400">
            {row.original.notes}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "التصنيف",
    cell: ({ getValue }) => {
      const category = getValue() as string;

      return (
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
          {CATEGORY_LABELS[category] ?? category}
        </span>
      );
    },
  },
  {
    accessorKey: "purchaseValue",
    header: "قيمة الشراء",
    cell: ({ row }) => {
      const asset = row.original;
      const isSdg = asset.currency === "SDG";

      return (
        <div dir="ltr" className="text-left">
          <span className="text-sm font-black text-gray-900">
            {formatNumber(asset.purchaseValueUsd)} $
          </span>
          {isSdg && (
            <span className="block text-[10px] text-gray-400">
              دُفع {formatNumber(asset.purchaseValue)} ج.س
              {asset.exchangeRateUsed ? ` @ ${asset.exchangeRateUsed}` : ""}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "purchaseDate",
    header: "تاريخ الشراء",
    cell: ({ getValue }) => (
      <span className="text-xs font-semibold text-gray-500">
        {formatDate(getValue() as string)}
      </span>
    ),
  },
  {
    accessorKey: "paymentMethod",
    header: "طريقة الدفع",
    cell: ({ getValue }) => {
      const method = getValue() as keyof typeof PAYMENT_LABELS;

      return (
        <span className="text-xs font-semibold text-gray-700">
          {PAYMENT_LABELS[method] ?? method}
        </span>
      );
    },
  },
  {
    accessorKey: "reference",
    header: "المرجع",
    cell: ({ getValue }) => {
      const value = (getValue() as string | null) || "-";

      return (
        <span
          dir="ltr"
          title={value}
          className="block max-w-40 truncate text-xs text-gray-500"
        >
          {value}
        </span>
      );
    },
  },
  {
    id: "payable",
    header: "المدفوع / المتبقي",
    cell: ({ row }) => {
      const asset = row.original;
      const payable = asset.payable;

      if (!payable) {
        return <span className="text-xs font-semibold text-emerald-700">مدفوع بالكامل</span>;
      }

      const unit = asset.currency === "SDG" ? "ج.س" : "$";

      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-600">
            المدفوع {formatNumber(payable.ownerPaid + payable.paidAmount)} {unit}
          </p>
          {payable.status === "OPEN" ? (
            <p className="text-xs font-black text-amber-700">
              المتبقي {formatNumber(payable.remainingAmount)} {unit}
              {payable.dueDate && <span className="block text-[10px] font-normal text-gray-400">يستحق {payable.dueDate}</span>}
            </p>
          ) : (
            <p className="text-xs font-black text-emerald-700">سُدِّد بالكامل</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {payable.status === "OPEN" && (
              <button
                type="button"
                onClick={() => actions.onPay(asset)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-(--primary-red) px-2.5 text-[11px] font-bold text-white hover:opacity-90"
              >
                <LuBanknote className="h-3.5 w-3.5" />
                دفع
              </button>
            )}
            <button
              type="button"
              onClick={() => actions.onHistory(asset)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
            >
              <LuHistory className="h-3.5 w-3.5" />
              السجل
            </button>
          </div>
        </div>
      );
    },
  },
  ];
}

export default function AssetsClient({
  initialData,
  meta,
  totalValue,
}: AssetsClientProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [payModal, setPayModal] = useState<{ kind: "pay" | "history"; asset: Asset } | null>(null);

  const columns = buildColumns({
    onPay: (asset) => setPayModal({ kind: "pay", asset }),
    onHistory: (asset) => setPayModal({ kind: "history", asset }),
  });

  return (
    <div dir="rtl" className="space-y-6 p-4 pb-12">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-950">الأصول</h1>

          <p className="mt-1 text-sm text-gray-500">
            سجل الأصول المملوكة للمتجر وقيمتها
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-gray-900"
        >
          <LuPlus className="h-4 w-4" />
          إضافة أصل
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold text-gray-500">إجمالي قيمة الأصول</p>

        <p dir="ltr" className="mt-2 text-2xl font-black text-gray-950">
          {formatNumber(totalValue)} $
        </p>
      </div>

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar
            placeholder="بحث باسم الأصل أو المرجع..."
            searchKey="search"
          />

          <TableFilter
            label="التصنيف"
            paramKey="category"
            options={CATEGORY_OPTIONS}
          />
          <ResetFilters />
        </div>
      </Suspense>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50/50 p-4">
          <h2 className="text-xs font-black text-gray-900">سجل الأصول</h2>

          <p className="mt-1 text-xs text-gray-500">{meta.total} أصل</p>
        </div>

        <Table
          data={initialData}
          columns={columns}
          emptyMessage="لا توجد أصول مسجلة"
        />
        <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
          <Pagination meta={meta} />
        </Suspense>
      </div>

      {showModal && <NewAssetModal onClose={() => setShowModal(false)} />}

      {payModal?.kind === "pay" && payModal.asset.payable && (
        <PayPayableModal
          payable={{
            id: payModal.asset.payable.id,
            description: `أصل: ${payModal.asset.name}`,
            currency: payModal.asset.currency,
            remainingAmount: payModal.asset.payable.remainingAmount,
          }}
          onClose={() => setPayModal(null)}
          onDone={() => {
            setPayModal(null);
            router.refresh();
          }}
        />
      )}
      {payModal?.kind === "history" && payModal.asset.payable && (
        <PayableHistoryModal
          payableId={payModal.asset.payable.id}
          title={`أصل: ${payModal.asset.name}`}
          canViewAccounting
          onClose={() => setPayModal(null)}
        />
      )}
    </div>
  );
}

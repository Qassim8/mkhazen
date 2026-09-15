"use client";

import { useState } from "react";

import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuEye,
  LuRefreshCcw,
} from "react-icons/lu";

import Table from "@/components/shared/Table";

import { createColumnHelper } from "@tanstack/react-table";

import { InventoryMovement } from "../services/inventory.services";

import MovementDetailsModal from "./MovementDetailsModal";

const columnHelper = createColumnHelper<InventoryMovement>();

interface Props {
  movements: InventoryMovement[];
}

const getMovementInfo = (type: InventoryMovement["movement_type"]) => {
  switch (type) {
    case "PURCHASE":
      return {
        label: "شراء",
        icon: LuArrowDownLeft,
        incoming: true,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

    case "SALE":
      return {
        label: "بيع",
        icon: LuArrowUpRight,
        incoming: false,
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };

    case "PURCHASE_RETURN":
      return {
        label: "مرتجع شراء",
        icon: LuArrowUpRight,
        incoming: false,
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };

    case "SALE_RETURN":
      return {
        label: "مرتجع بيع",
        icon: LuArrowDownLeft,
        incoming: true,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

    case "ADJUSTMENT_IN":
      return {
        label: "تسوية إدخال",
        icon: LuRefreshCcw,
        incoming: true,
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };

    case "ADJUSTMENT_OUT":
      return {
        label: "تسوية إخراج",
        icon: LuRefreshCcw,
        incoming: false,
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
};

const formatDate = (value: string) => {
  return new Date(value).toLocaleDateString("en-GB");
};

const formatNumber = (value: number) => {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
};

export default function MovementTable({ movements }: Props) {
  const [selectedMovement, setSelectedMovement] =
    useState<InventoryMovement | null>(null);

  const columns = [
    columnHelper.accessor("created_at", {
      header: "التاريخ",

      cell: (info) => (
        <span className="font-mono text-sm text-gray-600">
          {formatDate(info.getValue())}
        </span>
      ),
    }),

    columnHelper.display({
      id: "product",

      header: "المنتج",

      cell: ({ row }) => {
        const movement = row.original;

        const product = movement.product_variants?.product_templates?.name;

        const color = movement.product_variants?.colorName;

        const size = movement.product_variants?.size;

        const attributes = [
          color && `اللون: ${color}`,
          size && `المقاس: ${size}`,
        ]
          .filter(Boolean)
          .join(" | ");

        return (
          <div className="max-w-60">
            <p className="truncate font-semibold text-gray-900">
              {product || "منتج غير معروف"}
            </p>

            {attributes && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {attributes}
              </p>
            )}
            <span className="font-mono text-xs text-gray-500">
              {row.original.product_variants?.sku || "-"}
            </span>
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "variant",

      header: "بواسطة",

      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-500">
          {row.original.users?.name || "-"}
        </span>
      ),
    }),

    columnHelper.accessor("movement_type", {
      header: "نوع الحركة",

      cell: (info) => {
        const movement = getMovementInfo(info.getValue());

        if (!movement) {
          return null;
        }

        const Icon = movement.icon;

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${movement.className}`}
          >
            <Icon className="h-3.5 w-3.5" />

            {movement.label}
          </span>
        );
      },
    }),

    columnHelper.accessor("quantity", {
      header: "الكمية",

      cell: (info) => {
        const quantity = Number(info.getValue());

        const movement = getMovementInfo(info.row.original.movement_type);

        return (
          <span
            className={`font-mono font-bold ${
              movement?.incoming ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {movement?.incoming ? "+" : "-"}
            {formatNumber(quantity)}
          </span>
        );
      },
    }),

    columnHelper.accessor("unit_cost", {
      header: "التكلفة",

      cell: (info) => (
        <span className="font-mono text-sm text-gray-700">
          {formatNumber(Number(info.getValue()))} ر.س
        </span>
      ),
    }),

    columnHelper.accessor("reference", {
      header: "المرجع",

      cell: (info) => (
        <span className="text-xs text-gray-500">{info.getValue() || "-"}</span>
      ),
    }),

    columnHelper.display({
      id: "actions",

      cell: ({ row }) => (
        <div className="flex justify-center">
          <button
            type="button"
            title="عرض التفاصيل"
            aria-label="عرض تفاصيل الحركة"
            onClick={() => setSelectedMovement(row.original)}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <LuEye className="h-5 w-5" />
          </button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <Table columns={columns} data={movements} />

      <MovementDetailsModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
      />
    </>
  );
}

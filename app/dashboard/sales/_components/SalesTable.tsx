"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  LuArrowLeft,
  LuBanknote,
  LuScissors,
  LuShoppingBag,
} from "react-icons/lu";
import Table from "@/components/shared/Table";
import type { SalesOrderListItem } from "@/app/dashboard/pos/services/pos.services";

export type SaleRow = SalesOrderListItem;

interface Props {
  rows: SaleRow[];
  loading: boolean;
}

const paymentStatusLabels = {
  PAID: "مدفوع بالكامل",
  PARTIAL: "مدفوع جزئيًا",
  UNPAID: "غير مدفوع",
} as const;

const paymentMethodLabels = {
  CASH: "الخزينة",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  MIXED: "مختلط",
} as const;

/** مبالغ البيع للزبون بالجنيه السوداني */
function money(value: number) {
  return `${value.toLocaleString("ar-SA-u-nu-latn", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ج.س`;
}

function usd(value: number) {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} $`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function SalesTable({ rows, loading }: Props) {
  const columns: ColumnDef<SaleRow, unknown>[] = [
    {
      accessorKey: "orderNumber",
      header: "البيع",
      cell: ({ row }) => (
        <div>
          <p className="font-black text-gray-900">{row.original.orderNumber}</p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatDateTime(row.original.createdAt)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "orderType",
      header: "النوع",
      cell: ({ row }) =>
        row.original.orderType === "TAILORING" ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700">
            <LuScissors className="h-3.5 w-3.5" /> تفصيل
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
            <LuShoppingBag className="h-3.5 w-3.5" /> كاشير
          </span>
        ),
    },
    {
      id: "customer",
      header: "العميل / الخياط",
      cell: ({ row }) =>
        row.original.orderType === "TAILORING" ? (
          <div>
            <p className="font-bold text-gray-900">
              {row.original.customerName ?? "عميل"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              الخياط: {row.original.tailorName ?? "-"}
            </p>
          </div>
        ) : (
          <p className="font-bold text-gray-700">
            {row.original.customerName ?? "بيع مباشر"}
          </p>
        ),
    },
    {
      accessorKey: "cashierName",
      header: "الكاشير",
      cell: ({ row }) => row.original.cashierName ?? "-",
    },
    {
      accessorKey: "totalAmount",
      header: "الإجمالي",
      cell: ({ row }) => (
        <span className="font-black text-gray-900">
          {money(row.original.totalAmount)}
        </span>
      ),
    },
    {
      id: "totalAmountUsd",
      header: "بالدولار",
      cell: ({ row }) =>
        row.original.totalAmountUsd != null ? (
          <div dir="ltr" className="text-left">
            <span className="text-xs font-bold text-gray-700">
              {usd(row.original.totalAmountUsd)}
            </span>
            {row.original.exchangeRateUsed ? (
              <span className="block text-[10px] text-gray-400">
                @ {row.original.exchangeRateUsed.toLocaleString("en-US")}
              </span>
            ) : null}
          </div>
        ) : (
          "-"
        ),
    },
    {
      accessorKey: "paidAmount",
      header: "المدفوع",
      cell: ({ row }) => (
        <span className="font-semibold text-emerald-700">
          {money(row.original.paidAmount)}
        </span>
      ),
    },
    {
      accessorKey: "remainingAmount",
      header: "المتبقي",
      cell: ({ row }) => (
        <span className="font-semibold text-orange-700">
          {money(row.original.remainingAmount)}
        </span>
      ),
    },
    {
      accessorKey: "paymentMethod",
      header: "الدفع",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <LuBanknote className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-xs font-bold text-gray-700">
              {paymentMethodLabels[row.original.paymentMethod]}
            </p>
            <span
              className={`text-[11px] font-bold ${
                row.original.paymentStatus === "PAID"
                  ? "text-emerald-600"
                  : row.original.paymentStatus === "PARTIAL"
                    ? "text-orange-600"
                    : "text-red-600"
              }`}
            >
              {paymentStatusLabels[row.original.paymentStatus]}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "actions",
      header: "الإجراء",
      cell: ({ row }) => (
        <Link
          href={`/dashboard/sales/${row.original.id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
        >
          عرض الفاتورة
          <LuArrowLeft className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];

  return (
    <div dir="rtl" className="overflow-x-auto">
      <Table
        columns={columns}
        data={rows}
        loading={loading}
        loadingMessage="جارٍ تحميل المبيعات..."
        emptyMessage="لا توجد عمليات بيع مطابقة للفلاتر الحالية."
        tableClassName="min-w-262.5"
      />
    </div>
  );
}

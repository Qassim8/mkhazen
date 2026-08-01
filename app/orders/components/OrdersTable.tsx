"use client";
import Table from "@/components/shared/Table";
import { orders } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Order } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";
import { LuCalendar, LuCreditCard, LuMapPin, LuPackage } from "react-icons/lu";

const columnHelper = createColumnHelper<Order>();

const OrdersTable = () => {
  const openMenuId = useTable((state) => state.openMenuId);
  const setOpenMenuId = useTable((state) => state.setOpenMenuId);
  const toggleMenu = useTable((state) => state.toggleOpenMenu);

  const columns = [
    columnHelper.accessor("id", {
      header: "Order ID",
      cell: (info) => (
        <span className="font-mono font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs">
          {info.getValue()}
        </span>
      ),
    }),

    columnHelper.accessor("customerName", {
      header: "Customer",
      cell: (info) => (
        <div className="flex flex-col max-w-45">
          <span className="font-semibold text-gray-900 truncate">
            {info.getValue()}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {info.row.original.customerEmail}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("itemsCount", {
      header: "Items",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-gray-700 text-sm">
          <LuPackage className="h-4 w-4 text-gray-400" />
          <span>{info.getValue()} pcs</span>
        </div>
      ),
    }),

    columnHelper.accessor("totalAmount", {
      header: "Total",
      cell: (info) => (
        <span className="font-mono font-bold text-gray-900">
          ${info.getValue().toFixed(2)}
        </span>
      ),
    }),

    columnHelper.accessor("paymentMethod", {
      header: "Payment",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <LuCreditCard className="h-3.5 w-3.5 text-gray-400" />
          <span>{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.accessor("shippingAddress", {
      header: "Shipping Address",
      cell: (info) => (
        <div
          className="flex items-center gap-1 text-sm text-gray-600 max-w-40"
          title={info.getValue()}
        >
          <LuMapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="truncate">{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.accessor("orderDate", {
      header: "Order Date",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <LuCalendar className="h-3.5 w-3.5" />
          <span>
            {info.getValue().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();

        const statusStyles = {
          Processing:
            "bg-amber-50 text-amber-700 border-amber-200 dot-amber-500",
          Shipped: "bg-blue-50 text-blue-700 border-blue-200 dot-blue-500",
          Delivered:
            "bg-emerald-50 text-emerald-700 border-emerald-200 dot-emerald-500",
          Cancelled: "bg-rose-50 text-rose-700 border-rose-200 dot-rose-500",
        };

        const dotColors = {
          Processing: "bg-amber-500",
          Shipped: "bg-blue-500",
          Delivered: "bg-emerald-500",
          Cancelled: "bg-rose-500",
        };

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotColors[status]}`} />
            {status}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const isOpen = openMenuId === row.id;
        return (
          <div className="relative">
            <button
              type="button"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleMenu(row.id)}
            >
              <FiMoreHorizontal className="h-5 w-5" />
            </button>

            {isOpen && (
              <div className="absolute right-0 z-20 mt-2 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => setOpenMenuId(null)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      },
    }),
  ];

  return <Table columns={columns} data={orders} />;
};

export default OrdersTable;

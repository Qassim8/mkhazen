"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Table from "@/components/shared/Table";
import { useModalStore } from "@/store/useModalStore";
import { createColumnHelper } from "@tanstack/react-table";
import {
  LuCalendar,
  LuEye,
  LuPackage,
  LuSquarePen,
  LuTrash2,
  LuUser,
} from "react-icons/lu";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import { PurchaseOrder } from "../schemas/orders.schemas";
import {
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
} from "../services/order.services";
import OrderDetailsModalContent from "./OrderDetailsModal";
import UpdateOrderModalContent from "./UpdateOrderModal";
import { Product } from "../../products/schemas/product.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

const columnHelper = createColumnHelper<PurchaseOrder>();

const statusOptions: Record<
  PurchaseOrder["status"],
  { value: PurchaseOrder["status"]; label: string }[]
> = {
  DRAFT: [
    { value: "DRAFT", label: "مسودة" },
    { value: "APPROVED", label: "تمت الموافقة" },
    { value: "CANCELLED", label: "ملغى" },
  ],
  APPROVED: [
    { value: "APPROVED", label: "تمت الموافقة" },
    { value: "RECEIVED", label: "مستلم" },
  ],
  DIRECT: [{ value: "DIRECT", label: "شراء مباشر" }],
  RECEIVED: [{ value: "RECEIVED", label: "مستلم" }],
  CANCELLED: [{ value: "CANCELLED", label: "ملغى" }],
};

interface OrdersTableProps {
  orders: PurchaseOrder[];
  products: Product[];
  suppliers: Supplier[];
}

const OrdersTable = ({ orders, products, suppliers }: OrdersTableProps) => {
  const openModal = useModalStore((state) => state.openModal);
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusChange = async (
    orderId: string,
    currentStatus: PurchaseOrder["status"],
    newStatus: PurchaseOrder["status"],
  ) => {
    if (newStatus === currentStatus) return;
    try {
      setUpdatingId(orderId);
      const result = await updatePurchaseOrderStatus(orderId, newStatus);
      toast.success(result.message || "تم تحديث حالة الطلب بنجاح");
      router.refresh();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "حدث خطأ أثناء تغيير الحالة",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const columns = [
    columnHelper.accessor("orderNumber", {
      header: "رقم الطلب",
      cell: (info) => (
        <span className="font-mono font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs">
          {info.getValue()}
        </span>
      ),
    }),

    columnHelper.accessor("supplierName", {
      header: "المورد",
      cell: (info) => (
        <div className="flex items-center gap-2 max-w-45">
          <LuUser className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="font-semibold text-gray-900 truncate">
            {info.getValue() || "غير محدد"}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("items", {
      header: "عدد المواد",
      cell: (info) => {
        const items = info.getValue() || [];
        const totalItems = items.reduce(
          (acc, item) => acc + (item.quantity || 0),
          0,
        );
        return (
          <div className="flex items-center gap-1.5 text-gray-700 text-sm">
            <LuPackage className="h-4 w-4 text-gray-400" />
            <span>{totalItems} قطعة</span>
          </div>
        );
      },
    }),

    columnHelper.accessor("totalAmount", {
      header: "الإجمالي",
      cell: (info) => (
        <span className="font-mono font-bold text-gray-900">
          {(info.getValue() || 0).toLocaleString()} ريال
        </span>
      ),
    }),

    columnHelper.accessor("orderDate", {
      header: "تاريخ الشراء",
      cell: (info) => {
        const dateVal = info.getValue();
        return (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <LuCalendar className="h-3.5 w-3.5" />
            <span>
              {dateVal
                ? new Date(dateVal).toLocaleDateString("ar-EG", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "-"}
            </span>
          </div>
        );
      },
    }),

    columnHelper.accessor("status", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        const orderId = info.row.original.id;
        const availableStatuses = statusOptions[status];

        const statusStyles: Record<string, string> = {
          DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
          APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
          DIRECT: "bg-emerald-50 text-emerald-700 border-emerald-200",
          RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
          CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
        };

        const dotColors: Record<string, string> = {
          DRAFT: "bg-amber-500",
          APPROVED: "bg-blue-500",
          DIRECT: "bg-emerald-500",
          RECEIVED: "bg-emerald-500",
          CANCELLED: "bg-rose-500",
        };

        return (
          <div className="relative inline-block">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                statusStyles[status] || statusStyles.DRAFT
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  dotColors[status] || dotColors.DRAFT
                }`}
              />
              <select
                value={status}
                disabled={
                  updatingId === orderId || availableStatuses.length === 1
                }
                onChange={(e) =>
                  handleStatusChange(
                    orderId,
                    status,
                    e.target.value as PurchaseOrder["status"],
                  )
                }
                className="bg-transparent outline-none cursor-pointer border-none p-0 pr-1 text-xs font-semibold focus:ring-0 disabled:opacity-50"
              >
                {availableStatuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const isDraft = row.original.status === "DRAFT";

        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="عرض التفاصيل"
              title="عرض التفاصيل"
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              onClick={() =>
                openModal("VIEW", {
                  title: `تفاصيل الطلب ${row.original.orderNumber}`,
                  content: (
                    <OrderDetailsModalContent initialData={row.original} />
                  ),
                })
              }
            >
              <LuEye className="h-5 w-5" />
            </button>

            {isDraft ? (
              <>
                <button
                  type="button"
                  aria-label="تعديل الطلب"
                  title="تعديل الطلب"
                  className="rounded-lg p-1 text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  onClick={() =>
                    openModal("UPDATE", {
                      title: "تعديل مسودة طلب الشراء",
                      content: (
                        <UpdateOrderModalContent
                          suppliers={suppliers}
                          products={products}
                          initialOrder={row.original}
                        />
                      ),
                    })
                  }
                >
                  <LuSquarePen className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  aria-label="حذف الطلب"
                  title="حذف الطلب"
                  className="rounded-lg p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                  onClick={() =>
                    openModal("DELETE_CONFIRM", {
                      rowId: row.original.id,
                      itemName: `طلب الشراء ${row.original.orderNumber}`,
                      actionFunction: deletePurchaseOrder,
                      content: <DeleteConfirmationModal />,
                    })
                  }
                >
                  <LuTrash2 className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <button
                  disabled
                  title="لا يمكن التعديل بعد الموافقة أو الشراء المباشر"
                  className="rounded-lg p-1 text-gray-300 cursor-not-allowed!"
                >
                  <LuSquarePen className="h-5 w-5" />
                </button>

                <button
                  disabled
                  title="لا يمكن الحذف بعد الموافقة أو الشراء المباشر"
                  className="rounded-lg p-1 text-gray-300 cursor-not-allowed!"
                >
                  <LuTrash2 className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        );
      },
    }),
  ];

  return <Table columns={columns} data={orders} />;
};

export default OrdersTable;

"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import toast from "react-hot-toast";

import { useForm } from "react-hook-form";

import Table from "@/components/shared/Table";

import { useModalStore } from "@/store/useModalStore";

import { createColumnHelper } from "@tanstack/react-table";

import {
  LuBadgeCheck,
  LuCalendar,
  LuCheck,
  LuCircleDollarSign,
  LuEye,
  LuLoader,
  LuPackage,
  LuSquarePen,
  LuTrash2,
  LuUser,
  LuWalletCards,
  LuX,
} from "react-icons/lu";

import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";

import { PurchaseOrder, PurchaseOrderStatus } from "../schemas/orders.schemas";

import {
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
} from "../services/order.services";

/* =========================================================
   TYPES
========================================================= */

const columnHelper = createColumnHelper<PurchaseOrder>();

type ReceivePaymentForm = {
  amount: number;
  paymentMethod: "CASH" | "BANK";
  paymentDate: string;
  reference: string;
  notes: string;
};

interface OrdersTableProps {
  orders: PurchaseOrder[];
}

interface ReceivePurchaseModalProps {
  order: PurchaseOrder;
  onClose: () => void;
  onSuccess: () => void;
}

/* =========================================================
   STATUS OPTIONS
========================================================= */

const statusOptions: Record<
  PurchaseOrderStatus,
  {
    value: PurchaseOrderStatus;
    label: string;
  }[]
> = {
  DRAFT: [
    {
      value: "DRAFT",
      label: "مسودة",
    },
    {
      value: "APPROVED",
      label: "تمت الموافقة",
    },
    {
      value: "CANCELLED",
      label: "ملغى",
    },
  ],

  APPROVED: [
    {
      value: "APPROVED",
      label: "تمت الموافقة",
    },
    {
      value: "RECEIVED",
      label: "مستلم",
    },
  ],

  RECEIVED: [
    {
      value: "RECEIVED",
      label: "مستلم",
    },
  ],

  CANCELLED: [
    {
      value: "CANCELLED",
      label: "ملغى",
    },
    {
      value: "DRAFT",
      label: "مسودة",
    },
  ],
};

/* =========================================================
   HELPERS
========================================================= */

const getToday = () => {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/* =========================================================
   RECEIVE MODAL
========================================================= */

function ReceivePurchaseModal({
  order,
  onClose,
  onSuccess,
}: ReceivePurchaseModalProps) {
  const [isPending, setIsPending] = useState(false);

  const [paymentEnabled, setPaymentEnabled] = useState(false);

  const remainingAmount = Math.max(
    0,
    Number(
      order.remainingAmount ?? order.totalAmount - (order.paidAmount ?? 0),
    ),
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ReceivePaymentForm>({
    defaultValues: {
      amount: remainingAmount,
      paymentMethod: "CASH",
      paymentDate: getToday(),
      reference: "",
      notes: "",
    },
  });

  const paymentAmount = Number(watch("amount") || 0);

  const remainingAfterPayment = Math.max(remainingAmount - paymentAmount, 0);

  const handleFullPayment = () => {
    setValue("amount", Number(remainingAmount.toFixed(2)), {
      shouldValidate: true,
    });
  };

  const handleNoPayment = () => {
    setPaymentEnabled(false);

    setValue("amount", 0, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: ReceivePaymentForm) => {
    if (paymentEnabled && data.amount <= 0) {
      toast.error("أدخل مبلغ الدفعة أو اختر الاستلام بدون دفع");

      return;
    }

    if (paymentEnabled && data.amount > remainingAmount) {
      toast.error(
        `مبلغ الدفعة أكبر من المبلغ المتبقي (${remainingAmount.toFixed(
          2,
        )} ريال)`,
      );

      return;
    }

    try {
      setIsPending(true);

      const payment =
        paymentEnabled && Number(data.amount) > 0
          ? {
              amount: Number(data.amount.toFixed(2)),

              paymentDate: data.paymentDate || null,

              paymentMethod: data.paymentMethod,

              reference: data.reference.trim() || null,

              notes: data.notes.trim() || null,
            }
          : undefined;

      const result = await updatePurchaseOrderStatus(
        order.id,
        "RECEIVED",
        payment,
      );

      toast.success(
        result.message ||
          (payment
            ? "تم استلام الطلب وتسجيل الدفعة بنجاح"
            : "تم استلام الطلب وتحديث المخزون بنجاح"),
      );

      onClose();
      onSuccess();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "تعذر استلام طلب الشراء",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          if (!isPending) {
            onClose();
          }
        }
      }}
    >
      <div
        dir="rtl"
        className="w-full max-w-xl h-150 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-2xl"
      >
        {/* =================================================
            HEADER
        ================================================== */}

        <div className="flex items-start justify-between border-b border-gray-100 p-6">
          <div>
            <h3 className="text-lg font-bold text-gray-950">
              استلام طلب الشراء
            </h3>

            <p className="mt-1 text-xs text-gray-500">{order.orderNumber}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="إغلاق"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* =================================================
            CONTENT
        ================================================== */}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6">
          {/* ===============================================
              ORDER SUMMARY
          =============================================== */}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">إجمالي الطلب</p>

                <p className="mt-1 font-mono font-bold text-gray-900">
                  {Number(order.totalAmount).toFixed(2)} ر.س
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">المتبقي</p>

                <p className="mt-1 font-mono font-bold text-amber-600">
                  {remainingAmount.toFixed(2)} ر.س
                </p>
              </div>
            </div>
          </div>

          {/* ===============================================
              PAYMENT DECISION
          =============================================== */}

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              عند الاستلام
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setPaymentEnabled(false)}
                className={`
                  flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition
                  ${
                    !paymentEnabled
                      ? "border-(--primary-red) bg-red-50 text-(--primary-red)"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }
                `}
              >
                <LuCheck className="h-4 w-4" />
                استلام بدون دفع
              </button>

              <button
                type="button"
                disabled={isPending || remainingAmount <= 0}
                onClick={() => {
                  setPaymentEnabled(true);

                  if (remainingAmount > 0) {
                    handleFullPayment();
                  }
                }}
                className={`
                  flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition
                  ${
                    paymentEnabled
                      ? "border-(--primary-red) bg-red-50 text-(--primary-red)"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }
                `}
              >
                <LuWalletCards className="h-4 w-4" />
                تسجيل دفعة
              </button>
            </div>
          </div>

          {/* ===============================================
              PAYMENT FORM
          =============================================== */}

          {paymentEnabled && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              {/* Amount */}

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700">
                    مبلغ الدفعة
                  </label>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleFullPayment}
                    className="text-xs font-semibold text-(--primary-red) hover:underline"
                  >
                    دفع كامل
                  </button>
                </div>

                <input
                  type="number"
                  min="0.01"
                  max={remainingAmount}
                  step="0.01"
                  {...register("amount", {
                    valueAsNumber: true,

                    required: "مبلغ الدفعة مطلوب",

                    min: {
                      value: 0.01,
                      message: "مبلغ الدفعة يجب أن يكون أكبر من صفر",
                    },

                    max: {
                      value: remainingAmount,
                      message: `الحد الأقصى ${remainingAmount.toFixed(2)} ريال`,
                    },
                  })}
                  disabled={isPending}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm outline-none transition focus:border-(--primary-red)"
                />

                {errors.amount && (
                  <p className="mt-1 text-xs text-rose-500">
                    {errors.amount.message}
                  </p>
                )}
              </div>

              {/* Method */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  طريقة الدفع
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      value="CASH"
                      {...register("paymentMethod")}
                      disabled={isPending}
                      className="peer sr-only"
                    />

                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-600 transition peer-checked:border-(--primary-red) peer-checked:bg-red-50 peer-checked:text-(--primary-red)">
                      نقداً
                    </div>
                  </label>

                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      value="BANK"
                      {...register("paymentMethod")}
                      disabled={isPending}
                      className="peer sr-only"
                    />

                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-600 transition peer-checked:border-(--primary-red) peer-checked:bg-red-50 peer-checked:text-(--primary-red)">
                      بنك / تحويل
                    </div>
                  </label>
                </div>
              </div>

              {/* Date + Reference */}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    تاريخ الدفع
                  </label>

                  <input
                    type="date"
                    {...register("paymentDate")}
                    disabled={isPending}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    المرجع
                  </label>

                  <input
                    type="text"
                    maxLength={100}
                    placeholder="رقم التحويل"
                    {...register("reference")}
                    disabled={isPending}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
                  />
                </div>
              </div>

              {/* Preview */}

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">المتبقي بعد الدفع</span>

                  <span className="font-mono font-bold text-gray-900">
                    {Math.max(remainingAfterPayment, 0).toFixed(2)} ر.س
                  </span>
                </div>
              </div>

              {/* Notes */}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  ملاحظات
                </label>

                <textarea
                  rows={2}
                  {...register("notes")}
                  disabled={isPending}
                  placeholder="ملاحظات عن الدفعة..."
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
                />
              </div>
            </div>
          )}

          {/* =================================================
              ACTIONS
          ================================================== */}

          <div className="flex items-center justify-between border-t border-gray-100 pt-5">
            <button
              type="button"
              disabled={isPending}
              onClick={handleNoPayment}
              className="text-xs font-semibold text-gray-500 transition hover:text-gray-800"
            >
              استلام بدون دفع
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={
                  isPending ||
                  (paymentEnabled &&
                    (paymentAmount <= 0 || paymentAmount > remainingAmount))
                }
                className="inline-flex items-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <LuLoader className="h-4 w-4 animate-spin" />}

                {isPending
                  ? "جاري التنفيذ..."
                  : paymentEnabled
                    ? "استلام وتسجيل الدفعة"
                    : "تأكيد الاستلام"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   ORDERS TABLE
========================================================= */

const OrdersTable = ({ orders }: OrdersTableProps) => {
  const openModal = useModalStore((state) => state.openModal);

  const router = useRouter();

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  /* =======================================================
     STATUS CHANGE
  ======================================================= */

  const handleStatusChange = async (
    order: PurchaseOrder,
    newStatus: PurchaseOrderStatus,
  ) => {
    const currentStatus = order.status;

    if (newStatus === currentStatus) {
      return;
    }

    /* =====================================================
       RECEIVED

       الاستلام يحتاج قرار دفع:
       - بدون دفع
       - كامل
       - جزئي
    ===================================================== */

    if (newStatus === "RECEIVED") {
      setReceiveOrder(order);
      return;
    }

    try {
      setUpdatingId(order.id);

      const result = await updatePurchaseOrderStatus(order.id, newStatus);

      toast.success(result?.message || "تم تحديث حالة الطلب بنجاح");

      router.refresh();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "حدث خطأ أثناء تغيير الحالة",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* =======================================================
     COLUMNS
  ======================================================= */

  const columns = [
    /* =====================================================
       ORDER NUMBER
    ===================================================== */

    columnHelper.accessor("orderNumber", {
      header: "رقم الطلب",

      cell: (info) => (
        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs font-bold text-gray-900">
          {info.getValue()}
        </span>
      ),
    }),

    /* =====================================================
       SUPPLIER
    ===================================================== */

    columnHelper.accessor("supplierName", {
      header: "المورد",

      cell: (info) => (
        <div className="flex max-w-45 items-center gap-2">
          <LuUser className="h-4 w-4 shrink-0 text-gray-400" />

          <span className="truncate font-semibold text-gray-900">
            {info.getValue() || "غير محدد"}
          </span>
        </div>
      ),
    }),

    /* =====================================================
       ITEMS
    ===================================================== */

    columnHelper.accessor("items", {
      header: "عدد المنتجات",

      cell: (info) => {
        const items = info.getValue() || [];

        const totalItems = items.reduce(
          (acc, item) => acc + (item.quantity || 0),
          0,
        );

        return (
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <LuPackage className="h-4 w-4 text-gray-400" />

            <span>
              {totalItems} {totalItems > 10 ? "منتج" : "منتجات"}
            </span>
          </div>
        );
      },
    }),

    /* =====================================================
       TOTAL
    ===================================================== */

    columnHelper.accessor("totalAmount", {
      header: "الإجمالي",

      cell: (info) => (
        <span className="font-mono font-bold text-gray-900">
          {(info.getValue() || 0).toLocaleString()} ريال
        </span>
      ),
    }),

    columnHelper.accessor("paymentStatus", {
      header: "الدفع",

      cell: (info) => {
        const status = info.getValue();

        const config = {
          UNPAID: {
            label: "غير مدفوع",
            className: "border-rose-200 bg-rose-50 text-rose-700",
            icon: LuCircleDollarSign,
          },

          PARTIAL: {
            label: "مدفوع جزئيًا",
            className: "border-amber-200 bg-amber-50 text-amber-700",
            icon: LuCircleDollarSign,
          },

          PAID: {
            label: "مدفوع بالكامل",
            className: "border-emerald-200 bg-emerald-50 text-emerald-700",
            icon: LuBadgeCheck,
          },
        } as const;

        const current = config[status ?? "UNPAID"];

        const Icon = current.icon;

        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${current.className}`}
          >
            <Icon className="h-3.5 w-3.5" />

            {current.label}
          </span>
        );
      },
    }),

    /* =====================================================
       DATE
    ===================================================== */

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

    /* =====================================================
       STATUS
    ===================================================== */

    columnHelper.accessor("status", {
      header: "الحالة",

      cell: (info) => {
        const status = info.getValue();

        const order = info.row.original;

        const orderId = order.id;

        const isDirect = order.purchaseType === "DIRECT";

        const availableStatuses = statusOptions[status] || [
          {
            value: status,
            label: status,
          },
        ];

        const statusStyles: Record<string, string> = {
          DRAFT: "bg-amber-50 text-amber-700 border-amber-200",

          APPROVED: "bg-blue-50 text-blue-700 border-blue-200",

          RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",

          CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
        };

        const dotColors: Record<string, string> = {
          DRAFT: "bg-amber-500",

          APPROVED: "bg-blue-500",

          RECEIVED: "bg-emerald-500",

          CANCELLED: "bg-rose-500",
        };

        /* ===============================================
             DIRECT

             Direct purchases are already received.
          =============================================== */

        if (isDirect) {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              شراء مباشر
            </span>
          );
        }

        return (
          <div className="relative inline-block">
            <span
              className={`
                  inline-flex items-center gap-1.5
                  rounded-full border px-2.5 py-0.5
                  text-xs font-medium
                  ${statusStyles[status] || statusStyles.DRAFT}
                `}
            >
              <span
                className={`
                    h-1.5 w-1.5 rounded-full
                    ${dotColors[status] || dotColors.DRAFT}
                  `}
              />

              <select
                value={status}
                disabled={
                  updatingId === orderId || availableStatuses.length <= 1
                }
                onChange={(event) =>
                  handleStatusChange(
                    order,
                    event.target.value as PurchaseOrderStatus,
                  )
                }
                className="cursor-pointer border-none bg-transparent p-0 pr-1 text-xs font-semibold outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-75"
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

    /* =====================================================
       ACTIONS
    ===================================================== */

    columnHelper.display({
      id: "actions",

      cell: ({ row }) => {
        const order = row.original;

        const isDraft = order.status === "DRAFT";

        return (
          <div className="flex items-center justify-center gap-2">
            {/* View */}

            <button
              type="button"
              aria-label="عرض التفاصيل"
              title="عرض التفاصيل"
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              onClick={() => router.push(`/dashboard/orders/${order.id}`)}
            >
              <LuEye className="h-5 w-5" />
            </button>

            {/* Draft actions */}

            {isDraft && (
              <>
                <button
                  type="button"
                  aria-label="تعديل الطلب"
                  title="تعديل الطلب"
                  className="rounded-lg p-1 text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  onClick={() =>
                    router.push(`/dashboard/orders/${order.id}/edit`)
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
                      rowId: order.id,

                      itemName: `طلب الشراء ${order.orderNumber}`,

                      actionFunction: deletePurchaseOrder,

                      content: <DeleteConfirmationModal />,
                    })
                  }
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

  return (
    <>
      <Table columns={columns} data={orders} />

      {/* ===================================================
          RECEIVE / PAYMENT MODAL
      =================================================== */}

      {receiveOrder && (
        <ReceivePurchaseModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onSuccess={() => {
            setReceiveOrder(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
};

export default OrdersTable;

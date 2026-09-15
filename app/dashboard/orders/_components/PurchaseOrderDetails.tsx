"use client";

import Link from "next/link";
import { PurchaseOrder } from "../schemas/orders.schemas";
import { useEffect, useState } from "react";
import { LuCircleDollarSign } from "react-icons/lu";
import PaymentModal from "./PaymentModal";

interface Props {
  order: PurchaseOrder;
}

const formatNumber = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

const formatCurrency = (value: number) => `${formatNumber(value)} ر.س`;

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getStatusLabel = (status: PurchaseOrder["status"]) => {
  switch (status) {
    case "DRAFT":
      return "مسودة";

    case "APPROVED":
      return "تمت الموافقة";

    case "RECEIVED":
      return "مستلم";

    case "CANCELLED":
      return "ملغى";

    default:
      return status;
  }
};

const getStatusClasses = (status: PurchaseOrder["status"]) => {
  switch (status) {
    case "DRAFT":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "APPROVED":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "RECEIVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-700";

    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
};

const getPaymentStatus = (total: number, paid: number) => {
  if (paid <= 0) {
    return {
      label: "غير مدفوع",
      classes: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (paid >= total) {
    return {
      label: "مدفوع بالكامل",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "مدفوع جزئيًا",
    classes: "border-amber-200 bg-amber-50 text-amber-700",
  };
};

export default function PurchaseOrderDetailView({ order }: Props) {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("purchase-order-printing");
    };

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  const handlePrint = () => {
    document.body.classList.add("purchase-order-printing");
    window.print();
  };

  const subtotal = Number(
    order.subtotal ??
      order.items?.reduce(
        (sum, item) =>
          sum + Number(item.unitCost || 0) * Number(item.quantity || 0),
        0,
      ) ??
      0,
  );

  const deliveryCost = Number(order.deliveryCost || 0);

  const discountAmount = Number(order.discountAmount || 0);

  const totalAmount = Number(
    order.totalAmount ?? subtotal + deliveryCost - discountAmount,
  );

  const paidAmount = Number(order.paidAmount || 0);

  const remainingAmount = Math.max(totalAmount - paidAmount, 0);

  const paymentStatus = getPaymentStatus(totalAmount, paidAmount);

  const totalQuantity =
    order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ||
    0;

  return (
    <>
      <div className="min-h-screen">
        {/* =========================
            TOP ACTION BAR
        ========================== */}
        <div className="mb-6 flex flex-col gap-4 print:hidden md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              تفاصيل أمر الشراء
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              عرض تفاصيل المستند والبيانات المالية
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/orders"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              العودة للقائمة
            </Link>

            {paymentStatus.label !== "مدفوع بالكامل" &&
              (order.status === "APPROVED" || order.status === "RECEIVED") && (
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                >
                  <LuCircleDollarSign className="h-4 w-4" />

                  {paymentStatus.label === "غير مدفوع"
                    ? "تسجيل دفعة"
                    : "تسجيل دفعة جديدة"}
                </button>
              )}

            {order.status === "DRAFT" && (
              <Link
                href={`/dashboard/orders/${order.id}/edit`}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                تعديل الطلب
              </Link>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-(--primary-red) px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              طباعة أمر الشراء
            </button>
          </div>
        </div>

        {/* =========================
            PRINTABLE DOCUMENT
        ========================== */}
        <div
          id="printable-purchase-order"
          className="overflow-hidden rounded-2xl border border-gray-300 bg-white print:rounded-none print:border-0 print:shadow-none"
        >
          {/* =========================
              HEADER
          ========================== */}
          <div className="border-b border-gray-200 p-7 print:py-2 print:px-4">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-3 print:mb-1 print:gap-1.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white print:h-7 print:w-7">
                    <svg
                      className="h-5 w-5 print:h-4 print:w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        d="M9 12h6m-6 4h6M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2z"
                      />
                    </svg>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 print:text-base">
                      أمر شراء
                    </h2>

                    <p className="mt-0.5 text-sm text-gray-500 print:text-[10px]">
                      Purchase Order
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-500 print:text-xs">رقم الطلب</span>

                  <span className="rounded-md bg-gray-50 px-2 py-1 font-mono font-semibold text-gray-900 print:py-0.5 print:text-xs">
                    {order.orderNumber}
                  </span>
                </div>
              </div>

              <div className="md:text-right">
                <div className="mb-3 flex flex-wrap justify-end gap-2 print:mb-1 print:justify-start">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold print:py-0.5 print:text-[10px] ${getStatusClasses(
                      order.status,
                    )}`}
                  >
                    {getStatusLabel(order.status)}
                  </span>

                  <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 print:py-0.5 print:text-[10px]">
                    {order.purchaseType === "DIRECT"
                      ? "شراء مباشر"
                      : "طلب شراء"}
                  </span>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold print:py-0.5 print:text-[10px] ${paymentStatus.classes}`}
                  >
                    {paymentStatus.label}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-gray-500 print:space-y-0 print:text-xs">
                  <p>
                    تاريخ الطلب:{" "}
                    <span className="font-medium text-gray-900">
                      {formatDate(order.orderDate)}
                    </span>
                  </p>

                  <p>
                    تاريخ الإنشاء:{" "}
                    <span className="font-medium text-gray-900">
                      {formatDate(order.createdAt)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* =========================
              ORDER INFO
          ========================== */}
          <div className="grid gap-4 border-b border-gray-200 px-6 py-6 sm:grid-cols-2 print:gap-2 print:px-4 print:py-2 md:grid-cols-3 md:px-8">
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white print:p-1.5">
              <p className="mb-2 text-xs font-semibold text-gray-500 print:mb-0.5 print:text-[10px]">
                المورد
              </p>

              <p className="text-sm font-semibold text-gray-900 print:text-xs">
                {order.supplierName || "غير محدد"}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white print:p-1.5">
              <p className="mb-2 text-xs font-semibold text-gray-500 print:mb-0.5 print:text-[10px]">
                تاريخ الاستلام المتوقع
              </p>

              <p className="text-sm font-semibold text-gray-900 print:text-xs">
                {formatDate(order.expectedDate)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white print:p-1.5">
              <p className="mb-2 text-xs font-semibold text-gray-500 print:mb-0.5 print:text-[10px]">
                إجمالي المواد
              </p>

              <p className="text-sm font-semibold text-gray-900 print:text-xs">
                {formatNumber(totalQuantity)}
              </p>
            </div>
          </div>

          {/* =========================
              ITEMS TABLE
          ========================== */}
          <div className="px-6 py-6 print:px-4 print:py-2 md:px-8">
            <div className="mb-3 print:mb-1">
              <h3 className="text-sm font-bold text-gray-900 print:text-xs">
                المواد
              </h3>

              <p className="mt-1 text-xs text-gray-500 print:hidden">
                تفاصيل المواد المدرجة في أمر الشراء
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="w-12 border-b border-gray-200 px-3 py-3 text-center text-xs font-semibold print:py-1 print:text-[11px]">
                      #
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold print:py-1 print:text-[11px]">
                      المنتج
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold print:py-1 print:text-[11px]">
                      SKU
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-center text-xs font-semibold print:py-1 print:text-[11px]">
                      الكمية
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold print:py-1 print:text-[11px]">
                      سعر الوحدة
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold print:py-1 print:text-[11px]">
                      الإجمالي
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {order.items?.map((item, index) => {
                    const quantity = Number(item.quantity || 0);

                    const unitCost = Number(item.unitCost || 0);

                    const itemTotal = quantity * unitCost;

                    const attributes = [
                      item.colorName && `اللون: ${item.colorName}`,
                      item.size && `المقاس: ${item.size}`,
                    ]
                      .filter(Boolean)
                      .join(" | ");

                    return (
                      <tr
                        key={item.id || `${item.variantId}-${index}`}
                        className="align-top"
                      >
                        <td className="px-3 py-4 text-center text-xs text-gray-400 print:py-1 print:text-[11px]">
                          {index + 1}
                        </td>

                        <td className="px-4 py-4 print:py-1">
                          <p className="font-semibold text-gray-900 print:text-xs">
                            {item.productName || "منتج"}
                          </p>

                          {attributes && (
                            <p className="mt-1 text-xs text-gray-500 print:mt-0 print:text-[10px]">
                              {attributes}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4 font-mono text-xs text-gray-500 print:py-1 print:text-[10px]">
                          {item.sku || "-"}
                        </td>

                        <td className="px-4 py-4 text-center font-medium text-gray-900 print:py-1 print:text-xs">
                          {formatNumber(quantity)}
                        </td>

                        <td className="px-4 py-4 text-left font-mono text-gray-700 print:py-1 print:text-xs">
                          {formatCurrency(unitCost)}
                        </td>

                        <td className="px-4 py-4 text-left font-mono font-semibold text-gray-900 print:py-1 print:text-xs">
                          {formatCurrency(itemTotal)}
                        </td>
                      </tr>
                    );
                  })}

                  {!order.items?.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-gray-400 print:py-4"
                      >
                        لا توجد مواد في هذا الطلب
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* =========================
              FINANCIAL + NOTES & SIGNATURES
          ========================== */}
          <div className="grid gap-6 border-t border-gray-200 p-6 print:gap-3 print:p-4 md:grid-cols-2">
            {/* Financial */}
            <div className="md:order-2">
              <h3 className="mb-3 text-sm font-bold text-gray-900 print:mb-1 print:text-xs">
                الملخص المالي
              </h3>

              <div className="rounded-xl border border-gray-200 p-4 print:p-2">
                <div className="space-y-3 text-sm print:space-y-1 print:text-xs">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>المجموع الفرعي</span>

                    <span className="font-mono">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  {deliveryCost > 0 && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span>تكلفة الشحن</span>

                      <span className="font-mono">
                        + {formatCurrency(deliveryCost)}
                      </span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-rose-600">
                      <span>الخصم</span>

                      <span className="font-mono">
                        - {formatCurrency(discountAmount)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3 print:pt-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">
                        الإجمالي النهائي
                      </span>

                      <span className="font-mono text-base font-bold text-gray-900 print:text-xs">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50 px-3 py-2.5 print:py-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-emerald-700">
                        المدفوع
                      </span>

                      <span className="font-mono font-bold text-emerald-700">
                        {formatCurrency(paidAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-amber-50 px-3 py-2.5 print:py-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-amber-700">
                        المتبقي
                      </span>

                      <span className="font-mono font-bold text-amber-700">
                        {formatCurrency(remainingAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Integrated Signatures */}
            <div className="flex flex-col justify-between md:order-1">
              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-900 print:mb-1 print:text-xs">
                  الملاحظات
                </h3>

                <div className="min-h-24 rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:min-h-16 print:bg-white print:p-2">
                  {order.notes ? (
                    <p className="whitespace-pre-line text-sm leading-7 text-gray-700 print:text-xs print:leading-5">
                      {order.notes}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 print:text-xs">
                      لا توجد ملاحظات لهذا الطلب
                    </p>
                  )}
                </div>
              </div>

              {/* PRINT SIGNATURES - Positioned on top-left area in printable grid layout */}
              <div className="hidden pt-6 print:grid print:grid-cols-2 print:gap-6 print:pt-4">
                <div>
                  <p className="mb-6 text-xs font-semibold text-gray-700">
                    المسؤول / المستلم:
                  </p>
                  <div className="border-b border-gray-400" />
                </div>

                <div>
                  <p className="mb-6 text-xs font-semibold text-gray-700">
                    توقيع المورد:
                  </p>
                  <div className="border-b border-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* =========================
              PAYMENTS
          ========================== */}
          {order.payments && order.payments.length > 0 && (
            <div className="border-t border-gray-200 p-6 print:p-3">
              <div className="mb-3 print:mb-1">
                <h3 className="text-sm font-bold text-gray-900 print:text-xs">
                  الدفعات
                </h3>

                <p className="mt-1 text-xs text-gray-500 print:hidden">
                  سجل الدفعات المسجلة على أمر الشراء
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600 print:py-1 print:text-[11px]">
                        التاريخ
                      </th>

                      <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600 print:py-1 print:text-[11px]">
                        طريقة الدفع
                      </th>

                      <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600 print:py-1 print:text-[11px]">
                        الملاحظات
                      </th>

                      <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-600 print:py-1 print:text-[11px]">
                        المبلغ
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {order.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3 text-gray-700 print:py-1 print:text-xs">
                          {formatDate(payment.paymentDate)}
                        </td>

                        <td className="px-4 py-3 text-gray-700 print:py-1 print:text-xs">
                          {payment.paymentMethod === "CASH"
                            ? "نقدًا"
                            : payment.paymentMethod === "BANK"
                              ? "تحويل بنكي"
                              : payment.paymentMethod || "-"}
                        </td>

                        <td className="px-4 py-3 text-gray-500 print:py-1 print:text-xs">
                          {payment.notes || "-"}
                        </td>

                        <td className="px-4 py-3 text-left font-mono font-semibold text-gray-900 print:py-1 print:text-xs">
                          {formatCurrency(Number(payment.amount || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================
              FOOTER
          ========================== */}
          <div className="border-t border-gray-200 p-6 print:p-2">
            <div className="flex flex-col gap-3 text-xs text-gray-400 md:flex-row md:items-center md:justify-between print:text-[10px]">
              <p>تم إنشاء هذا المستند من نظام إدارة المتجر.</p>

              <p className="font-mono">{order.orderNumber}</p>
            </div>
          </div>
        </div>
      </div>
      <PaymentModal
        isOpen={isPaymentModalOpen}
        orderId={order.id}
        remainingAmount={remainingAmount}
        onClose={() => setIsPaymentModalOpen(false)}
      />
    </>
  );
}

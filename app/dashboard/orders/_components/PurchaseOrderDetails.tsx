"use client";

import Link from "next/link";
import { PurchaseOrder } from "../schemas/orders.schemas";
import { useEffect } from "react";

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
        <div className="border-b border-gray-200 px-6 py-7 md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white print:bg-gray-900">
                  <svg
                    className="h-5 w-5"
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
                  <h2 className="text-2xl font-bold text-gray-900">أمر شراء</h2>

                  <p className="mt-0.5 text-sm text-gray-500">Purchase Order</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">رقم الطلب</span>

                <span className="rounded-md bg-gray-50 px-2 py-1 font-mono font-semibold text-gray-900">
                  {order.orderNumber}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="mb-3 flex flex-wrap justify-end gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                    order.status,
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </span>

                <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
                  {order.purchaseType === "DIRECT" ? "شراء مباشر" : "طلب شراء"}
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentStatus.classes}`}
                >
                  {paymentStatus.label}
                </span>
              </div>

              <div className="space-y-1 text-sm text-gray-500">
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
        <div className="grid gap-4 border-b border-gray-200 px-6 py-6 sm:grid-cols-2 md:grid-cols-3 md:px-8">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white">
            <p className="mb-2 text-xs font-semibold text-gray-500">المورد</p>

            <p className="text-sm font-semibold text-gray-900">
              {order.supplierName || "غير محدد"}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              تاريخ الاستلام المتوقع
            </p>

            <p className="text-sm font-semibold text-gray-900">
              {formatDate(order.expectedDate)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              إجمالي المواد
            </p>

            <p className="text-sm font-semibold text-gray-900">
              {formatNumber(totalQuantity)}
            </p>
          </div>
        </div>

        {/* =========================
            ITEMS TABLE
        ========================== */}
        <div className="px-6 py-6 md:px-8">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-gray-900">الأصناف</h3>

            <p className="mt-1 text-xs text-gray-500">
              تفاصيل المواد المدرجة في أمر الشراء
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="w-12 border-b border-gray-200 px-3 py-3 text-center text-xs font-semibold">
                    #
                  </th>

                  <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold">
                    المنتج
                  </th>

                  <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold">
                    SKU
                  </th>

                  <th className="border-b border-gray-200 px-4 py-3 text-center text-xs font-semibold">
                    الكمية
                  </th>

                  <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold">
                    سعر الوحدة
                  </th>

                  <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold">
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
                      <td className="px-3 py-4 text-center text-xs text-gray-400">
                        {index + 1}
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">
                          {item.productName || "منتج"}
                        </p>

                        {attributes && (
                          <p className="mt-1 text-xs text-gray-500">
                            {attributes}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 font-mono text-xs text-gray-500">
                        {item.sku || "-"}
                      </td>

                      <td className="px-4 py-4 text-center font-medium text-gray-900">
                        {formatNumber(quantity)}
                      </td>

                      <td className="px-4 py-4 text-left font-mono text-gray-700">
                        {formatCurrency(unitCost)}
                      </td>

                      <td className="px-4 py-4 text-left font-mono font-semibold text-gray-900">
                        {formatCurrency(itemTotal)}
                      </td>
                    </tr>
                  );
                })}

                {!order.items?.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-gray-400"
                    >
                      لا توجد أصناف في هذا الطلب
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =========================
            FINANCIAL + NOTES
        ========================== */}
        <div className="grid gap-6 border-t border-gray-200 px-6 py-6 md:grid-cols-2 md:px-8">
          {/* Financial */}
          <div className="md:order-2">
            <h3 className="mb-3 text-sm font-bold text-gray-900">
              الملخص المالي
            </h3>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span>المجموع الفرعي</span>

                  <span className="font-mono">{formatCurrency(subtotal)}</span>
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

                <div className="border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">
                      الإجمالي النهائي
                    </span>

                    <span className="font-mono text-base font-bold text-gray-900">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-emerald-700">
                      المدفوع
                    </span>

                    <span className="font-mono font-bold text-emerald-700">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-700">المتبقي</span>

                    <span className="font-mono font-bold text-amber-700">
                      {formatCurrency(remainingAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="md:order-1">
            <h3 className="mb-3 text-sm font-bold text-gray-900">الملاحظات</h3>

            <div className="min-h-30 rounded-xl border border-gray-200 bg-gray-50/70 p-4 print:bg-white">
              {order.notes ? (
                <p className="whitespace-pre-line text-sm leading-7 text-gray-700">
                  {order.notes}
                </p>
              ) : (
                <p className="text-sm text-gray-400">
                  لا توجد ملاحظات لهذا الطلب
                </p>
              )}
            </div>
          </div>
        </div>

        {/* =========================
            PAYMENTS
        ========================== */}
        {order.payments && order.payments.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-6 md:px-8">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-gray-900">الدفعات</h3>

              <p className="mt-1 text-xs text-gray-500">
                سجل الدفعات المسجلة على أمر الشراء
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600">
                      التاريخ
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600">
                      طريقة الدفع
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-right text-xs font-semibold text-gray-600">
                      الملاحظات
                    </th>

                    <th className="border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-600">
                      المبلغ
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {order.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(payment.paymentDate)}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {payment.paymentMethod === "CASH"
                          ? "نقدًا"
                          : payment.paymentMethod === "BANK"
                            ? "تحويل بنكي"
                            : payment.paymentMethod || "-"}
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {payment.notes || "-"}
                      </td>

                      <td className="px-4 py-3 text-left font-mono font-semibold text-gray-900">
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
        <div className="border-t border-gray-200 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-3 text-xs text-gray-400 md:flex-row md:items-center md:justify-between">
            <p>تم إنشاء هذا المستند من نظام إدارة المتجر.</p>

            <p className="font-mono">{order.orderNumber}</p>
          </div>
        </div>

        {/* =========================
            PRINT SIGNATURES
        ========================== */}
        <div className="hidden border-t border-gray-200 px-8 pb-8 pt-12 print:grid print:grid-cols-2 print:gap-20">
          <div>
            <p className="mb-10 text-sm font-semibold text-gray-700">
              المسؤول / المستلم
            </p>

            <div className="border-b border-gray-400" />
          </div>

          <div>
            <p className="mb-10 text-sm font-semibold text-gray-700">المورد</p>

            <div className="border-b border-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

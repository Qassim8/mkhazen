"use client";

import Link from "next/link";
import { PurchaseOrder } from "../schemas/orders.schemas";

interface Props {
  order: PurchaseOrder;
}

export default function PurchaseOrderDetailView({ order }: Props) {
  const handlePrint = () => {
    window.print();
  };

  // احتساب الإجماليات
  const subtotal =
    order.items?.reduce(
      (acc, item) => acc + item.unitCost * item.quantity,
      0,
    ) || 0;

  const deliveryCost = order.deliveryCost || 0;
  const discountAmount = order.discountAmount || 0;
  const grandTotal = subtotal + deliveryCost - discountAmount;

  // شارات الحالة
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2.5 py-1 rounded-full font-medium">
            مسودة
          </span>
        );
      case "COMPLETED":
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-1 rounded-full font-medium">
            مكتمل
          </span>
        );
      case "CANCELLED":
        return (
          <span className="bg-rose-50 text-rose-700 border border-rose-200 text-xs px-2.5 py-1 rounded-full font-medium">
            ملغى
          </span>
        );
      default:
        return (
          <span className="bg-gray-50 text-gray-700 border border-gray-200 text-xs px-2.5 py-1 rounded-full font-medium">
            {status}
          </span>
        );
    }
  };

  return (
    <div>
      {/* شريط الإجراءات العلوي (يخفى أثناء الطباعة) */}
      <div className="flex items-center justify-between gap-4 mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            تفاصيل أمر الشراء
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            عرض مستند أمر الشراء وطباعته
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/orders"
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            العودة للقائمة
          </Link>

          {order.status === "DRAFT" && (
            <Link
              href={`/dashboard/orders/${order.id}/edit`}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
            >
              تعديل الطلب
            </Link>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-(--primary-red) px-5 py-2 text-sm font-semibold text-white hover:bg-(--primary-red)/80 transition flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
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
            طباعة الفاتورة
          </button>
        </div>
      </div>

      {/* تصميم الفاتورة والمستند (المنطقة القابلة للطباعة) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 print:shadow-none print:border-none print:p-0">
        {/* الترويسة الرئيسية */}
        <div className="flex justify-between items-start border-b border-gray-100 pb-6 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">أمر شراء</h2>
            <p className="text-sm text-gray-500 mt-1">
              رقم الطلب:{" "}
              <span className="font-mono font-semibold text-gray-800">
                {order.orderNumber}
              </span>
            </p>
          </div>
          <div className="text-left flex flex-col items-end gap-1">
            <div className="print:hidden">
              {renderStatusBadge(order.status)}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              تاريخ الإنشاء:{" "}
              {new Date(order.createdAt).toLocaleDateString("ar-SA")}
            </p>
          </div>
        </div>

        {/* تفاصيل المورد والتواريخ */}
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 print:bg-transparent print:p-0 print:border-none">
            <h3 className="font-semibold text-gray-700 mb-2">بيانات المورد</h3>
            {order.supplierId ? (
              <div className="space-y-1 text-gray-600">
                <p className="font-medium text-gray-900">
                  {order.supplierName}
                </p>
              </div>
            ) : (
              <p className="text-gray-400">غير محدد</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2 print:bg-transparent print:p-0 print:border-none">
            <h3 className="font-semibold text-gray-700 mb-2">معلومات الطلب</h3>
            <div className="flex justify-between text-gray-600">
              <span>تاريخ الشراء:</span>
              <span className="font-medium text-gray-900">
                {order.orderDate
                  ? new Date(order.orderDate).toLocaleDateString("ar-SA")
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>تاريخ الاستلام المتوقع:</span>
              <span className="font-medium text-gray-900">
                {order.expectedDate
                  ? new Date(order.expectedDate).toLocaleDateString("ar-SA")
                  : "-"}
              </span>
            </div>
          </div>
        </div>

        {/* جدول الأصناف */}
        <div className="overflow-hidden border border-gray-200 rounded-xl mb-6">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-700">
              <tr>
                <th className="py-3 px-4 font-semibold">#</th>
                <th className="py-3 px-4 font-semibold">المنتج</th>
                <th className="py-3 px-4 font-semibold">الرمز (SKU)</th>
                <th className="py-3 px-4 font-semibold text-center">الكمية</th>
                <th className="py-3 px-4 font-semibold text-left">
                  سعر الوحدة
                </th>
                <th className="py-3 px-4 font-semibold text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items?.map((item, index) => {
                const attributesStr = [
                  item.colorName && `اللون: ${item.colorName}`,
                  item.size && `المقاس: ${item.size}`,
                ]
                  .filter(Boolean)
                  .join(" | ");

                const itemTotal = item.unitCost * item.quantity;

                return (
                  <tr key={item.id || index}>
                    <td className="py-3.5 px-4 text-gray-400">{index + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-gray-900">
                        {item.productName || "منتج"}
                      </div>
                      {attributesStr && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {attributesStr}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-500">
                      {item.sku || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-center font-medium">
                      {item.quantity}
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono">
                      {item.unitCost.toLocaleString("ar-SA")} ر.س
                    </td>
                    <td className="py-3.5 px-4 text-left font-semibold font-mono text-gray-900">
                      {itemTotal.toLocaleString("ar-SA")} ر.س
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* القسم السفلي: המلاحظات والملخص المالي */}
        <div className="grid grid-cols-12 gap-6 pt-2">
          {/* الملاحظات */}
          <div className="col-span-7">
            {order.notes && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 print:bg-transparent print:p-0 print:border-none">
                <h4 className="text-xs font-semibold text-gray-500 mb-1">
                  ملاحظات
                </h4>
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* الملخص المالي */}
          <div className="col-span-5 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600 py-1">
              <span>المجموع الفرعي</span>
              <span className="font-mono">
                {subtotal.toLocaleString("ar-SA")} ر.س
              </span>
            </div>

            {deliveryCost > 0 && (
              <div className="flex justify-between text-gray-600 py-1">
                <span>تكلفة الشحن</span>
                <span className="font-mono">
                  + {deliveryCost.toLocaleString("ar-SA")} ر.س
                </span>
              </div>
            )}

            {discountAmount > 0 && (
              <div className="flex justify-between text-rose-600 py-1">
                <span>الخصم</span>
                <span className="font-mono">
                  - {discountAmount.toLocaleString("ar-SA")} ر.س
                </span>
              </div>
            )}

            <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-3 mt-2">
              <span>الإجمالي النهائي</span>
              <span className="font-mono text-emerald-600">
                {grandTotal.toLocaleString("ar-SA")} ر.س
              </span>
            </div>
          </div>
        </div>

        {/* ترويسة التوقيعات عند الطباعة فقط */}
        <div className="hidden print:flex justify-between items-end mt-16 pt-8 border-t border-gray-200 text-xs text-gray-500">
          <div>
            <p className="mb-8 font-semibold">توقيع المورد:</p>
            <p>______________________</p>
          </div>
          <div>
            <p className="mb-8 font-semibold">توقيع المستلم / المسؤول:</p>
            <p>______________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}

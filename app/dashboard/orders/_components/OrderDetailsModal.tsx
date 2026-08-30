"use client";

import { PurchaseOrder } from "../schemas/orders.schemas";

interface Props {
  initialData: PurchaseOrder;
}

export default function OrderDetailsModalContent({ initialData }: Props) {
  // حساب المبالغ والإجمالي
  const totalAmount =
    initialData.totalAmount ??
    initialData.items?.reduce(
      (sum, item) => sum + (item.unitCost || 0) * (item.quantity || 0),
      0,
    ) ??
    0;

  // تحديد خيارات حالة الطلب
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "DRAFT":
        return {
          label: "مسودة",
          bg: "bg-amber-100/60 text-amber-800",
          dot: "bg-amber-500",
        };
      case "COMPLETED":
      case "DELIVERED":
      case "RECEIVED":
        return {
          label: "مكتمل / مستلم",
          bg: "bg-emerald-100/60 text-emerald-800",
          dot: "bg-emerald-500",
        };
      case "CANCELLED":
        return {
          label: "ملغى",
          bg: "bg-rose-100/60 text-rose-800",
          dot: "bg-rose-500",
        };
      case "PENDING":
      default:
        return {
          label: "قيد الانتظار",
          bg: "bg-amber-100/60 text-amber-800",
          dot: "bg-amber-500",
        };
    }
  };

  const statusBadge = getStatusBadge(initialData.status);

  return (
    <div className="space-y-5 text-sm">
      {/* 1. شريط الحالة ورقم الطلب */}
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4 border border-gray-100">
        <div>
          <span className="text-xs font-medium text-gray-400 block mb-0.5">
            رقم طلب الشراء
          </span>
          <span className="font-bold text-gray-900 text-base" dir="ltr">
            #{initialData.orderNumber || initialData.id?.slice(0, 8)}
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusBadge.bg}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
          {statusBadge.label}
        </span>
      </div>

      {/* 2. شبكة التفاصيل الأساسية */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">المورد</span>
          <span className="font-semibold text-gray-800">
            {initialData.supplierName || "بدون مورد (عام)"}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">تاريخ الطلب</span>
          <span className="font-semibold text-gray-800" dir="ltr">
            {initialData.createdAt
              ? new Date(initialData.createdAt).toLocaleDateString("ar-EG")
              : "—"}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">
            التاريخ المتوقع للاستلام
          </span>
          <span className="font-semibold text-gray-800" dir="ltr">
            {initialData.expectedDate
              ? new Date(initialData.expectedDate).toLocaleDateString("ar-EG")
              : "غير حدد"}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">
            إجمالي الفاتورة
          </span>
          <span className="font-bold text-gray-900 text-base">
            {totalAmount.toLocaleString()} ريال
          </span>
        </div>
      </div>

      {/* 3. الملاحظات (إن وجدت) */}
      {initialData.notes && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">الملاحظات</span>
          <p className="text-gray-700 text-xs leading-relaxed">
            {initialData.notes}
          </p>
        </div>
      )}

      {/* 4. تفاصيل المنتجات المضمنة في الطلب */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="font-semibold text-gray-800 text-xs uppercase tracking-wider">
            المنتجات المضمنة ({initialData.items?.length || 0})
          </h4>
        </div>

        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
            {initialData.items && initialData.items.length > 0 ? (
              initialData.items.map((item) => {
                const itemSubtotal =
                  item.subtotal ?? (item.unitCost || 0) * (item.quantity || 0);

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 hover:bg-gray-50/50 transition"
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-gray-800 text-sm">
                        {item.productName || "منتج"}
                      </p>
                      <p className="text-xs text-gray-400">
                        الكمية:{" "}
                        <span className="font-medium text-gray-700">
                          {item.quantity}
                        </span>{" "}
                        ×{" "}
                        <span className="font-medium text-gray-700">
                          {item.unitCost} ريال
                        </span>
                      </p>
                    </div>

                    <div className="text-left">
                      <span className="font-bold text-gray-900 text-sm">
                        {itemSubtotal.toLocaleString()} ريال
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-gray-400">
                لا توجد عناصر مضمنة في هذا الطلب.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

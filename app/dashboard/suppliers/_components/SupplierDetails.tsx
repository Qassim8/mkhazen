"use client";

import { Supplier } from "../schemas/supplier.schemas";

interface Props {
  initialData: Supplier;
}

export default function SupplierViewContent({ initialData }: Props) {
  const isActive = initialData.isActive;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4 border border-gray-100">
        <span className="text-xs font-medium text-gray-500">
          حالة المورد الحالية
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isActive
              ? "bg-emerald-100/60 text-emerald-800"
              : "bg-rose-100/60 text-rose-800"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          {isActive ? "نشط" : "غير نشط"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">الاسم الكامل</span>
          <span className="font-semibold text-gray-800">
            {initialData.name}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">الايميل</span>
          <span className="font-semibold text-gray-800">
            {initialData.email}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1">رقم الهاتف</span>
          <span className="font-semibold text-gray-800" dir="ltr">
            {initialData.phone}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1"> جهة الاتصال</span>
          <span className="font-semibold text-gray-800">
            {initialData.contactPerson}
          </span>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="mb-1 block text-xs text-gray-400">العنوان</span>

          <span className="font-semibold text-gray-800">
            {initialData.address || "—"}
          </span>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="mb-1 block text-xs text-gray-400">الملاحظات</span>

          <span className="font-semibold text-gray-800">
            {initialData.notes || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

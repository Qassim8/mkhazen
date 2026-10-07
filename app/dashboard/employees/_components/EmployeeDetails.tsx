"use client";

import { Employee } from "@/types/types";

interface Props {
  initialData: Employee;
}

export default function EmployeeViewContent({ initialData }: Props) {
  const isActive = initialData.isActive;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4 border border-gray-100">
        <span className="text-xs font-medium text-gray-500">
          حالة الحساب الحالية
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
          <span className="block text-xs text-gray-400 mb-1">الوظيفة</span>
          <span className="font-semibold text-gray-800">
            {initialData.position === "tailor"
              ? "خياط"
              : initialData.position === "cashier"
                ? "كاشير"
                : "مدير"}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
          <span className="block text-xs text-gray-400 mb-1"> الدوام</span>
          <span className="font-semibold text-gray-800">
            {initialData.shift === "morning"
              ? "صباحي"
              : initialData.shift === "night"
                ? "مسائي"
                : "دوام كامل / مزدوج"}
          </span>
        </div>

        <div>
          {initialData.position === "tailor" ? (
            <div className="col-span-2 rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
              <span className="block text-xs text-gray-400 mb-1">العمولة</span>
              <span className="font-bold text-gray-900 text-base">
                {initialData.commissionRate}%
              </span>
            </div>
          ) : (
            <div className="col-span-2 rounded-2xl border border-gray-100 bg-gray-50/50 p-3.5">
              <span className="block text-xs text-gray-400 mb-1">الراتب</span>
              <span className="font-bold text-gray-900 text-base">
                {initialData.salary} ريال
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

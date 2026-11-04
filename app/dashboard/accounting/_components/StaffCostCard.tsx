"use client";

import { formatMoney } from "./AccountingOverviewClient";
import type { StaffCost } from "@/lib/staff-cost";

/** مجموعة "تكلفة الموظفين": الرواتب والعمولات والمصروفات اليومية كل بند منفصل ثم الإجمالي (عرض فقط) */
export default function StaffCostCard({ staffCost }: { staffCost: StaffCost }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h3 className="text-base font-black text-gray-900">تكلفة الموظفين</h3>
        <p className="mt-1 text-xs text-gray-500">
          عرض فقط: كل بند حساب منفصل في الدفاتر. السلف واستردادها ليست مصروفًا.
        </p>
      </div>

      <ul className="divide-y divide-gray-100 text-sm">
        {staffCost.items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-gray-600">{item.label}</span>
            <span className="font-mono font-bold text-gray-900">{formatMoney(item.valueUsd)}</span>
          </li>
        ))}

        <li className="flex items-center justify-between gap-3 pt-3 text-base font-black text-gray-950">
          <span>الإجمالي</span>
          <span className="font-mono">{formatMoney(staffCost.totalUsd)}</span>
        </li>
      </ul>
    </div>
  );
}

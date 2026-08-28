"use client";

import { UseFormRegister } from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";

interface PricingAndStockFormProps {
  register: UseFormRegister<ProductFormInputType>;
  selectedSellingUnit: string;
  selectedPurchaseUnit: string;
}

const UNITS = [
  { value: "قطعة", label: "قطعة (ثوب / صديري / عطر)" },
  { value: "متر", label: "متر (قماش بالمتر)" },
  { value: "طاقة", label: "طاقة" },
  { value: "درزن", label: "درزن" },
  { value: "كرتونة", label: "كرتونة" },
  { value: "كيلو", label: "كيلو" },
];

export default function PricingAndStockForm({
  register,
  selectedSellingUnit,
  selectedPurchaseUnit,
}: PricingAndStockFormProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
        التسعير ووحدات القياس والمخزون
      </h3>

      {/* اختيار وحدات البيع والشراء */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            وحدة الشراء
          </label>
          <select
            {...register("purchaseUnit")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            وحدة البيع الرئيسية
          </label>
          <select
            {...register("sellingUnit")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* الأسعار */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            سعر التكلفة / الشراء ({selectedPurchaseUnit})
          </label>
          <input
            type="number"
            step="0.01"
            {...register("purchasePrice")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            سعر البيع ({selectedSellingUnit})
          </label>
          <input
            type="number"
            step="0.01"
            {...register("sellingPrice")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>
      </div>

      {selectedSellingUnit === "طاقة" && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
          💡 <strong>ملاحظة للمخزون:</strong> سيتم تسجيل الكمية بعدد الطاقات.
          يُفضل ذكر عدد الأمتار في طاقة الثوب الواحدة ضمن وصف المنتج لضمان دقة
          البيع بالمتر لاحقاً.
        </div>
      )}

      {/* المخزون */}
      <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-50 pt-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            اقل سعر للبيع
          </label>
          <input
            type="number"
            {...register("minSellingPrice")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            حد إعادة الطلب (أقل كمية)
          </label>
          <input
            type="number"
            {...register("minStockLevel")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          الكمية المتوفرة ({selectedSellingUnit}) ويتم تحديثها تلقائياً عند
          تسجيل عمليات البيع والشراء
        </label>
        <input
          readOnly
          disabled
          type="number"
          {...register("stockQuantity")}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
        />
      </div>
    </div>
  );
}

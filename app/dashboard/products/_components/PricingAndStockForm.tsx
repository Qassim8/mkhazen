"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";

interface PricingAndStockFormProps {
  register: UseFormRegister<ProductFormInputType>;
  errors?: FieldErrors<ProductFormInputType>;
  selectedSellingUnit: string;
  selectedPurchaseUnit: string;
}

export default function PricingAndStockForm({
  register,
  errors,
  selectedSellingUnit,
  selectedPurchaseUnit,
}: PricingAndStockFormProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
        التسعير وإعدادات المخزون
      </h3>

      {/* الأسعار */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            سعر التكلفة / الشراء ({selectedPurchaseUnit}) *
          </label>
          <input
            type="number"
            step="0.01"
            {...register("variants.0.purchasePrice", { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
          {errors?.variants?.[0]?.purchasePrice && (
            <p className="text-xs text-red-500 mt-1">
              {errors.variants[0].purchasePrice.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            سعر البيع ({selectedSellingUnit}) *
          </label>
          <input
            type="number"
            step="0.01"
            {...register("variants.0.sellingPrice", { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
          {errors?.variants?.[0]?.sellingPrice && (
            <p className="text-xs text-red-500 mt-1">
              {errors.variants[0].sellingPrice.message}
            </p>
          )}
        </div>
      </div>

      {selectedSellingUnit === "طاقة" && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
          💡 <strong>ملاحظة للمخزون:</strong> سيتم تسجيل الكمية بعدد الطاقات.
          يُفضل ذكر عدد الأمتار في طاقة الثوب الواحدة ضمن وصف المنتج لضمان دقة
          البيع بالمتر لاحقاً.
        </div>
      )}

      {/* المخزون والحد الأدنى */}
      <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-50 pt-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            أقل سعر للبيع (الحد الأدنى)
          </label>
          <input
            type="number"
            step="0.01"
            {...register("variants.0.minSellingPrice", { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            حد إعادة الطلب (أقل كمية بالمخزن)
          </label>
          <input
            type="number"
            {...register("variants.0.minStockLevel", { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          الكمية المتوفرة ({selectedSellingUnit}) - يتم تحديثها تلقائياً عند
          الشراء والبيع
        </label>
        <input
          readOnly
          disabled
          type="number"
          {...register("variants.0.stockQuantity", { valueAsNumber: true })}
          className="w-full rounded-xl border border-gray-200 bg-gray-100/70 px-4 py-2.5 text-sm text-gray-500 font-medium cursor-not-allowed"
        />
      </div>
    </div>
  );
}

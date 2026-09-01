"use client";

import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
} from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";

interface Props {
  register: UseFormRegister<ProductFormInputType>;
  watch: UseFormWatch<ProductFormInputType>;
  setValue: UseFormSetValue<ProductFormInputType>;
}

export default function UnitConversionSection({
  register,
  watch,
  setValue,
}: Props) {
  const purchaseUnit = watch("purchaseUnit");
  const sellingUnit = watch("sellingUnit");

  const rawConversionFactor = watch("conversionFactor");
  const rawPurchasePrice = watch("variants.0.purchasePrice");

  const conversionFactor = Number(rawConversionFactor) || 1;
  const purchasePrice = Number(rawPurchasePrice) || 0;

  const unitCost =
    conversionFactor > 0
      ? (purchasePrice / conversionFactor).toFixed(2)
      : "0.00";

  const isDifferentUnits = purchaseUnit !== sellingUnit;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
        وحدات القياس والتحويل
      </h3>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            وحدة الشراء (التوريد)
          </label>
          <select
            {...register("purchaseUnit")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-semibold focus:border-(--primary-red) focus:bg-white outline-hidden"
          >
            <option value="طاقة">طاقة</option>
            <option value="قطعة">قطعة</option>
            <option value="ثوب">ثوب</option>
            <option value="متر">متر</option>
            <option value="كرتونة">كرتونة</option>
            <option value="درزن">درزن</option>
            <option value="كيلو">كيلو</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            وحدة البيع (التجزئة)
          </label>
          <select
            {...register("sellingUnit")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-semibold focus:border-(--primary-red) focus:bg-white outline-hidden"
          >
            <option value="قطعة">قطعة</option>
            <option value="متر">متر</option>
            <option value="طاقة">طاقة</option>
            <option value="ثوب">ثوب</option>
            <option value="درزن">درزن</option>
            <option value="كرتونة">كرتونة</option>
            <option value="كيلو">كيلو</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            محتوى الـ ({purchaseUnit}) بـ ({sellingUnit})
          </label>
          <input
            type="number"
            step="any"
            disabled={!isDifferentUnits}
            {...register("conversionFactor", { valueAsNumber: true })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-bold disabled:opacity-50 focus:border-(--primary-red) focus:bg-white outline-hidden"
          />
        </div>
      </div>

      {isDifferentUnits && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs text-slate-700 font-medium">
          <div>
            1 {purchaseUnit} ={" "}
            <span className="font-bold text-black">{conversionFactor}</span>{" "}
            {sellingUnit}
          </div>
          <div className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
            تكلفة الـ {sellingUnit} الواحدة = {unitCost}
          </div>
        </div>
      )}
    </div>
  );
}

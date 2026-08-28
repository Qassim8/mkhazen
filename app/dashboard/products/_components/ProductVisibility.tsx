"use client";

import { UseFormRegister } from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";
import { LuEye } from "react-icons/lu";

interface ProductVisibilityProps {
  register: UseFormRegister<ProductFormInputType>;
}

export default function ProductVisibility({
  register,
}: ProductVisibilityProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="border-b border-gray-50 pb-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <LuEye className="h-4 w-4 text-(--primary-red)" />
          ظهور المنتج
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          تحديد إمكانية عرض هذا المنتج للعملاء بالمتجر.
        </p>
      </div>

      <label
        htmlFor="visibility"
        className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100/70 transition cursor-pointer group"
      >
        <span className="text-xs font-bold text-gray-800 group-hover:text-gray-900">
          إظهار في المتجر
        </span>

        <div className="relative inline-flex items-center">
          <input
            type="checkbox"
            id="visibility"
            className="sr-only peer"
            {...register("isActive")}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
        </div>
      </label>
    </div>
  );
}

"use client";

import Image from "next/image";
import { LuPlus } from "react-icons/lu";

export default function Card({
  product,
  onAdd,
}: {
  product: any;
  onAdd: (p: any) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-md transition-shadow duration-200 group">
      <div>
        {/* الحاوية المجهزة بخلفية عنابية خفيفة تناسب الأقمشة الرجالية */}
        <div className="relative w-full h-32 sm:h-40 rounded-xl bg-(--primary-red)/5 overflow-hidden border border-gray-50">
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {product.sku && (
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              {product.sku}
            </span>
          )}
        </div>
        <h3 className="text-xs sm:text-sm font-bold text-gray-900 mt-2.5 leading-tight line-clamp-2 min-h-[36px]">
          {product.name}
        </h3>
      </div>

      <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
        <div>
          <span className="text-[10px] text-gray-400 block font-medium">
            سعر الوحدة
          </span>
          <span className="font-black text-sm text-emerald-600">
            ${product.price}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(product)}
          className="h-8 w-8 text-white bg-(--primary-red) rounded-xl flex justify-center items-center cursor-pointer transition transform active:scale-90 hover:opacity-90 shadow-sm"
        >
          <LuPlus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

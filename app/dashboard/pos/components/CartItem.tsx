"use client";

import Image from "next/image";
import { LuPlus, LuMinus } from "react-icons/lu";

interface CartItemProps {
  item: any;
  onUpdateQty: (id: string, amount: number) => void;
}

export default function CartItem({ item, onUpdateQty }: CartItemProps) {
  const itemTotal = item.price * (item.qty || 1);

  return (
    <div className="flex items-center gap-3 w-full p-2.5 bg-white rounded-xl border border-gray-200">
      {/* صورة معاينة صغيرة */}
      <div className="relative h-12 w-16 rounded-lg overflow-hidden bg-gray-50 border shrink-0">
        <Image alt={item.name} src={item.image} fill className="object-cover" />
      </div>

      {/* التفاصيل والتحكم بالكمية */}
      <div className="flex-1 min-w-0 space-y-1">
        <h4 className="text-xs font-bold text-gray-900 truncate pl-2">
          {item.name}
        </h4>

        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-xs text-emerald-600">
            ${itemTotal.toFixed(2)}
          </span>

          {/* أزرار مريحة وسهلة اللمس للزيادة والنقصان */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-0.5 border">
            <button
              type="button"
              onClick={() => onUpdateQty(item.id, -1)}
              className="flex justify-center items-center w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
            >
              <LuMinus className="h-2.5 w-2.5" />
            </button>
            <span className="text-xs font-bold w-5 text-center text-gray-800">
              {item.qty || 1}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQty(item.id, 1)}
              className="flex justify-center items-center w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
            >
              <LuPlus className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

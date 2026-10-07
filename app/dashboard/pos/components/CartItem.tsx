"use client";

import Image from "next/image";

import { LuMinus, LuPlus, LuTrash2 } from "react-icons/lu";

import type { POSCartItem } from "./POSClient";

interface CartItemProps {
  item: POSCartItem;

  onUpdateQty: (variantId: string, amount: number) => void;

  onRemove: (variantId: string) => void;
}

function getProductImage(item: POSCartItem): string {
  return (
    item.variant.images?.[0] ??
    item.product.images?.[0] ??
    "/images/placeholder.png"
  );
}

export default function CartItem({
  item,
  onUpdateQty,
  onRemove,
}: CartItemProps) {
  const productName = item.product.name;

  const variant = item.variant;

  const itemTotal = Number(
    (Number(variant.sellingPrice) * item.qty).toFixed(2),
  );

  return (
    <div className="flex items-center gap-3 w-full p-2.5 bg-white rounded-xl border border-gray-200">
      {/* Image */}

      <div className="relative h-12 w-16 rounded-lg overflow-hidden bg-gray-50 border shrink-0">
        <Image
          alt={productName}
          src={getProductImage(item)}
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      {/* Details */}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-xs font-bold text-gray-900 truncate">
            {productName}
          </h4>

          <button
            type="button"
            disabled={false}
            onClick={() => onRemove(variant.id)}
            className="text-gray-400 hover:text-red-500 transition shrink-0"
            aria-label="حذف المنتج"
          >
            <LuTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Variant info */}

        <div className="flex items-center gap-2 text-[9px] text-gray-400 truncate">
          {variant.sku && <span>{variant.sku}</span>}

          {variant.colorName && <span>{variant.colorName}</span>}

          {variant.size && <span>مقاس {variant.size}</span>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-xs text-emerald-600">
            {itemTotal.toFixed(2)}
          </span>

          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-0.5 border">
            <button
              type="button"
              onClick={() => onUpdateQty(variant.id, -1)}
              className="flex justify-center items-center w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm"
              aria-label="إنقاص الكمية"
            >
              <LuMinus className="h-2.5 w-2.5" />
            </button>

            <span className="text-xs font-bold w-5 text-center text-gray-800">
              {item.qty}
            </span>

            <button
              type="button"
              disabled={item.qty >= variant.stockQuantity}
              onClick={() => onUpdateQty(variant.id, 1)}
              className="flex justify-center items-center w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="زيادة الكمية"
            >
              <LuPlus className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        <div className="text-[9px] text-gray-400">
          المتاح: {variant.stockQuantity}
        </div>
      </div>
    </div>
  );
}

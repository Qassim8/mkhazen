"use client";

import { type KeyboardEvent, useState } from "react";
import Image from "next/image";
import { LuGift, LuMinus, LuPlus, LuTrash2 } from "react-icons/lu";
import toast from "react-hot-toast";
import type { POSCartItem } from "./POSClient";

interface CartItemProps {
  item: POSCartItem;
  maxQuantity: number;
  onUpdateQty: (variantId: string, isGift: boolean, amount: number) => void;
  onSetQty: (variantId: string, isGift: boolean, quantity: number) => void;
  onRemove: (variantId: string, isGift: boolean) => void;
}

function getProductImage(item: POSCartItem): string {
  return (
    item.variant.images?.[0] ??
    item.product.images?.[0] ??
    "/images/placeholder.png"
  );
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toFixed(2)).toString();
}

function isMeterBasedProduct(item: POSCartItem): boolean {
  const unit = item.product.sellingUnit?.trim().toLowerCase();
  return ["متر", "م", "meter", "meters", "m"].includes(unit ?? "");
}

function ManualQuantityInput({
  item,
  maxQuantity,
  onSetQty,
}: {
  item: POSCartItem;
  maxQuantity: number;
  onSetQty: CartItemProps["onSetQty"];
}) {
  const [manualQty, setManualQty] = useState(formatQuantity(item.qty));

  function commitManualQuantity() {
    const normalizedRaw = manualQty.trim().replace(",", ".");
    const value = Number(normalizedRaw);

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("الكمية يجب أن تكون أكبر من صفر");
      setManualQty(formatQuantity(item.qty));
      return;
    }

    const rounded = Number(value.toFixed(2));
    if (Math.abs(value - rounded) > 0.000001) {
      toast.error("الكمية يجب ألا تتجاوز منزلتين عشريتين");
      setManualQty(formatQuantity(item.qty));
      return;
    }

    if (rounded > maxQuantity + 0.000001) {
      toast.error(`المخزون المتاح فقط ${formatQuantity(maxQuantity)}`);
      setManualQty(formatQuantity(item.qty));
      return;
    }

    onSetQty(item.variant.id, item.isGift, rounded);
  }

  function handleQuantityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <input
      type="number"
      min="0.01"
      max={maxQuantity}
      step="0.01"
      inputMode="decimal"
      value={manualQty}
      onChange={(event) => setManualQty(event.target.value)}
      onBlur={commitManualQuantity}
      onKeyDown={handleQuantityKeyDown}
      className="h-6 w-16 bg-white px-1 text-center text-[11px] font-bold text-gray-800 outline-none"
      aria-label={`كمية ${item.product.name}`}
    />
  );
}

export default function CartItem({
  item,
  onUpdateQty,
  onSetQty,
  onRemove,
  maxQuantity,
}: CartItemProps) {
  const productName = item.product.name;
  const variant = item.variant;
  const isMeterProduct = isMeterBasedProduct(item);

  const itemTotal = item.isGift
    ? 0
    : Number((Number(variant.sellingPrice) * item.qty).toFixed(2));

  return (
    <div
      className={`w-full rounded-xl border p-2.5 ${
        item.isGift
          ? "border-amber-200 bg-amber-50/40"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border bg-gray-50">
          <Image
            alt={productName}
            src={getProductImage(item)}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {item.isGift && <LuGift className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                <h4 className="truncate text-xs font-bold text-gray-900">
                  {productName}
                </h4>
                {item.isGift && (
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700">
                    هدية
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRemove(variant.id, item.isGift)}
              className="shrink-0 text-gray-400 transition hover:text-red-500"
              aria-label="حذف المنتج"
            >
              <LuTrash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 truncate text-[9px] text-gray-400">
            {variant.sku && <span>{variant.sku}</span>}
            {variant.colorName && <span>{variant.colorName}</span>}
            {variant.size && <span>مقاس {variant.size}</span>}
            {variant.length != null && <span>طول {variant.length}</span>}
            {variant.width != null && <span>عرض {variant.width}</span>}
          </div>

          {item.isGift && item.giftNote && (
            <div className="rounded-lg bg-white/80 px-2 py-1 text-[9px] text-amber-800">
              <span className="font-bold">الملاحظة:</span> {item.giftNote}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span
              className={`text-xs font-extrabold ${
                item.isGift ? "text-amber-700" : "text-emerald-600"
              }`}
            >
              {itemTotal.toFixed(2)}
            </span>

            {isMeterProduct ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateQty(
                      variant.id,
                      item.isGift,
                      isMeterProduct ? -0.01 : -1,
                    )
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100"
                  aria-label="إنقاص الكمية"
                >
                  <LuMinus className="h-2.5 w-2.5" />
                </button>

                <div className="flex items-center overflow-hidden rounded-md border border-gray-200 bg-white">
                  <ManualQuantityInput
                    key={item.qty}
                    item={item}
                    maxQuantity={maxQuantity}
                    onSetQty={onSetQty}
                  />
                  <span className="border-r border-gray-100 px-1.5 text-[9px] font-bold text-gray-400">
                    متر
                  </span>
                </div>

                <button
                  type="button"
                  disabled={item.qty >= maxQuantity}
                  onClick={() => onUpdateQty(variant.id, item.isGift, 0.01)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="زيادة الكمية"
                >
                  <LuPlus className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateQty(variant.id, item.isGift, -1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100"
                  aria-label="إنقاص الكمية"
                >
                  <LuMinus className="h-2.5 w-2.5" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-gray-800">
                  {formatQuantity(item.qty)}
                </span>
                <button
                  type="button"
                  disabled={item.qty >= maxQuantity}
                  onClick={() => onUpdateQty(variant.id, item.isGift, 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="زيادة الكمية"
                >
                  <LuPlus className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-[9px] text-gray-400">
            <span>المتاح: {formatQuantity(maxQuantity)}</span>
            {item.isGift ? (
              <span className="font-bold text-amber-700">هدية - السعر 0.00</span>
            ) : (
              isMeterProduct && (
                <span className="font-semibold text-gray-500">يمكن إدخال الكسور</span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

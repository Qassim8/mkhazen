"use client";

import { type KeyboardEvent, useState } from "react";
import Image from "next/image";
import { LuGift, LuMinus, LuPlus, LuTrash2 } from "react-icons/lu";
import toast from "react-hot-toast";
import type { POSCartItem } from "./POSClient";
import { formatSDG, roundMoney, usdToSdg } from "@/lib/currency";

interface CartItemProps {
  item: POSCartItem;
  maxQuantity: number;
  /** سعر الصرف الحالي — سعر المنتج مخزّن بالدولار ويُعرض للزبون بالجنيه */
  exchangeRate: number | null;
  onUpdateQty: (variantId: string, isGift: boolean, amount: number) => void;
  onSetQty: (variantId: string, isGift: boolean, quantity: number) => void;
  onSetPrice: (
    variantId: string,
    isGift: boolean,
    price: number | null,
  ) => void;
  onRemove: (variantId: string, isGift: boolean) => void;
  /** إظهار تكلفة الوحدة بالجنيه عند تفعيلها من شاشة الكاشير */
  showCost?: boolean;
}

/** حقل سعر الوحدة بالجنيه (قابل للتعديل بطلب العميل) */
function UnitPriceInput({
  item,
  listPrice,
  onSetPrice,
}: {
  item: POSCartItem;
  listPrice: number;
  onSetPrice: CartItemProps["onSetPrice"];
}) {
  const current = item.priceSdg ?? listPrice;
  const [value, setValue] = useState(String(current));

  function commit() {
    const parsed = Number(value.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("سعر الوحدة يجب أن يكون أكبر من صفر");
      setValue(String(current));
      return;
    }
    const rounded = Number(parsed.toFixed(2));
    onSetPrice(
      item.variant.id,
      item.isGift,
      Math.abs(rounded - listPrice) < 0.005 ? null : rounded,
    );
  }

  return (
    <input
      type="number"
      min="0.01"
      step="0.01"
      inputMode="decimal"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="h-11 w-24 rounded-md border border-gray-200 bg-white px-2 text-center text-base font-bold text-gray-800 outline-none focus:border-(--primary-red) lg:h-8 lg:text-xs"
      aria-label={`سعر وحدة ${item.product.name} بالجنيه`}
    />
  );
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
      className="h-11 w-16 bg-white px-1 text-center text-base font-bold text-gray-800 outline-none lg:h-7 lg:text-[11px]"
      aria-label={`كمية ${item.product.name}`}
    />
  );
}

export default function CartItem({
  item,
  onUpdateQty,
  onSetQty,
  onSetPrice,
  onRemove,
  maxQuantity,
  exchangeRate,
  showCost = false,
}: CartItemProps) {
  const productName = item.product.name;
  const variant = item.variant;
  const isMeterProduct = isMeterBasedProduct(item);

  // نفس معادلة السيرفر: سعر الوحدة بالجنيه (مقرّب) × الكمية
  const listUnitSdg = usdToSdg(variant.sellingPrice, exchangeRate);
  const unitPriceSdg = item.priceSdg ?? listUnitSdg;
  const overridden =
    !item.isGift &&
    item.priceSdg != null &&
    Math.abs(item.priceSdg - listUnitSdg) >= 0.005;
  const itemTotal = item.isGift ? 0 : roundMoney(unitPriceSdg * item.qty);

  return (
    <div
      className={`w-full rounded-xl border p-2.5 ${
        item.isGift
          ? "border-amber-200 bg-amber-50/40"
          : overridden
            ? "border-sky-300 bg-sky-50/50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {variant.images.length > 0 ? (
          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border bg-gray-50">
            <Image
              alt={productName}
              src={getProductImage(item)}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
            <Image
              alt={productName}
              src={"/images/placeholder.png"}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {item.isGift && (
                  <LuGift className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                )}
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
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 transition hover:text-red-500 lg:m-0 lg:h-auto lg:w-auto"
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

          {showCost && Number(variant.averageCost ?? 0) > 0 && exchangeRate && (
            <div className="text-[10px] font-bold text-amber-600">
              تكلفة الوحدة:{" "}
              {formatSDG(
                usdToSdg(Number(variant.averageCost), exchangeRate),
              )}
            </div>
          )}

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
              {item.isGift ? "هدية" : formatSDG(itemTotal)}
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
                  className="flex h-11 w-11 items-center justify-center rounded-md lg:h-7 lg:w-7 border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100"
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
                  className="flex h-11 w-11 items-center justify-center rounded-md lg:h-7 lg:w-7 border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
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
                  className="flex h-11 w-11 items-center justify-center rounded-md lg:h-7 lg:w-7 border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100"
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
                  className="flex h-11 w-11 items-center justify-center rounded-md lg:h-7 lg:w-7 border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="زيادة الكمية"
                >
                  <LuPlus className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>

          {!item.isGift && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
              <span className="font-bold text-gray-500">سعر الوحدة</span>
              <UnitPriceInput
                key={`${item.priceSdg ?? "list"}-${listUnitSdg}`}
                item={item}
                listPrice={listUnitSdg}
                onSetPrice={onSetPrice}
              />
              {overridden && (
                <>
                  {unitPriceSdg < listUnitSdg ? (
                    <span className="text-gray-400 line-through">
                      {formatSDG(listUnitSdg)}
                    </span>
                  ) : (
                    <span
                      className="font-black text-sky-700"
                      title={`السعر الأصلي ${formatSDG(listUnitSdg)}`}
                    >
                      ↑ {formatSDG(listUnitSdg)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSetPrice(variant.id, item.isGift, null)}
                    className="min-h-11 rounded-md border border-sky-200 lg:min-h-8 bg-white px-2 font-bold text-sky-700 hover:bg-sky-50"
                  >
                    السعر الأصلي
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[9px] text-gray-400">
            <span>المتاح: {formatQuantity(maxQuantity)}</span>
            {item.isGift ? (
              <span className="font-bold text-amber-700">
                هدية - السعر 0.00
              </span>
            ) : (
              isMeterProduct && (
                <span className="font-semibold text-gray-500">
                  يمكن إدخال الكسور
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

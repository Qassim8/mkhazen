"use client";

import React, { useState } from "react";
import {
  LuBanknote,
  LuCreditCard,
  LuGift,
  LuShoppingCart,
  LuTrash2,
  LuWalletCards,
  LuX,
} from "react-icons/lu";
import CartItem from "./CartItem";
import GiftPicker from "./GiftPicker";
import type { POSCartItem } from "./POSClient";
import type { PaymentMethod, PaymentSplit } from "../schemas/pos.schemas";
import type {
  Product,
  ProductVariant,
} from "../../products/schemas/product.schemas";

interface CartListProps {
  cart: POSCartItem[];
  giftProducts: Product[];
  paymentMethod: PaymentMethod;
  paymentSplits: PaymentSplit[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalItems: number;
  maxDiscount: number;
  isDiscountOverLimit: boolean;
  mixedPaymentValid: boolean;
  mixedPaymentAmount: number;
  isCheckingOut: boolean;
  discountInput: string;
  discountError: string;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentSplitsChange: (splits: PaymentSplit[]) => void;
  onUpdateQty: (variantId: string, isGift: boolean, amount: number) => void;
  onSetQty: (variantId: string, isGift: boolean, quantity: number) => void;
  onRemove: (variantId: string, isGift: boolean) => void;
  onClear: () => void;
  onCheckout: () => void;
  onClose?: () => void;
  onDiscountInputChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  onAddGift: (
    product: Product,
    variant: ProductVariant,
    quantity: number,
    giftNote: string | null,
  ) => boolean;
}

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "CASH",
    label: "نقدي",
    icon: <LuWalletCards className="h-3.5 w-3.5" />,
  },
  {
    value: "CARD",
    label: "بطاقة",
    icon: <LuCreditCard className="h-3.5 w-3.5" />,
  },
  {
    value: "BANK_TRANSFER",
    label: "تحويل",
    icon: <LuBanknote className="h-3.5 w-3.5" />,
  },
  {
    value: "MIXED",
    label: "مختلط",
    icon: <LuWalletCards className="h-3.5 w-3.5" />,
  },
];

const SPLIT_METHODS: {
  value: "CASH" | "CARD" | "BANK_TRANSFER";
  label: string;
}[] = [
  { value: "CASH", label: "نقدي" },
  { value: "CARD", label: "بطاقة" },
  { value: "BANK_TRANSFER", label: "تحويل" },
];

function getOtherMethod(
  current: "CASH" | "CARD" | "BANK_TRANSFER",
): "CASH" | "CARD" | "BANK_TRANSFER" {
  return current === "CASH" ? "CARD" : "CASH";
}

export default function CartList({
  cart,
  giftProducts,
  paymentMethod,
  paymentSplits,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  totalItems,
  maxDiscount,
  isDiscountOverLimit,
  mixedPaymentValid,
  mixedPaymentAmount,
  isCheckingOut,
  discountInput,
  discountError,
  onPaymentMethodChange,
  onPaymentSplitsChange,
  onUpdateQty,
  onSetQty,
  onRemove,
  onClear,
  onCheckout,
  onClose,
  onDiscountInputChange,
  onAddGift,
}: CartListProps) {
  const [isGiftPickerOpen, setIsGiftPickerOpen] = useState(false);

  const updateSplit = (index: number, patch: Partial<PaymentSplit>) => {
    const next = paymentSplits.map((split, splitIndex) =>
      splitIndex === index ? { ...split, ...patch } : split,
    );
    onPaymentSplitsChange(next);
  };

  const firstSplitMethod = paymentSplits[0]?.method ?? "CASH";
  const secondSplitMethod =
    paymentSplits[1]?.method ?? getOtherMethod(firstSplitMethod);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-5">
        <div className="shrink-0 space-y-3 border-b border-gray-100 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LuShoppingCart className="h-4 w-4 text-(--primary-red)" />
              <h1 className="text-base font-black text-gray-900">الطلب الحالي</h1>
              <span className="rounded-lg border bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-500">
                {totalItems}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-500">
                فاتورة جديدة
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition hover:bg-gray-50 lg:hidden"
                  aria-label="إغلاق السلة"
                >
                  <LuX className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--primary-red)/10 text-(--primary-red)">
              <LuWalletCards className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xs font-bold text-gray-900">نقطة البيع</h2>
              <span className="text-[10px] font-medium text-gray-400">
                عملية بيع مباشرة
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isCheckingOut}
            onClick={() => setIsGiftPickerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LuGift className="h-4 w-4" />
            إضافة هدية
          </button>
        </div>

        <div className="my-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto py-3 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed bg-gray-50 py-12 text-center text-gray-400">
              <LuShoppingCart className="mb-3 h-8 w-8 opacity-40" />
              <p className="text-xs font-bold">السلة فارغة حاليًا</p>
              <p className="mt-1 text-[10px]">
                امسح الباركود أو اضغط على المنتج لإضافته
              </p>
            </div>
          ) : (
            cart.map((item) => {
              const reservedByOtherLines = cart.reduce(
                (sum, other) =>
                  other.variant.id === item.variant.id && other !== item
                    ? sum + other.qty
                    : sum,
                0,
              );
              const maxQuantity = Math.max(
                0,
                Number(item.variant.stockQuantity) - reservedByOtherLines,
              );

              return (
                <CartItem
                  key={`${item.variant.id}-${item.isGift ? "gift" : "sale"}`}
                  item={item}
                  maxQuantity={maxQuantity}
                  onUpdateQty={onUpdateQty}
                  onSetQty={onSetQty}
                  onRemove={onRemove}
                />
              );
            })
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-gray-100 pt-3">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">طريقة الدفع</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isCheckingOut}
                  onClick={() => onPaymentMethodChange(option.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-bold transition ${
                    paymentMethod === option.value
                      ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "MIXED" && (
            <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-[10px] font-bold text-gray-700">تقسيم المبلغ</div>
              {[0, 1].map((index) => {
                const split = paymentSplits[index];
                if (!split) return null;

                const usedByOther =
                  index === 0 ? secondSplitMethod : firstSplitMethod;
                const options = SPLIT_METHODS.filter(
                  (method) =>
                    method.value === split.method ||
                    method.value !== usedByOther,
                );

                return (
                  <div key={index} className="grid grid-cols-[1fr_1fr] gap-2">
                    <select
                      value={split.method}
                      disabled={isCheckingOut}
                      onChange={(event) =>
                        updateSplit(index, {
                          method: event.target.value as PaymentSplit["method"],
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-gray-800 outline-none focus:border-(--primary-red)"
                    >
                      {options.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={split.amount}
                      disabled={isCheckingOut}
                      onChange={(event) =>
                        updateSplit(index, {
                          amount: Number(event.target.value) || 0,
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-bold text-gray-900 outline-none focus:border-(--primary-red)"
                    />
                  </div>
                );
              })}

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">مجموع الدفعات</span>
                <span
                  className={
                    mixedPaymentValid
                      ? "font-bold text-emerald-600"
                      : "font-bold text-red-500"
                  }
                >
                  {mixedPaymentAmount.toFixed(2)} ر.س
                </span>
              </div>

              {!mixedPaymentValid && (
                <p className="text-[10px] font-medium text-red-500">
                  يجب أن تكون الطريقتان مختلفتين وأن يساوي مجموعهما الإجمالي.
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="discount" className="text-xs font-bold text-gray-700">
                الخصم
              </label>
              <span className="text-[10px] text-gray-400">
                حتى 50% = {maxDiscount.toFixed(2)} ر.س
              </span>
            </div>
            <div className="relative">
              <input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                disabled={cart.length === 0 || isCheckingOut}
                value={discountInput}
                onChange={onDiscountInputChange}
                placeholder="0.00"
                className={`w-full rounded-xl border px-3 py-2 text-xs font-bold text-gray-900 outline-none transition ${
                  isDiscountOverLimit
                    ? "border-red-400 bg-red-50"
                    : "border-gray-200 bg-gray-50/50 focus:border-(--primary-red) focus:bg-white"
                } disabled:opacity-50`}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                ر.س
              </span>
            </div>
            {(discountError || isDiscountOverLimit) && (
              <p className="mt-1 text-[10px] font-medium text-red-500">
                {discountError ||
                  `الخصم الحالي يتجاوز الحد المسموح ${maxDiscount.toFixed(2)} ر.س.`}
              </p>
            )}
          </div>

          <div className="space-y-2.5 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
              <span>إجمالي العناصر</span>
              <span>{totalItems}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
              <span>المجموع الفرعي</span>
              <span>{subtotal.toFixed(2)} ر.س</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-600">
                <span>
                  الخصم (
                  {subtotal > 0
                    ? ((discountAmount / subtotal) * 100).toFixed(2)
                    : "0.00"}
                  %)
                </span>
                <span>- {discountAmount.toFixed(2)} ر.س</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                <span>الضريبة</span>
                <span>{taxAmount.toFixed(2)} ر.س</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-200 pt-2.5 text-sm font-black text-gray-900">
              <span>المبلغ الكلي</span>
              <span
                className={`text-base ${
                  totalAmount > 0 ? "text-(--primary-red)" : "text-red-600"
                }`}
              >
                {totalAmount.toFixed(2)} ر.س
              </span>
            </div>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              disabled={isCheckingOut}
              onClick={onClear}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <LuTrash2 className="h-3.5 w-3.5" />
              تفريغ السلة
            </button>
          )}

          <button
            type="button"
            disabled={
              cart.length === 0 ||
              isCheckingOut ||
              isDiscountOverLimit ||
              totalAmount <= 0 ||
              !mixedPaymentValid
            }
            onClick={onCheckout}
            className="w-full rounded-2xl bg-(--primary-red) py-3.5 text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCheckingOut
              ? "جاري إتمام المبيعة..."
              : isDiscountOverLimit
                ? "الخصم يتجاوز 50%"
                : paymentMethod === "MIXED" && !mixedPaymentValid
                  ? "أكمل تقسيم الدفعة"
                  : "تأكيد المبيعة وإصدار الفاتورة"}
          </button>
        </div>
      </div>

      {isGiftPickerOpen && (
        <GiftPicker
          initialProducts={giftProducts}
          onClose={() => setIsGiftPickerOpen(false)}
          onAddGift={onAddGift}
        />
      )}
    </>
  );
}

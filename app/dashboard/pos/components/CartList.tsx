"use client";

import React from "react";
import CartItem from "./CartItem";
import { LuStore, LuX } from "react-icons/lu";

interface CartListProps {
  cart: any[];
  setCart: React.Dispatch<React.SetStateAction<any[]>>;
  onClose?: () => void;
}

export default function CartList({ cart, setCart, onClose }: CartListProps) {
  // تجميع وتحديث الكميات
  const updateQty = (id: string, amount: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, qty: (item.qty || 1) + amount } : item,
        )
        .filter((item) => item.qty > 0),
    );
  };

  const subtotal = cart.reduce((sum, p) => sum + p.price * (p.qty || 1), 0);
  const tax = subtotal * 0.14; // الضريبة القياسية 14%
  const total = subtotal + tax;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between overflow-hidden">
      {/* ترويسة السلة والمسؤول الحالي */}
      <div className="space-y-3 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-black text-gray-900">
            الطلب الحالي ({cart.length})
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-50 border px-2 py-0.5 rounded-lg text-gray-500 font-semibold">
              فاتورة جديدة
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden rounded-lg border border-gray-200 p-1.5 text-gray-500 transition hover:bg-gray-50"
                aria-label="إغلاق السلة"
              >
                <LuX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-gray-50 p-2 rounded-xl border border-gray-100">
          <div className="h-8 w-8 rounded-lg bg-(--primary-red)/10 text-(--primary-red) flex items-center justify-center font-bold text-sm">
            <LuStore className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-bold text-gray-900">محمد العوض</h2>
            <span className="text-[10px] text-gray-400 font-medium">
              المدير العام / كاشير الرئيسي
            </span>
          </div>
        </div>
      </div>

      {/* منطقة المنتجات المضافة (متحركة مستقلة بارتفاع مرن) */}
      <div
        className="flex-1 overflow-y-auto py-3 space-y-2.5 my-2 pr-1
        [&::-webkit-scrollbar]:w-1
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-gray-200"
      >
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12 border border-dashed rounded-2xl bg-gray-50">
            <p className="text-xs font-bold">السلة فارغة حالياً</p>
            <p className="text-[10px] mt-0.5">
              امسح باركود أو اضغط على الجلابية لإضافتها
            </p>
          </div>
        ) : (
          cart.map((item) => (
            <CartItem key={item.id} item={item} onUpdateQty={updateQty} />
          ))
        )}
      </div>

      {/* الحسابات المالية والزر النهائي (ثابت في الأسفل) */}
      <div className="shrink-0 space-y-4 pt-3 border-t border-gray-100">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
            <span>إجمالي قطع البضاعة</span>
            <span>
              {cart.reduce((sum, item) => sum + (item.qty || 1), 0)} قطعة
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
            <span>الإجمالي الأولي</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
            <span>الضريبة المضافة (14%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-2.5 text-sm font-black text-gray-900">
            <span>المبلغ الكلي المطلوب</span>
            <span className="text-(--primary-red) text-base">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={cart.length === 0}
          className="w-full rounded-2xl bg-(--primary-red) py-3.5 text-sm font-bold text-white shadow-md hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          تأكيد المبيعة وإصدار الفاتورة
        </button>
      </div>
    </div>
  );
}

import { products } from "@/data/data";
import React from "react";
import CartItem from "./CartItem";

const CartList = () => {
  const cartProducts = products.slice(0, 4);
  const subtotal = cartProducts.reduce(
    (sum, product) => sum + product.price * (product.qty || 1),
    0,
  );
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  return (
    <div className="frame w-full mb-10 flex flex-col gap-4 sticky md:top-20 md:h-[95vh]">
      <h1 className="text-lg font-semibold">الطلب الحالي</h1>

      <div className="flex items-center gap-2 cursor-pointer">
        <div className="h-8 w-8 rounded-full bg-gray-300"></div>
        <div className="flex flex-col">
          <h2 className="text-xs font-bold">محمد</h2>
          <span className="text-[10px] text-gray-500">ادمن</span>
        </div>
      </div>

      <div className="w-full space-y-3">
        {cartProducts.map(({ id, name, image, price, qty }) => (
          <CartItem
            key={id}
            name={name}
            image={image}
            price={price}
            qty={qty}
          />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            المعلومات المالية
          </h2>
        </div>

        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>الاجمالي الاولي</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>الضريبة</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <span>الاجمالي</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button className="w-full rounded-xl bg-(--primary-red) px-4 py-3 text-sm font-semibold text-white transition-colors duration-300 hover:bg-(--primary-red)">
        Continue
      </button>
    </div>
  );
};

export default CartList;

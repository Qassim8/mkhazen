"use client";

import { LuMinus, LuPlus, LuTrash2 } from "react-icons/lu";
import { PurchaseItem } from "./OrderModalContent";

interface Props {
  purchaseItems: PurchaseItem[];
  setPurchaseItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
  deliveryCost?: number;
  readOnly?: boolean;
}

export default function PurchaseCart({
  purchaseItems,
  setPurchaseItems,
  deliveryCost = 0,
  readOnly = false,
}: Props) {
  const updateQuantity = (id: string, delta: number) => {
    setPurchaseItems((prev) =>
      prev.map((item) => {
        if (item.productId === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }),
    );
  };

  const updateCost = (id: string, cost: number) => {
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.productId === id
          ? { ...item, costPrice: Math.max(0, cost) }
          : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    setPurchaseItems((prev) => prev.filter((item) => item.productId !== id));
  };

  const itemsTotal = purchaseItems.reduce(
    (sum, item) => sum + item.costPrice * item.quantity,
    0,
  );
  const grandTotal = itemsTotal + Number(deliveryCost || 0);

  return (
    <div className="flex h-full flex-col justify-between space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h4 className="font-semibold text-gray-800 text-base">
          سلة عناصر الطلب
        </h4>
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {purchaseItems.length} عنصر
        </span>
      </div>

      <div className="space-y-3 overflow-y-auto max-h-95 pr-1">
        {purchaseItems.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            لم يتم إضافة منتجات إلى الطلب بعد. قم باختيار منتج من القائمة
            الجانبية.
          </div>
        ) : (
          purchaseItems.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3 transition hover:border-gray-200"
            >
              <div className="flex-1 min-w-0">
                <h5 className="font-semibold text-gray-900 text-sm truncate">
                  {item.name}
                </h5>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-gray-400">سعر الوحدة:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.costPrice}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateCost(
                        item.productId,
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-20 rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-700 outline-none focus:border-red-500 disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => removeItem(item.productId)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                >
                  <LuTrash2 className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600 transition disabled:opacity-40"
                  >
                    <LuPlus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-3 text-center text-xs font-bold text-gray-800">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600 transition disabled:opacity-40"
                  >
                    <LuMinus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-100 pt-3 mt-auto space-y-1.5">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>قيمة المنتجات:</span>
          <span>{itemsTotal.toLocaleString()} ريال</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>تكلفة الشحن:</span>
          <span>{Number(deliveryCost || 0).toLocaleString()} ريال</span>
        </div>
        <div className="flex items-center justify-between font-bold text-gray-900 text-base">
          <span>التكلفة الإجمالية:</span>
          <span className="text-red-600">
            {grandTotal.toLocaleString()} ريال
          </span>
        </div>
      </div>
    </div>
  );
}

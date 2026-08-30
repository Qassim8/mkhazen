"use client";

import { LuTrash2, LuPlus, LuMinus } from "react-icons/lu";
import { PurchaseItem } from "./OrderModalContent";

interface PurchaseCartProps {
  purchaseItems: PurchaseItem[];
  setPurchaseItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
}

export default function PurchaseCart({
  purchaseItems = [],
  setPurchaseItems,
}: PurchaseCartProps) {
  const updateQuantity = (id: string, amount: number) => {
    setPurchaseItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + amount } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const updateCostPrice = (id: string, newPrice: number) => {
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, costPrice: newPrice } : item,
      ),
    );
  };

  const removeFromOrder = (id: string) => {
    setPurchaseItems((prev) => prev.filter((item) => item.id !== id));
  };

  const itemsTotal = purchaseItems.reduce(
    (sum, item) => sum + item.costPrice * item.quantity,
    0,
  );

  return (
    <div className="flex flex-col h-full justify-between space-y-6">
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-gray-900">
          عناصر الطلب ({purchaseItems.length})
        </h4>

        <div className="space-y-3 max-h-64 overflow-y-auto pl-1">
          {purchaseItems.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
              لم يتم إضافة أية منتجات بعد.
            </div>
          ) : (
            purchaseItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-gray-900 truncate flex-1 pl-2">
                    {item.name}
                  </h5>
                  <button
                    type="button"
                    onClick={() => removeFromOrder(item.id)}
                    className="text-gray-400 hover:text-red-500 transition"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">التكلفة:</span>
                    <input
                      type="number"
                      value={item.costPrice}
                      onChange={(e) =>
                        updateCostPrice(item.id, Number(e.target.value))
                      }
                      className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-center text-xs font-bold focus:outline-none focus:border-(--primary-red)"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                    >
                      <LuMinus className="h-3 w-3" />
                    </button>
                    <span className="text-xs font-bold w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                    >
                      <LuPlus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex justify-between text-base font-bold text-gray-900">
          <span>إجمالي الفاتورة</span>
          <span className="text-green-600">
            {itemsTotal.toLocaleString()} ريال
          </span>
        </div>
      </div>
    </div>
  );
}

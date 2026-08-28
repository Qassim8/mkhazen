"use client";

import { useState } from "react";
import { LuTrash2, LuPlus, LuMinus } from "react-icons/lu";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "../services/order.services";
import { useModalStore } from "@/store/useModalStore";
import { CartPurchaseItem } from "../../suppliers/_components/ModalContent";

interface PurchaseCartProps {
  supplierId: string;
  purchaseItems: CartPurchaseItem[];
  setPurchaseItems: React.Dispatch<React.SetStateAction<CartPurchaseItem[]>>;
  orderId?: string;
  isReadOnly?: boolean;
}

export default function PurchaseCart({
  supplierId,
  purchaseItems,
  setPurchaseItems,
  orderId,
  isReadOnly = false,
}: PurchaseCartProps) {
  const [loading, setLoading] = useState(false);
  const closeModal = useModalStore((state) => state.closeModal);

  const updateQuantity = (id: string, amount: number) => {
    if (isReadOnly) return;
    setPurchaseItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + amount } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const updateCostPrice = (id: string, newPrice: number) => {
    if (isReadOnly) return;
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, costPrice: newPrice } : item,
      ),
    );
  };

  const removeFromOrder = (id: string) => {
    if (isReadOnly) return;
    setPurchaseItems((prev) => prev.filter((item) => item.id !== id));
  };

  const itemsTotal = purchaseItems.reduce(
    (sum, item) => sum + item.costPrice * item.quantity,
    0,
  );

  const handleSubmit = async () => {
    if (!supplierId || purchaseItems.length === 0 || isReadOnly) return;

    try {
      setLoading(true);
      const payload = {
        supplierId,
        items: purchaseItems.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          unitCost: item.costPrice,
        })),
      };

      if (orderId) {
        await updatePurchaseOrder(orderId, payload);
      } else {
        await createPurchaseOrder(payload);
      }

      closeModal();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الطلب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between space-y-6">
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-gray-900">
          عناصر الطلب ({purchaseItems.length})
        </h4>

        <div className="space-y-3 max-h-60 overflow-y-auto pl-1">
          {purchaseItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
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
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeFromOrder(item.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">التكلفة:</span>
                    <input
                      type="number"
                      disabled={isReadOnly}
                      value={item.costPrice}
                      onChange={(e) =>
                        updateCostPrice(item.id, Number(e.target.value))
                      }
                      className="w-16 rounded-lg border border-gray-200 bg-white px-1.5 py-0.5 text-center text-xs font-bold disabled:bg-gray-100"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600"
                      >
                        <LuMinus className="h-2.5 w-2.5" />
                      </button>
                    )}
                    <span className="text-xs font-bold w-6 text-center">
                      {item.quantity}
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600"
                      >
                        <LuPlus className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-4">
        <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2">
          <span>إجمالي الفاتورة</span>
          <span className="text-green-600">${itemsTotal.toFixed(2)}</span>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={purchaseItems.length === 0 || !supplierId || loading}
            className="w-full rounded-xl bg-gray-950 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "جاري الحفظ..."
              : orderId
                ? "تعديل الطلب"
                : "اعتماد طلب الشراء"}
          </button>
        )}
      </div>
    </div>
  );
}

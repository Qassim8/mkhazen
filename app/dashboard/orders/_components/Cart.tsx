"use client";

import { LuTrash2 } from "react-icons/lu";

export interface PurchaseItem {
  id: string; // معرف الفريد للبند داخل السلة
  templateId: string; // معرف المنتج الرئيسي
  variantId: string; // معرف المتغير
  productName: string; // اسم المنتج العام
  sku?: string;
  variantAttributes: string; // الألوان / المقاسات للعرض
  costPrice: number;
  quantity: number;
}

interface CartProps {
  purchaseItems: PurchaseItem[];
  setPurchaseItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
  deliveryCost: number;
  discountAmount: number;
  readOnly?: boolean;
}

export default function PurchaseCart({
  purchaseItems,
  setPurchaseItems,
  deliveryCost,
  discountAmount,
  readOnly = false,
}: CartProps) {
  const updateQuantity = (variantId: string, delta: number) => {
    if (readOnly) return;
    setPurchaseItems((prev) =>
      prev
        .map((item) => {
          if (item.variantId === variantId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter(Boolean),
    );
  };

  const updateCostPrice = (variantId: string, newCost: number) => {
    if (readOnly) return;
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.variantId === variantId
          ? { ...item, costPrice: Math.max(0, newCost) }
          : item,
      ),
    );
  };

  const removeItem = (variantId: string) => {
    if (readOnly) return;
    setPurchaseItems((prev) =>
      prev.filter((item) => item.variantId !== variantId),
    );
  };

  const subtotal = purchaseItems.reduce(
    (acc, item) => acc + item.costPrice * item.quantity,
    0,
  );
  const totalAmount = Math.max(0, subtotal + deliveryCost - discountAmount);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800 text-sm">عناصر الشراء</h3>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-medium">المنتج / المتغير</th>
              <th className="px-4 py-3 font-medium">تلفة الوحدة</th>
              <th className="px-4 py-3 font-medium">الكمية</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
              {!readOnly && <th className="px-4 py-3 text-center">إجراء</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {purchaseItems.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 4 : 5}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  لم يتم إضافة أي منتجات إلى الطلب بعد.
                </td>
              </tr>
            ) : (
              purchaseItems.map((item) => {
                const itemTotal = item.costPrice * item.quantity;
                return (
                  <tr key={item.variantId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">
                        {item.productName}
                      </div>
                      <div className="text-xs text-gray-500 flex gap-2">
                        {item.variantAttributes && (
                          <span>{item.variantAttributes}</span>
                        )}
                        {item.sku && <span>(SKU: {item.sku})</span>}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {readOnly ? (
                        <span>{item.costPrice.toFixed(2)}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.costPrice}
                          onChange={(e) =>
                            updateCostPrice(
                              item.variantId,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-red-500 focus:outline-none"
                        />
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {readOnly ? (
                        <span>{item.quantity}</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.variantId, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.variantId, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-semibold text-gray-700">
                      {itemTotal.toFixed(2)}
                    </td>

                    {!readOnly && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="p-1 text-gray-400 hover:text-red-500 transition"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm font-medium">
        <div className="flex justify-between text-gray-600">
          <span>المجموع الفرعي:</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>تكلفة الشحن:</span>
          <span>{deliveryCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>الخصم:</span>
          <span className="text-red-600">-{discountAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
          <span>الإجمالي النهائي:</span>
          <span>{totalAmount.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

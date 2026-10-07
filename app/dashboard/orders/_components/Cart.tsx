"use client";

import { LuTrash2 } from "react-icons/lu";

import type { Dispatch } from "react";

export interface PurchaseItem {
  id: string;

  templateId: string;

  variantId: string;

  productName: string;

  sku?: string;

  barcode?: string;

  variantAttributes: string;

  unitCost: number;

  quantity: number;
}

interface CartProps {
  purchaseItems: PurchaseItem[];

  setPurchaseItems: Dispatch<React.SetStateAction<PurchaseItem[]>>;

  onItemsChange?: (items: PurchaseItem[]) => void;

  deliveryCost: number;

  discountAmount: number;

  readOnly?: boolean;
}

export default function PurchaseCart({
  purchaseItems,
  setPurchaseItems,
  onItemsChange,
  deliveryCost,
  discountAmount,
  readOnly = false,
}: CartProps) {
  /* =======================================================
     Update cart
  ======================================================= */

  const applyItems = (nextItems: PurchaseItem[]) => {
    setPurchaseItems(nextItems);

    onItemsChange?.(nextItems);
  };

  /* =======================================================
     Quantity
  ======================================================= */

  const updateQuantity = (variantId: string, delta: number) => {
    if (readOnly) {
      return;
    }

    const nextItems = purchaseItems
      .map((item) => {
        if (item.variantId === variantId) {
          const newQuantity = item.quantity + delta;

          return newQuantity > 0
            ? {
                ...item,
                quantity: newQuantity,
              }
            : null;
        }

        return item;
      })
      .filter((item): item is PurchaseItem => item !== null);

    applyItems(nextItems);
  };

  /* =======================================================
     Cost
  ======================================================= */

  const updateUnitCost = (variantId: string, newCost: number) => {
    if (readOnly) {
      return;
    }

    const safeCost = Number.isFinite(newCost) ? Math.max(0, newCost) : 0;

    const nextItems = purchaseItems.map((item) =>
      item.variantId === variantId
        ? {
            ...item,
            unitCost: safeCost,
          }
        : item,
    );

    applyItems(nextItems);
  };

  /* =======================================================
     Remove
  ======================================================= */

  const removeItem = (variantId: string) => {
    if (readOnly) {
      return;
    }

    const nextItems = purchaseItems.filter(
      (item) => item.variantId !== variantId,
    );

    applyItems(nextItems);
  };

  /* =======================================================
     Totals
  ======================================================= */

  const subtotal = purchaseItems.reduce(
    (sum, item) => sum + item.unitCost * item.quantity,
    0,
  );

  const totalAmount = Math.max(0, subtotal + deliveryCost - discountAmount);

  /*
   * Shipping is distributed equally between items.
   */
  const shippingPerItem =
    purchaseItems.length > 0 ? deliveryCost / purchaseItems.length : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">عناصر الشراء</h3>

          <span className="text-xs text-gray-400">
            {purchaseItems.length} بند
          </span>
        </div>

        {deliveryCost > 0 && purchaseItems.length > 0 && (
          <p className="mt-1 text-[10px] text-gray-400">
            سيتم توزيع تكلفة الشحن بالتساوي على بنود الطلب.
          </p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-175 text-right text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">المنتج / الـVariant</th>

              <th className="px-4 py-3 font-medium">تكلفة الوحدة</th>

              <th className="px-4 py-3 font-medium">الكمية</th>

              <th className="px-4 py-3 font-medium">الإجمالي</th>

              {!readOnly && (
                <th className="px-4 py-3 text-center font-medium">إجراء</th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white">
            {purchaseItems.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 4 : 5}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  لم تتم إضافة أي Variant إلى الطلب.
                </td>
              </tr>
            ) : (
              purchaseItems.map((item) => {
                const itemTotal = item.unitCost * item.quantity;

                /*
                 * Equal shipping allocation
                 * for this item.
                 */
                const allocatedShipping = shippingPerItem;

                const shippingPerUnit =
                  item.quantity > 0 ? allocatedShipping / item.quantity : 0;

                const effectiveUnitCost = item.unitCost + shippingPerUnit;

                return (
                  <tr key={item.variantId} className="hover:bg-gray-50/50">
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">
                        {item.productName}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
                        {item.variantAttributes && (
                          <span>{item.variantAttributes}</span>
                        )}

                        {item.sku && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                            SKU: {item.sku}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cost */}
                    <td className="px-4 py-3">
                      {readOnly ? (
                        <div>
                          <p className="font-semibold text-gray-800">
                            {item.unitCost.toFixed(2)} ر.س
                          </p>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(event) =>
                            updateUnitCost(
                              item.variantId,
                              Number(event.target.value || 0),
                            )
                          }
                          className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-red-500"
                        />
                      )}

                      {deliveryCost > 0 && (
                        <div className="mt-1 text-[9px] text-gray-400">
                          شحن/وحدة: {shippingPerUnit.toFixed(2)} <br />
                          تكلفة فعلية:{" "}
                          <span className="font-semibold text-gray-600">
                            {effectiveUnitCost.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-4 py-3">
                      {readOnly ? (
                        <span className="font-semibold text-gray-800">
                          {item.quantity}
                        </span>
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

                    {/* Total */}
                    <td className="px-4 py-3 font-semibold text-gray-700">
                      {itemTotal.toFixed(2)} ر.س
                    </td>

                    {/* Action */}
                    {!readOnly && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
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

      {/* Summary */}
      <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>المجموع الفرعي:</span>

          <span>{subtotal.toFixed(2)} ر.س</span>
        </div>

        <div className="flex justify-between text-gray-600">
          <span>تكلفة الشحن:</span>

          <span>{deliveryCost.toFixed(2)} ر.س</span>
        </div>

        <div className="flex justify-between text-gray-600">
          <span>الخصم:</span>

          <span className="text-red-600">-{discountAmount.toFixed(2)} ر.س</span>
        </div>

        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
          <span>الإجمالي النهائي:</span>

          <span>{totalAmount.toFixed(2)} ر.س</span>
        </div>
      </div>
    </div>
  );
}

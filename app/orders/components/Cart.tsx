import { useState } from "react";
import { LuTrash2, LuPlus, LuMinus } from "react-icons/lu";
import { PurchaseItem } from "./ModalContent";

interface PurchaseCartProps {
  supplierId: string;
  purchaseItems: PurchaseItem[];
  setPurchaseItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
}

export default function PurchaseCart({
  supplierId,
  purchaseItems,
  setPurchaseItems,
}: PurchaseCartProps) {
  const [shippingCost, setShippingCost] = useState<number>(0);

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
  const grandTotal = itemsTotal + shippingCost;

  const handleSubmit = () => {
    console.log({ supplierId, items: purchaseItems, grandTotal });
  };

  return (
    <div className="flex flex-col h-full justify-between space-y-6">
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-gray-900">
          Shipment Items ({purchaseItems.length})
        </h4>

        <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
          {purchaseItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
              No items added yet.
            </div>
          ) : (
            purchaseItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-gray-900 truncate flex-1 pr-2">
                    {item.name}
                  </h5>
                  <button
                    type="button"
                    onClick={() => removeFromOrder(item.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Cost:</span>
                    <input
                      type="number"
                      value={item.costPrice}
                      onChange={(e) =>
                        updateCostPrice(item.id, Number(e.target.value))
                      }
                      className="w-16 rounded-lg border border-gray-200 bg-white px-1.5 py-0.5 text-center text-xs font-bold"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600"
                    >
                      <LuMinus className="h-2.5 w-2.5" />
                    </button>
                    <span className="text-xs font-bold w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      className="p-1 rounded-lg bg-white border border-gray-200 text-gray-600"
                    >
                      <LuPlus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Items Subtotal</span>
            <span>${itemsTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Shipping Cost ($)</span>
            <input
              type="number"
              value={shippingCost || ""}
              onChange={(e) => setShippingCost(Number(e.target.value))}
              placeholder="0.00"
              className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-right text-xs focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2 mt-2">
            <span>Total Bill Cost</span>
            <span className="text-green-600">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={purchaseItems.length === 0}
          className="w-full rounded-xl bg-gray-950 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Approve Shipment
        </button>
      </div>
    </div>
  );
}

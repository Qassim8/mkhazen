"use client";
import { useState } from "react";
import PurchaseCart from "./Cart";

export const availableSuppliers = [
  { id: "s1", name: "Al-Noor Electronics Co.", contact: "Ahmed Ali" },
  { id: "s2", name: "Global Garments Factory", contact: "Sara Omar" },
];

export const availableProducts = [
  { id: "p1", name: "Wireless Headphones", costPrice: 80, currentStock: 15 },
  { id: "p2", name: "Oxford Cotton Shirt", costPrice: 25, currentStock: 32 },
  { id: "p3", name: "Cold Brew Coffee Maker", costPrice: 50, currentStock: 8 },
];

export interface PurchaseItem {
  id: string;
  name: string;
  costPrice: number;
  quantity: number;
}

export default function ModalContent() {
  const [supplierId, setSupplierId] = useState<string>("");
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);

  const addToOrder = (productId: string) => {
    if (!productId) return;
    const product = availableProducts.find((p) => p.id === productId);
    if (!product) return;

    setPurchaseItems((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (existing) {
        return prev.map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          costPrice: product.costPrice,
          quantity: 1,
        },
      ];
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12 min-h-125">
      {/* الطرف الأيمن: البيانات والبحث */}
      <div className="lg:col-span-7 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-950">
            New Purchase Order
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Record incoming stock from suppliers.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Select Supplier
          </label>
          <select
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-none transition cursor-pointer"
          >
            <option value="">Choose a supplier...</option>
            {availableSuppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Add Products
          </label>
          <select
            disabled={!supplierId}
            onChange={(e) => {
              addToOrder(e.target.value);
              e.target.value = "";
            }}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <option value="">
              {supplierId
                ? "Click to add product..."
                : "⚠️ Select a supplier first"}
            </option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* الطرف الأيسر: السلة (ممرر لها الـ States كـ Props) */}
      <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-gray-100 pt-6 lg:pt-0 lg:pl-6">
        <PurchaseCart
          supplierId={supplierId}
          purchaseItems={purchaseItems}
          setPurchaseItems={setPurchaseItems}
        />
      </div>
    </div>
  );
}

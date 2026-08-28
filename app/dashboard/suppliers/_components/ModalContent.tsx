"use client";

import { useState } from "react";
import { PurchaseOrder } from "../../orders/schemas/orders.schemas";
import PurchaseCart from "../../orders/_components/Cart";

export const availableSuppliers = [
  { id: "s1", name: "شركة النور للالكترونيات", contact: "أحمد علي" },
  { id: "s2", name: "مصنع الملابس العالمية", contact: "سارة عمر" },
];

export const availableProducts = [
  { id: "p1", name: "سماعات لاسلكية", costPrice: 80, currentStock: 15 },
  { id: "p2", name: "قميص قطني", costPrice: 25, currentStock: 32 },
  { id: "p3", name: "ماكينة قهوة", costPrice: 50, currentStock: 8 },
];

export interface CartPurchaseItem {
  id: string;
  name: string;
  costPrice: number;
  quantity: number;
}

interface ModalContentProps {
  initialOrder?: PurchaseOrder;
  isReadOnly?: boolean;
}

export default function ModalContent({
  initialOrder,
  isReadOnly = false,
}: ModalContentProps) {
  const [supplierId, setSupplierId] = useState<string>(
    initialOrder?.supplierId || "",
  );

  const [purchaseItems, setPurchaseItems] = useState<CartPurchaseItem[]>(
    initialOrder?.items?.map((item) => ({
      id: item.productId,
      name: item.productName || "منتج",
      costPrice: item.unitCost,
      quantity: item.quantity,
    })) || [],
  );

  const addToOrder = (productId: string) => {
    if (!productId || isReadOnly) return;
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
    <div className="grid gap-6 lg:grid-cols-12 min-h-125 dir-rtl">
      {/* القسم الأيمن: الاختيار */}
      <div className="lg:col-span-7 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-950">
            {initialOrder
              ? isReadOnly
                ? `تفاصيل الطلب ${initialOrder.orderNumber}`
                : `تعديل الطلب ${initialOrder.orderNumber}`
              : "إنشاء طلب شراء جديد"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            تسجيل المخزون الوارد من الموردين المعتمدين.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            اختر المورد
          </label>
          <select
            disabled={isReadOnly}
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition cursor-pointer disabled:opacity-75"
          >
            <option value="">اختر المورد من القائمة...</option>
            {availableSuppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {!isReadOnly && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              إضافة المنتجات
            </label>
            <select
              disabled={!supplierId}
              onChange={(e) => {
                addToOrder(e.target.value);
                e.target.value = "";
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="">
                {supplierId
                  ? "اضغط لإضافة منتج للطلب..."
                  : "⚠️ يرجى اختيار المورد أولاً"}
              </option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - ({p.costPrice} $)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* القسم الأيسر: السلة */}
      <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-r border-gray-100 pt-6 lg:pt-0 lg:pr-6">
        <PurchaseCart
          supplierId={supplierId}
          purchaseItems={purchaseItems}
          setPurchaseItems={setPurchaseItems}
          orderId={initialOrder?.id}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}

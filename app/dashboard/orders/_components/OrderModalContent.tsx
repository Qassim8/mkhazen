"use client";

import { useEffect, useState } from "react";
import PurchaseCart from "./Cart";
import { useModalStore } from "@/store/useModalStore";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "../services/order.services";
import { PurchaseOrder } from "../schemas/orders.schemas";
import toast from "react-hot-toast";

export interface Option {
  id: string;
  name: string;
  purchasePrice?: number;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  name: string;
  costPrice: number;
  quantity: number;
}

interface Props {
  initialOrder?: PurchaseOrder;
  isReadOnly?: boolean;
}

export default function OrderModalContent({
  initialOrder,
  isReadOnly = false,
}: Props) {
  const closeModal = useModalStore((state) => state.closeModal);

  // Dynamic Data States
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form States
  const [supplierId, setSupplierId] = useState<string>(
    initialOrder?.supplierId || "",
  );
  const [notes, setNotes] = useState<string>(initialOrder?.notes || "");
  const [expectedDate, setExpectedDate] = useState<string>(
    initialOrder?.expectedDate?.slice(0, 10) || "",
  );
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>(
    initialOrder?.items?.map((item) => ({
      id: item.productId,
      productId: item.productId,
      name: item.productName || "منتج",
      costPrice: item.unitCost,
      quantity: item.quantity,
    })) || [],
  );

  const [submitting, setSubmitting] = useState(false);

  // Fetch Suppliers and Products from API
  useEffect(() => {
    if (isReadOnly) return;

    setLoadingData(true);
    Promise.all([
      fetch("/api/suppliers").then((res) => res.json()),
      fetch("/api/products?limit=100").then((res) => res.json()),
    ])
      .then(([supplierRes, productRes]) => {
        setSuppliers(supplierRes?.data || []);
        setProducts(productRes?.data || []);
      })
      .catch(() => toast.error("تعذر تحميل الموردين والمنتجات"))
      .finally(() => setLoadingData(false));
  }, [isReadOnly]);

  const addToOrder = (productId: string) => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setPurchaseItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          productId: product.id,
          name: product.name,
          costPrice: product.purchasePrice || 0,
          quantity: 1,
        },
      ];
    });
  };

  const handleSubmitOrder = async () => {
    if (purchaseItems.length === 0) {
      return toast.error("يرجى إضافة منتج واحد على الأقل للطلب");
    }

    try {
      setSubmitting(true);
      const payload = {
        supplierId: supplierId || null, // المورد اختياري الآن
        expectedDate: expectedDate || null,
        notes,
        items: purchaseItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.costPrice,
        })),
      };

      if (initialOrder) {
        await updatePurchaseOrder(initialOrder.id, payload);
      } else {
        await createPurchaseOrder(payload);
      }

      toast.success(
        initialOrder ? "تم تحديث الطلب بنجاح" : "تم إنشاء الطلب بنجاح",
      );
      closeModal();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="w-2xl grid gap-6 lg:grid-cols-12 h-80 md:min-h-125 overflow-y-scroll"
      dir="rtl"
    >
      {/* الطرف الأيمن: البيانات والبحث */}
      <div className="lg:col-span-5 space-y-5">
        <div>
          <h3 className="text-lg font-bold text-gray-950">
            {initialOrder ? "تفاصيل طلب الشراء" : "طلب شراء جديد"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            تسجيل البضائع الواردة والمخزون من الموردين.
          </p>
        </div>

        {/* المورد - اختياري */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            المورد{" "}
            <span className="text-xs text-gray-400 font-normal">(اختياري)</span>
          </label>
          {isReadOnly ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
              {initialOrder?.supplierName || "بدون مورد"}
            </div>
          ) : (
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={loadingData}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-red-600 focus:bg-white focus:outline-none transition cursor-pointer disabled:opacity-50"
            >
              <option value="">بدون مورد (اختر مورد في حال وجوده)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* إضافة المنتجات */}
        {!isReadOnly && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              إضافة منتج
            </label>
            <select
              disabled={loadingData}
              onChange={(e) => {
                addToOrder(e.target.value);
                e.target.value = "";
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-red-600 focus:bg-white focus:outline-none transition cursor-pointer disabled:opacity-50"
            >
              <option value="">
                {loadingData
                  ? "جاري تحميل المنتجات..."
                  : "اضغط لاختيار منتج وتضمينه..."}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* التاريخ المتوقع والملاحظات */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              التاريخ المتوقع للاستلام
            </label>
            <input
              type="date"
              disabled={isReadOnly}
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-600 focus:bg-white focus:outline-none transition disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              ملاحظات
            </label>
            <input
              type="text"
              disabled={isReadOnly}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-600 focus:bg-white focus:outline-none transition disabled:opacity-70"
            />
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-r border-gray-100 pt-6 lg:pt-0 lg:pr-6">
        <PurchaseCart
          supplierId={supplierId}
          purchaseItems={purchaseItems}
          setPurchaseItems={setPurchaseItems}
          isReadOnly={isReadOnly}
          onSubmit={handleSubmitOrder}
          submitting={submitting}
          isEditing={!!initialOrder}
        />
      </div>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  inventoryAdjustmentSchema,
  InventoryAdjustmentInput,
} from "../schema/inventory.schemas";
import { createInventoryAdjustment } from "../services/inventory.services";
import { LuLoader, LuX } from "react-icons/lu";

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Array<{ id: string; name: string; stockQuantity: number }>;
  onSuccess?: () => void;
}

export default function AdjustmentModal({
  isOpen,
  onClose,
  products = [],
  onSuccess,
}: AdjustmentModalProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InventoryAdjustmentInput>({
    resolver: zodResolver(inventoryAdjustmentSchema),
    defaultValues: {
      productId: "",
      quantity: 0,
      notes: "",
    },
  });

  const selectedProductId = watch("productId");
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  if (!isOpen) return null;

  const onSubmit = (data: InventoryAdjustmentInput) => {
    startTransition(async () => {
      try {
        await createInventoryAdjustment(data);
        reset();
        onClose();
        if (onSuccess) onSuccess();
      } catch (error) {
        console.error("فشل إجراء التسوية المخزنية:", error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-950">
              تسوية مخزنية يدوية
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              تسجيل التغيرات المباشرة في المخزون (أدخل قيمة موجبة للزيادة وسالبة
              للنقصان)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          {/* اختيار المنتج */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              اختر المنتج
            </label>
            <select
              {...register("productId")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
            >
              <option value="">اختر المنتج للتسوية...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (المخزون الحالي: {p.stockQuantity})
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="text-xs text-rose-500 mt-1">
                {errors.productId.message}
              </p>
            )}
          </div>

          {/* فرق الكمية */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              مقدار التغير في الكمية
            </label>
            <input
              type="number"
              step="any"
              placeholder="مثال: 10 لإضافة مخزون، أو -5 للخصم/التالف"
              {...register("quantity", { valueAsNumber: true })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
            />
            {errors.quantity && (
              <p className="text-xs text-rose-500 mt-1">
                {errors.quantity.message}
              </p>
            )}
          </div>

          {selectedProduct && (
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-blue-800">
              الكمية الحالية للمنتج:{" "}
              <strong>{selectedProduct.stockQuantity}</strong>
            </div>
          )}

          {/* السبب / ملاحظات */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              سبب التسوية / ملاحظات
            </label>
            <textarea
              rows={3}
              placeholder="مثال: جرد دوري، تعديل كمية تالفة، الخ..."
              {...register("notes")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition resize-none"
            />
            {errors.notes && (
              <p className="text-xs text-rose-500 mt-1">
                {errors.notes.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-gray-900 transition disabled:opacity-50"
            >
              {isPending && <LuLoader className="h-4 w-4 animate-spin" />}
              تطبيق التسوية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

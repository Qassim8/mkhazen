"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { LuLoaderCircle, LuX } from "react-icons/lu";

import { correctOpeningStock } from "../services/inventory.services";
import type { OpeningStockCorrectionCandidate } from "../schema/inventory.schemas";

interface Props {
  item: OpeningStockCorrectionCandidate;
  onClose: () => void;
  onCorrected: () => void;
}

export default function EditOpeningStockModal({
  item,
  onClose,
  onCorrected,
}: Props) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitCost, setUnitCost] = useState(String(item.unitCost));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const numericQuantity = Number(quantity);
    const numericUnitCost = Number(unitCost);

    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      toast.error("يرجى إدخال كمية صحيحة");
      return;
    }

    if (!Number.isFinite(numericUnitCost) || numericUnitCost <= 0) {
      toast.error("يرجى إدخال تكلفة وحدة صحيحة");
      return;
    }

    try {
      setLoading(true);

      const response = await correctOpeningStock({
        variantId: item.variantId,
        quantity: numericQuantity,
        unitCost: numericUnitCost,
        notes: notes.trim() || null,
      });

      toast.success(response.message ?? "تم تصحيح المخزون الافتتاحي بنجاح");
      onCorrected();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تصحيح المخزون الافتتاحي",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">
              تصحيح الكمية الافتتاحية
            </h2>
            <p className="mt-1 text-xs text-gray-500">{item.productName}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            متاح فقط لأن هذا الصنف لم تحدث عليه أي حركة أخرى منذ تسجيل مخزونه
            الافتتاحي. الفرق يُسجَّل كقيد محاسبي جديد بدون تعديل القيد الأصلي.
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-bold text-gray-700">
                الكمية الصحيحة
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
            </div>

            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-bold text-gray-700">
                تكلفة الوحدة ($)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-gray-700">
              سبب التصحيح
              <span className="mr-1 text-xs font-normal text-gray-400">
                اختياري
              </span>
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="مثال: الكمية الصحيحة كانت 50 وليس 500"
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50"
            >
              {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
              حفظ التصحيح
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

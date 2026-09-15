"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LuLoaderCircle, LuX } from "react-icons/lu";

import { toast } from "react-hot-toast";

import { createAsset } from "../services/accounting.services";

import { AssetInput } from "../schemas/accounting.schema";

interface NewAssetModalProps {
  onClose: () => void;
}

export default function NewAssetModal({ onClose }: NewAssetModalProps) {
  const router = useRouter();

  const [name, setName] = useState("");

  const [category, setCategory] = useState<AssetInput["category"]>("OTHER");

  const [purchaseValue, setPurchaseValue] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">("CASH");

  const [reference, setReference] = useState("");

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const value = Number(purchaseValue);

    if (!name.trim()) {
      setError("اسم الأصل مطلوب");
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      setError("يرجى إدخال قيمة شراء صحيحة");
      return;
    }

    if (!purchaseDate) {
      setError("تاريخ الشراء مطلوب");
      return;
    }

    const payload: AssetInput = {
      name: name.trim(),

      category,

      purchaseValue: value,

      purchaseDate,

      paymentMethod,

      reference: reference.trim() || null,

      notes: notes.trim() || null,
    };

    try {
      setLoading(true);

      await createAsset(payload);

      toast.success("تم تسجيل الأصل بنجاح");

      onClose();

      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر تسجيل الأصل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">إضافة أصل</h2>

            <p className="mt-1 text-xs text-gray-500">
              سيتم إنشاء القيد المحاسبي تلقائيًا
            </p>
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

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* NAME */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                اسم الأصل
              </label>

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="مثال: مكيف غرفة الإدارة"
                maxLength={255}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
            </div>

            {/* CATEGORY */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                التصنيف
              </label>

              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as AssetInput["category"])
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="MACHINE">ماكينة</option>

                <option value="AIR_CONDITIONER">مكيف</option>

                <option value="COMPUTER">حاسوب</option>

                <option value="PRINTER">طابعة</option>

                <option value="FURNITURE">أثاث</option>

                <option value="OTHER">أخرى</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* VALUE */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                قيمة الشراء
              </label>

              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={purchaseValue}
                  onChange={(event) => setPurchaseValue(event.target.value)}
                  placeholder="0.00"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 pl-14 text-sm outline-none focus:border-gray-400"
                />

                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  ر.س
                </span>
              </div>
            </div>

            {/* DATE */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                تاريخ الشراء
              </label>

              <input
                type="date"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* PAYMENT */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                طريقة الدفع
              </label>

              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as "CASH" | "BANK")
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="CASH">الخزينة</option>

                <option value="BANK">البنك</option>
              </select>
            </div>

            {/* REFERENCE */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                المرجع
                <span className="mr-1 text-xs font-normal text-gray-400">
                  اختياري
                </span>
              </label>

              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={100}
                placeholder="رقم العملية أو الفاتورة..."
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
            </div>
          </div>

          {/* NOTES */}

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              ملاحظات
              <span className="mr-1 text-xs font-normal text-gray-400">
                اختياري
              </span>
            </label>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="أي تفاصيل إضافية..."
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* ACTIONS */}

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
              حفظ الأصل
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

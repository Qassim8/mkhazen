"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "react-hot-toast";
import { LuLoaderCircle, LuX } from "react-icons/lu";

import { createAsset } from "../services/accounting.services";
import {
  createAssetSchema,
  AssetFormInput,
  AssetInput,
} from "../schemas/accounting.schema";

interface NewAssetModalProps {
  onClose: () => void;
}

export default function NewAssetModal({ onClose }: NewAssetModalProps) {
  const router = useRouter();

  // تمرين نوع المدخلات ونوع المخرجات لمنع تعارض TypeScript
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormInput, any, AssetInput>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      name: "",
      category: "OTHER",
      purchaseValue: undefined,
      purchaseDate: new Date().toISOString().split("T")[0], // نص متوافق مع input type="date"
      paymentMethod: "CASH",
      reference: "",
      notes: "",
    },
  });

  const onSubmit = async (data: AssetInput) => {
    try {
      await createAsset(data);
      toast.success("تم تسجيل الأصل بنجاح");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الأصل");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* HEADER */}
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
            disabled={isSubmitting}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-5">
          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* NAME */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                اسم الأصل
              </label>
              <input
                type="text"
                {...register("name")}
                placeholder="مثال: مكيف غرفة الإدارة"
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* CATEGORY */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                التصنيف
              </label>

              <select
                {...register("category")}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="MACHINE">ماكينة</option>
                <option value="AIR_CONDITIONER">مكيف</option>
                <option value="COMPUTER">حاسوب</option>
                <option value="PRINTER">طابعة</option>
                <option value="FURNITURE">أثاث</option>
                <option value="OTHER">أخرى</option>
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.category.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* VALUE */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                قيمة الشراء
              </label>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  {...register("purchaseValue", { valueAsNumber: true })}
                  placeholder="0.00"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 pl-14 text-sm outline-none focus:border-gray-400"
                />

                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  ر.س
                </span>
              </div>
              {errors.purchaseValue && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.purchaseValue.message}
                </p>
              )}
            </div>

            {/* DATE */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                تاريخ الشراء
              </label>

              <input
                type="date"
                {...register("purchaseDate")}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
              {errors.purchaseDate && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.purchaseDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* PAYMENT */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                طريقة الدفع
              </label>

              <select
                {...register("paymentMethod")}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="CASH">الخزينة</option>
                <option value="BANK">البنك</option>
              </select>
              {errors.paymentMethod && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.paymentMethod.message}
                </p>
              )}
            </div>

            {/* REFERENCE */}
            <div className="flex-1 w-full">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                المرجع
                <span className="mr-1 text-xs font-normal text-gray-400">
                  اختياري
                </span>
              </label>

              <input
                type="text"
                {...register("reference")}
                placeholder="رقم العملية أو الفاتورة..."
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              />
              {errors.reference && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.reference.message}
                </p>
              )}
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
              {...register("notes")}
              rows={3}
              placeholder="أي تفاصيل إضافية..."
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-red-600">
                {errors.notes.message}
              </p>
            )}
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50"
            >
              {isSubmitting && (
                <LuLoaderCircle className="h-4 w-4 animate-spin" />
              )}
              حفظ الأصل
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

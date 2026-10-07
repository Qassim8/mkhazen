"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { LuFactory, LuPackageCheck, LuRefreshCw, LuX } from "react-icons/lu";

import {
  productionCompletionInputSchema,
  productionCompletionSchema,
  type ProductionCompletionFormValues,
  type TailoringOrder,
} from "../schemas/tailoring.schemas";
import { completeTailoringProduction, convertTailoringToProduct } from "../services/tailoring.services";

interface CategoryOption {
  id: string;
  name: string;
}

interface Props {
  order: TailoringOrder;
  categories: CategoryOption[];
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  mode?: "PRODUCTION" | "CONVERT_CUSTOMER";
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{message}</p>;
}

function inputClass(hasError?: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
    hasError ? "border-red-300 bg-red-50/30 focus:border-red-500" : "border-gray-300 bg-white focus:border-(--primary-red)"
  } disabled:bg-gray-50 disabled:text-gray-400`;
}

export default function ProductionCompletionForm({ order, categories, open, onClose, onCompleted, mode = "PRODUCTION" }: Props) {
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionCompletionFormValues>({
    resolver: zodResolver(productionCompletionSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      producedQuantity: "1",
      sellingPrice: "",
      minSellingPrice: "",
      sku: "",
      barcode: "",
      packBarcode: "",
      colorName: "",
      colorCode: "",
      size: "",
      minStockLevel: "5",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: mode === "CONVERT_CUSTOMER" ? order.tailoringItemName : "",
      description: mode === "CONVERT_CUSTOMER" ? order.tailoringItemDescription ?? "" : "",
      categoryId: "",
      producedQuantity: "1",
      sellingPrice: "",
      minSellingPrice: "",
      sku: "",
      barcode: "",
      packBarcode: "",
      colorName: "",
      colorCode: "",
      size: "",
      minStockLevel: "5",
    });
  }, [mode, open, order.tailoringItemDescription, order.tailoringItemName, reset]);

  const quantity = Number(watch("producedQuantity") || 0);
  const estimatedTotalCost = Number(order.totalCost.toFixed(2));
  const estimatedUnitCost = quantity > 0 ? Number((estimatedTotalCost / quantity).toFixed(2)) : 0;

  const submit = handleSubmit(async (values) => {
    try {
      const payload = productionCompletionInputSchema.parse(values);
      const response = mode === "CONVERT_CUSTOMER"
        ? await convertTailoringToProduct(order.id, payload)
        : await completeTailoringProduction(order.id, payload);
      toast.success(
        mode === "CONVERT_CUSTOMER"
          ? `تم تحويل الطلب إلى المنتج ${response.data.product_name} وإضافة ${response.data.produced_quantity} قطعة للمخزون.`
          : `تم إنشاء المنتج ${response.data.product_name} وإضافة ${response.data.produced_quantity} قطعة للمخزون.`,
      );
      onClose();
      onCompleted();
    } catch (error: unknown) {
      console.error("Complete tailoring production:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "CONVERT_CUSTOMER"
            ? "تعذر تحويل الطلب إلى منتج."
            : "تعذر استلام الإنتاج وإنشاء المنتج.",
      );
    }
  }, () => toast.error("تحقق من بيانات المنتج الظاهرة تحت الحقول."));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} dir="rtl" noValidate className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white p-5">
          <div>
            <div className="flex items-center gap-2">
              {mode === "CONVERT_CUSTOMER" ? <LuRefreshCw className="h-5 w-5 text-gray-700" /> : <LuFactory className="h-5 w-5 text-gray-700" />}
              <h2 className="text-lg font-black text-gray-950">{mode === "CONVERT_CUSTOMER" ? "تحويل الطلب إلى منتج للمخزون" : "استلام الإنتاج وإنشاء المنتج"}</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              الطلب {order.orderNumber} — {mode === "CONVERT_CUSTOMER" ? "سيتم إنهاء طلب العميل كطلب ملغي تشغيليًا، وإدخال القطعة للمخزون بتكلفتها الفعلية. عربون العميل لا يتحول إلى مبيعات هنا." : "سيتم إنشاء المنتج وإدخاله للمخزون وربط التكلفة والمحاسبة تلقائيًا في عملية واحدة."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40" aria-label="إغلاق">
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-[11px] font-bold text-gray-400">تكلفة القماش</p><p dir="ltr" className="mt-1 text-sm font-black">{order.fabricCost.toFixed(2)} ر.س</p></div>
              <div><p className="text-[11px] font-bold text-gray-400">تكلفة الخياطة</p><p dir="ltr" className="mt-1 text-sm font-black">{order.tailoringCost.toFixed(2)} ر.س</p></div>
              <div><p className="text-[11px] font-bold text-gray-400">إجمالي تكلفة الإنتاج</p><p dir="ltr" className="mt-1 text-sm font-black">{estimatedTotalCost.toFixed(2)} ر.س</p></div>
            </div>
            <p className="mt-3 text-[11px] text-gray-500">الكمية هنا هي عدد القطع الناتجة. {mode === "CONVERT_CUSTOMER" ? "القماش الذي أحضره العميل خارج المخزون لا يدخل في التكلفة؛ أما قماش المحل فيكون ضمن تكلفة القطعة." : "هذه ليست كمية القماش."}</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">اسم المنتج</span>
              <input {...register("name")} disabled={isSubmitting} className={inputClass(Boolean(errors.name))} placeholder="مثال: جلابية سوداء" />
              <InlineError message={errors.name?.message} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">التصنيف</span>
              <select {...register("categoryId")} disabled={isSubmitting} className={inputClass(Boolean(errors.categoryId))}>
                <option value="">بدون تصنيف</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <InlineError message={errors.categoryId?.message} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-gray-600">وصف المنتج</span>
            <textarea {...register("description")} disabled={isSubmitting} rows={3} className={`${inputClass(Boolean(errors.description))} resize-none`} placeholder="وصف مختصر للمنتج" />
            <InlineError message={errors.description?.message} />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">كمية الإنتاج</span>
              <input {...register("producedQuantity")} disabled={isSubmitting} type="number" min="1" step="1" inputMode="numeric" className={inputClass(Boolean(errors.producedQuantity))} />
              <InlineError message={errors.producedQuantity?.message} />
            </label>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-[11px] font-bold text-emerald-600">تكلفة القطعة التقديرية</p>
              <p dir="ltr" className="mt-1 text-sm font-black text-emerald-700">{estimatedUnitCost.toFixed(2)} ر.س</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-[11px] font-bold text-blue-600">وحدة المنتج</p>
              <p className="mt-1 text-sm font-black text-blue-700">قطعة</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">سعر البيع</span>
              <input {...register("sellingPrice")} disabled={isSubmitting} type="number" min="0.01" step="0.01" inputMode="decimal" className={inputClass(Boolean(errors.sellingPrice))} placeholder="مثال: 350" />
              <InlineError message={errors.sellingPrice?.message} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">الحد الأدنى لسعر البيع</span>
              <input {...register("minSellingPrice")} disabled={isSubmitting} type="number" min="0" step="0.01" inputMode="decimal" className={inputClass(Boolean(errors.minSellingPrice))} placeholder="اختياري" />
              <InlineError message={errors.minSellingPrice?.message} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="text-xs font-bold text-gray-600">SKU</span><input {...register("sku")} disabled={isSubmitting} className={inputClass(Boolean(errors.sku))} placeholder="اختياري" /><InlineError message={errors.sku?.message} /></label>
            <label className="block"><span className="text-xs font-bold text-gray-600">الباركود</span><input {...register("barcode")} disabled={isSubmitting} className={inputClass(Boolean(errors.barcode))} placeholder="اختياري" /><InlineError message={errors.barcode?.message} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="text-xs font-bold text-gray-600">باركود العبوة</span><input {...register("packBarcode")} disabled={isSubmitting} className={inputClass(Boolean(errors.packBarcode))} placeholder="اختياري" /><InlineError message={errors.packBarcode?.message} /></label>
            <label className="block"><span className="text-xs font-bold text-gray-600">الحد الأدنى للمخزون</span><input {...register("minStockLevel")} disabled={isSubmitting} type="number" min="0" step="1" inputMode="numeric" className={inputClass(Boolean(errors.minStockLevel))} /><InlineError message={errors.minStockLevel?.message} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block"><span className="text-xs font-bold text-gray-600">اللون</span><input {...register("colorName")} disabled={isSubmitting} className={inputClass(Boolean(errors.colorName))} placeholder="اختياري" /><InlineError message={errors.colorName?.message} /></label>
            <label className="block"><span className="text-xs font-bold text-gray-600">رمز اللون</span><input {...register("colorCode")} disabled={isSubmitting} className={inputClass(Boolean(errors.colorCode))} placeholder="#000000" /><InlineError message={errors.colorCode?.message} /></label>
            <label className="block"><span className="text-xs font-bold text-gray-600">المقاس</span><input {...register("size")} disabled={isSubmitting} className={inputClass(Boolean(errors.size))} placeholder="اختياري" /><InlineError message={errors.size?.message} /></label>
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white p-5">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-xl border border-gray-200 py-3 text-xs font-bold text-gray-700 disabled:opacity-40">إلغاء</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-xs font-bold text-white disabled:opacity-50">
            <LuPackageCheck className="h-4 w-4" />
            {isSubmitting
              ? mode === "CONVERT_CUSTOMER" ? "جارٍ تحويل الطلب..." : "جارٍ إنشاء المنتج..."
              : mode === "CONVERT_CUSTOMER" ? "تحويل الطلب وإضافة المنتج للمخزون" : "استلام الإنتاج وإنشاء المنتج"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { LuArrowRight, LuSave, LuShoppingBag, LuFactory, LuTrash2, LuPlus } from "react-icons/lu";

import FabricSearch from "./FabricSearch";
import {
  calculateMeasurementMeters,
  updateTailoringOrderFormSchema,
  type MeasurementUnit,
  type TailoringOrder,
  type UpdateTailoringOrderFormValues,
} from "../schemas/tailoring.schemas";
import { updateTailoringOrder } from "../services/tailoring.services";

interface TailorOption {
  id: string;
  name: string;
}

interface Props {
  order: TailoringOrder;
  tailors: TailorOption[];
}

interface SelectedFabric {
  variantId: string;
  productName: string;
  sku: string | null;
  colorName: string | null;
  stockQuantity: number;
  sellingUnit: string | null;
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{message}</p>;
}

function inputClass(hasError?: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-400 ${
    hasError
      ? "border-red-300 bg-red-50/30 focus:border-red-500"
      : "border-gray-300 bg-white focus:border-(--primary-red)"
  }`;
}

function initialMeasurements(order: TailoringOrder) {
  return order.measurements.length
    ? order.measurements.map((row) => ({
        label: row.label,
        value: String(row.value),
        unit: row.unit,
      }))
    : [{ label: "الطول", value: "", unit: "M" as MeasurementUnit }];
}

export default function EditTailoringOrderForm({ order, tailors }: Props) {
  const router = useRouter();
  const [selectedFabric, setSelectedFabric] = useState<SelectedFabric | null>(
    order.fabric
      ? {
          variantId: order.fabricVariantId ?? order.fabric.id,
          productName: order.fabric.name,
          sku: order.fabric.sku,
          colorName: null,
          stockQuantity: order.fabric.stockQuantity,
          sellingUnit: order.fabric.sellingUnit,
        }
      : null,
  );

  const {
    control,
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTailoringOrderFormValues>({
    resolver: zodResolver(updateTailoringOrderFormSchema),
    mode: "onChange",
    defaultValues: {
      tailoringPurpose: order.tailoringPurpose,
      tailoringItemName: order.tailoringItemName,
      tailoringItemDescription: order.tailoringItemDescription ?? "",
      tailorId: order.tailorId,
      customerName: order.customer?.name ?? "",
      customerWhatsapp: order.customer?.whatsappNumber ?? "",
      measurements: initialMeasurements(order),
      intakeDate: order.intakeDate,
      expectedDeliveryDate: order.expectedDeliveryDate,
      useStoreFabric: Boolean(order.fabricVariantId),
      fabricVariantId: order.fabricVariantId,
      fabricQuantity: order.fabricQuantity != null ? order.fabricQuantity.toFixed(2) : "",
      totalAmount: order.tailoringPurpose === "CUSTOMER" ? order.totalAmount.toFixed(2) : "",
      tailoringCost: order.tailoringCost.toFixed(2),
      notes: order.notes ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "measurements" });
  const purpose = useWatch({ control, name: "tailoringPurpose" });
  const useStoreFabric = useWatch({ control, name: "useStoreFabric" });
  const selectedFabricId = useWatch({ control, name: "fabricVariantId" });
  const measurements = useWatch({ control, name: "measurements" }) ?? [];
  const intakeDate = useWatch({ control, name: "intakeDate" });

  const numericMeasurements = useMemo(
    () =>
      measurements
        .filter((row) => row.label.trim() && row.value.trim())
        .map((row) => ({
          label: row.label.trim(),
          value: Number(row.value),
          unit: row.unit,
        }))
        .filter((row) => Number.isFinite(row.value) && row.value > 0),
    [measurements],
  );

  const measurementMeters = useMemo(
    () => calculateMeasurementMeters(numericMeasurements),
    [numericMeasurements],
  );
  const maxFabricQuantity = Number((measurementMeters + 1).toFixed(2));

  function handleFabricToggle(checked: boolean) {
    if (purpose === "PRODUCTION" && !checked) {
      toast.error("التصنيع للمخزون يجب أن يستخدم قماشًا من مخزون المحل.");
      return;
    }

    setValue("useStoreFabric", checked, { shouldDirty: true, shouldValidate: true });
    if (!checked) {
      setSelectedFabric(null);
      setValue("fabricVariantId", null, { shouldDirty: true, shouldValidate: true });
      setValue("fabricQuantity", "", { shouldDirty: true, shouldValidate: true });
      return;
    }

    setValue(
      "fabricQuantity",
      measurementMeters > 0 ? measurementMeters.toFixed(2) : "",
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function handleFabricSelect(fabric: SelectedFabric | null) {
    setSelectedFabric(fabric);
    setValue("fabricVariantId", fabric?.variantId ?? null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      "fabricQuantity",
      fabric && measurementMeters > 0 ? measurementMeters.toFixed(2) : "",
      { shouldDirty: true, shouldValidate: true },
    );
  }

  const submitHandler = handleSubmit(
    async (values) => {
      const numericMeasurementsPayload = values.measurements.map((row) => ({
        label: row.label.trim(),
        value: Number(row.value),
        unit: row.unit,
      }));

      try {
        await updateTailoringOrder(order.id, {
          tailoringItemName: values.tailoringItemName.trim(),
          tailoringItemDescription: values.tailoringItemDescription.trim() || null,
          tailorId: values.tailorId,
          customerName: purpose === "CUSTOMER" ? values.customerName.trim() : null,
          customerWhatsapp: purpose === "CUSTOMER" ? values.customerWhatsapp.trim() : null,
          measurements: numericMeasurementsPayload,
          intakeDate: values.intakeDate,
          expectedDeliveryDate: values.expectedDeliveryDate,
          fabricVariantId: values.useStoreFabric ? values.fabricVariantId : null,
          fabricQuantity: values.useStoreFabric ? Number(values.fabricQuantity) : null,
          totalAmount: purpose === "CUSTOMER" ? Number(values.totalAmount) : 0,
          tailoringCost: Number(values.tailoringCost),
          notes: values.notes.trim() || null,
        });

        toast.success(`تم حفظ تعديلات الطلب ${order.orderNumber}.`);
        router.push(`/dashboard/tailoring/${order.id}`);
        router.refresh();
      } catch (error: unknown) {
        console.error("Update tailoring order:", error);
        toast.error(error instanceof Error ? error.message : "تعذر حفظ تعديلات الطلب.");
      }
    },
    () => toast.error("تحقق من الحقول المطلوبة والملاحظات الظاهرة تحتها."),
  );

  const isProduction = purpose === "PRODUCTION";

  return (
    <form onSubmit={submitHandler} dir="rtl" className="space-y-6 pb-16" noValidate>
      <header className="border-b border-gray-100 pb-5">
        <div className="flex items-start gap-2">
          <Link
            href={`/dashboard/tailoring/${order.id}`}
            className="mt-1 rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            aria-label="العودة إلى الطلب"
          >
            <LuArrowRight />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-950">تعديل الطلب {order.orderNumber}</h1>
            <p className="mt-1 text-sm text-gray-500">
              التعديل متاح فقط قبل بدء التفصيل، ولا يمكن تغيير قيمة الطلب الأصلية لحماية العربون المسجل.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          {isProduction ? <LuFactory className="mt-0.5 h-5 w-5 text-amber-700" /> : <LuShoppingBag className="mt-0.5 h-5 w-5 text-amber-700" />}
          <div className="text-xs text-amber-900">
            <p className="font-black">هذه صفحة تعديل لطلب {isProduction ? "تصنيع للمخزون" : "تفصيل عميل"} في حالة «طلب جديد».</p>
            <p className="mt-1">بعد بدء التفصيل لا نرجع للخلف بتعديل عشوائي؛ المسار عند رفض العميل هو تحويل القطعة إلى منتج للمخزون.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">بيانات العمل</h2>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">اسم العمل / الطلب</span>
              <input {...register("tailoringItemName")} disabled={isSubmitting} className={inputClass(Boolean(errors.tailoringItemName))} placeholder="مثال: جلابية قطن" />
              <InlineError message={errors.tailoringItemName?.message} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">وصف العمل</span>
              <textarea {...register("tailoringItemDescription")} rows={3} disabled={isSubmitting} className={`${inputClass(Boolean(errors.tailoringItemDescription))} resize-none`} placeholder="تفاصيل إضافية عن القطعة أو الخامة أو الملاحظات المهمة" />
              <InlineError message={errors.tailoringItemDescription?.message} />
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">الخياط</h2>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">الخياط المسؤول</span>
              <select {...register("tailorId")} disabled={isSubmitting || tailors.length === 0} className={inputClass(Boolean(errors.tailorId))}>
                <option value="">اختر الخياط</option>
                {tailors.map((tailor) => <option key={tailor.id} value={tailor.id}>{tailor.name}</option>)}
              </select>
              <InlineError message={errors.tailorId?.message} />
            </label>
          </section>

          {purpose === "CUSTOMER" && (
            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-black text-gray-900">بيانات العميل</h2>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">اسم العميل</span>
                <input {...register("customerName")} disabled={isSubmitting} className={inputClass(Boolean(errors.customerName))} />
                <InlineError message={errors.customerName?.message} />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">واتساب العميل</span>
                <input {...register("customerWhatsapp")} disabled={isSubmitting} dir="ltr" className={`${inputClass(Boolean(errors.customerWhatsapp))} text-left`} placeholder="9665XXXXXXXX" />
                <InlineError message={errors.customerWhatsapp?.message} />
              </label>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-gray-900">المقاسات</h2>
              <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">الإجمالي التقريبي: {measurementMeters.toFixed(2)} متر</span>
            </div>
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-[1fr_1fr_90px_40px] gap-2">
                  <input {...register(`measurements.${index}.label`)} disabled={isSubmitting} className={inputClass(Boolean(errors.measurements?.[index]?.label))} placeholder="مثال: الصدر" />
                  <input {...register(`measurements.${index}.value`)} disabled={isSubmitting} type="number" min="0.01" step="0.01" inputMode="decimal" className={inputClass(Boolean(errors.measurements?.[index]?.value))} placeholder="القيمة" />
                  <select {...register(`measurements.${index}.unit`)} disabled={isSubmitting} className={inputClass(Boolean(errors.measurements?.[index]?.unit))}>
                    <option value="CM">سم</option>
                    <option value="M">متر</option>
                  </select>
                  <button type="button" onClick={() => remove(index)} disabled={isSubmitting || fields.length <= 1} className="rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40" aria-label="حذف المقاس"><LuTrash2 className="mx-auto h-4 w-4" /></button>
                  {errors.measurements?.[index]?.label?.message && <InlineError message={errors.measurements[index]?.label?.message} />}
                  {errors.measurements?.[index]?.value?.message && <InlineError message={errors.measurements[index]?.value?.message} />}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => append({ label: "", value: "", unit: "CM" })} disabled={isSubmitting || fields.length >= 30} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <LuPlus className="h-4 w-4" /> إضافة مقاس
            </button>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">الخامة</h2>
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <input type="checkbox" checked={useStoreFabric} disabled={isSubmitting || isProduction} onChange={(event) => handleFabricToggle(event.target.checked)} />
              <span className="text-xs font-bold text-gray-700">استخدام قماش من مخزون المحل</span>
            </label>

            {!useStoreFabric ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs font-semibold text-gray-500">القماش من العميل — لن يتم احتسابه ضمن مخزون المحل.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-600">القماش</label>
                  <FabricSearch value={selectedFabricId} onChange={handleFabricSelect} disabled={isSubmitting} initialSelection={selectedFabric} />
                  <InlineError message={errors.fabricVariantId?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold text-gray-600">كمية القماش بالمتر</span>
                    <input {...register("fabricQuantity")} disabled={!selectedFabricId || isSubmitting} type="number" min={measurementMeters > 0 ? measurementMeters : 0.01} max={maxFabricQuantity} step="0.01" className={inputClass(Boolean(errors.fabricQuantity))} />
                    <InlineError message={errors.fabricQuantity?.message} />
                  </label>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[11px] font-bold text-gray-400">الحد المسموح</p>
                    <p className="mt-1 text-sm font-black text-gray-900">{maxFabricQuantity.toFixed(2)} متر</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">المواعيد والقيم</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-gray-600">تاريخ الاستلام</span>
                <input {...register("intakeDate")} disabled={isSubmitting} type="date" className={inputClass(Boolean(errors.intakeDate))} />
                <InlineError message={errors.intakeDate?.message} />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">التسليم المتوقع</span>
                <input {...register("expectedDeliveryDate")} disabled={isSubmitting} type="date" min={intakeDate} className={inputClass(Boolean(errors.expectedDeliveryDate))} />
                <InlineError message={errors.expectedDeliveryDate?.message} />
              </label>
            </div>
            {purpose === "CUSTOMER" && (
              <label className="block">
                <span className="text-xs font-bold text-gray-600">إجمالي الطلب</span>
                <input type="hidden" {...register("totalAmount")} />
                <div className="relative">
                  <input readOnly disabled={isSubmitting} value={order.totalAmount.toFixed(2)} dir="ltr" className={`${inputClass(Boolean(errors.totalAmount))} bg-gray-50 pl-16 text-left`} />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">ر.س</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">القيمة ثابتة بعد إنشاء الطلب ولا تعدّل من هذه الصفحة.</p>
                <InlineError message={errors.totalAmount?.message} />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-bold text-gray-600">تكلفة الخياطة</span>
              <div className="relative">
                <input {...register("tailoringCost")} disabled={isSubmitting} type="number" min="0.01" step="0.01" inputMode="decimal" dir="ltr" className={`${inputClass(Boolean(errors.tailoringCost))} pl-16 text-left`} />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">ر.س</span>
              </div>
              <InlineError message={errors.tailoringCost?.message} />
              <p className="mt-1 text-[11px] text-gray-400">يمكن تعديل تكلفة الخياطة فقط قبل دفع دفعة مقدمة للخياط أو بدء التنفيذ.</p>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">ملاحظات</span>
              <textarea {...register("notes")} disabled={isSubmitting} rows={3} className={`${inputClass(Boolean(errors.notes))} resize-none`} />
              <InlineError message={errors.notes?.message} />
            </label>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-4">
        <Link href={`/dashboard/tailoring/${order.id}`} className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50">إلغاء</Link>
        <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
          <LuSave className="h-4 w-4" />
          {isSubmitting ? "جارٍ حفظ التعديلات..." : "حفظ التعديلات"}
        </button>
      </div>
    </form>
  );
}

"use client";

import BackLink from "@/components/shared/BackLink";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { LuFactory, LuPlus, LuShoppingBag, LuTrash2 } from "react-icons/lu";

import FabricSearch from "./FabricSearch";
import {
  calculateMeasurementMeters,
  tailoringOrderFormSchema,
  type MeasurementUnit,
  type TailoringOrderFormValues,
} from "../schemas/tailoring.schemas";
import { createTailoringOrder } from "../services/tailoring.services";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { formatQuantity, formatSDG, formatUSD, sdgToUsd, usdToSdg } from "@/lib/currency";
import { useExchangeRate } from "@/components/shared/useExchangeRate";
import ExchangeRateBadge from "@/components/shared/ExchangeRateBadge";
import CustomerPicker from "@/app/dashboard/customers/_components/CustomerPicker";
import type { CustomerRecord } from "@/app/dashboard/customers/services/customers.services";

interface TailorOption {
  id: string;
  name: string;
}

interface AdvanceSource {
  id: string;
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  measurements: { label: string; value: number; unit: MeasurementUnit }[];
  tailoringItemName: string;
  tailoringItemDescription: string | null;
  expectedDeliveryDate: string;
  customerAdvanceAvailable: number;
}

interface Props {
  tailors: TailorOption[];
  advanceSource?: AdvanceSource | null;
  initialCustomer?: CustomerRecord | null;
  canManageAll: boolean;
}

interface SelectedFabric {
  variantId: string;
  productName: string;
  sku: string | null;
  colorName: string | null;
  stockQuantity: number;
  sellingUnit: string | null;
  costPerMeterUsd: number | null;
}

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
      {message}
    </p>
  );
}

function inputClass(hasError?: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition disabled:bg-gray-50 disabled:text-gray-400 ${
    hasError
      ? "border-red-300 bg-red-50/30 focus:border-red-500"
      : "border-gray-300 bg-white focus:border-(--primary-red)"
  }`;
}

// مرجع ثابت: [] جديدة كل رندر كانت بتخلّي useMemo يعيد الحساب كل مرة
const NO_MEASUREMENTS: never[] = [];

export default function NewTailoringOrderForm({
  tailors,
  advanceSource = null,
  initialCustomer = null,
  canManageAll,
}: Props) {
  const router = useRouter();
  // نفس الطلب (بنفس العربون) ما يتسجلش مرتين لو المستخدم ضغط تاني بعد انقطاع
  const idempotency = useIdempotencyKey();
  const [selectedFabric, setSelectedFabric] = useState<SelectedFabric | null>(
    null,
  );

  const {
    control,
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TailoringOrderFormValues>({
    resolver: zodResolver(tailoringOrderFormSchema),
    mode: "onChange",
    defaultValues: {
      tailoringItemName: advanceSource?.tailoringItemName ?? "",
      tailoringItemDescription: advanceSource?.tailoringItemDescription ?? "",
      customerAdvanceSourceOrderId: advanceSource?.id ?? null,
      tailoringPurpose: "CUSTOMER",
      tailorId: "",
      customerName: advanceSource?.customerName ?? initialCustomer?.name ?? "",
      customerWhatsapp:
        advanceSource?.customerWhatsapp ??
        initialCustomer?.whatsappNumber ??
        "",
      measurements: advanceSource?.measurements?.length
        ? advanceSource.measurements.map((row) => ({
            ...row,
            value: String(row.value),
          }))
        : initialCustomer?.measurements.length
          ? initialCustomer.measurements.map((row) => ({
              ...row,
              value: String(row.value),
            }))
          : [
              { label: "الطول", value: "", unit: "M" },
              { label: "الصدر", value: "", unit: "CM" },
              { label: "الكتف", value: "", unit: "CM" },
              { label: "الخصر", value: "", unit: "CM" },
            ],
      intakeDate: todayISO(),
      expectedDeliveryDate:
        advanceSource?.expectedDeliveryDate &&
        advanceSource.expectedDeliveryDate >= todayISO()
          ? advanceSource.expectedDeliveryDate
          : "",
      useStoreFabric: false,
      fabricVariantId: null,
      fabricQuantity: "",
      totalAmount: "",
      depositAmount: "",
      tailoringCost: "",
      paymentMethod: "CASH",
      notes: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "measurements",
  });

  const purpose = useWatch({ control, name: "tailoringPurpose" });
  const useStoreFabric = useWatch({ control, name: "useStoreFabric" });
  const measurements =
    useWatch({ control, name: "measurements" }) ?? NO_MEASUREMENTS;
  const totalAmountValue = useWatch({ control, name: "totalAmount" });
  const depositAmountValue = useWatch({ control, name: "depositAmount" });
  const tailoringCostValue = useWatch({ control, name: "tailoringCost" });
  const selectedFabricId = useWatch({ control, name: "fabricVariantId" });
  const intakeDate = useWatch({ control, name: "intakeDate" });

  function handleCustomerSelection(customer: CustomerRecord | null) {
    setValue("customerName", customer?.name ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("customerWhatsapp", customer?.whatsappNumber ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    replace(
      (customer?.measurements.length
        ? customer.measurements
        : [
            { label: "الطول", value: 0, unit: "M" as const },
            { label: "الصدر", value: 0, unit: "CM" as const },
            { label: "الكتف", value: 0, unit: "CM" as const },
            { label: "الخصر", value: 0, unit: "CM" as const },
          ]
      ).map((measurement) => ({
        ...measurement,
        value: measurement.value > 0 ? String(measurement.value) : "",
      })),
    );
  }

  useEffect(() => {
    if (purpose === "PRODUCTION") {
      setValue("customerName", "", { shouldValidate: true });
      setValue("customerWhatsapp", "", { shouldValidate: true });
      setValue("totalAmount", "", { shouldValidate: true });
      setValue("paymentMethod", null, { shouldValidate: true });
      setValue("useStoreFabric", true, { shouldValidate: true });
    } else {
      setValue("paymentMethod", "CASH", { shouldValidate: true });
    }
  }, [purpose, setValue]);

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

  const totalAmount = Number(totalAmountValue || 0);
  // الطلب البديل: كامل الرصيد المنقول + عربون إضافي اختياري
  const transferredDeposit = advanceSource?.customerAdvanceAvailable ?? 0;
  const extraDeposit = Number(Number(depositAmountValue || 0).toFixed(2));
  const deposit = Number((transferredDeposit + extraDeposit).toFixed(2));
  const tailoringCost = Number(tailoringCostValue || 0);

  // سعر الطلب للزبون بالجنيه، وأجرة الخياط والقماش بالدولار
  const { rate: exchangeRate } = useExchangeRate();

  function setPurpose(nextPurpose: "CUSTOMER" | "PRODUCTION") {
    if (advanceSource && nextPurpose === "PRODUCTION") {
      toast.error(
        "الطلب البديل المرتبط بعربون سابق يجب أن يكون طلب تفصيل لعميل.",
      );
      return;
    }
    setValue("tailoringPurpose", nextPurpose, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (nextPurpose === "PRODUCTION") {
      setValue("useStoreFabric", true, {
        shouldDirty: true,
        shouldValidate: true,
      });
      if (measurementMeters > 0) {
        setValue("fabricQuantity", measurementMeters.toFixed(2), {
          shouldDirty: false,
          shouldValidate: true,
        });
      }
    }
  }

  function handleFabricToggle(checked: boolean) {
    if (purpose === "PRODUCTION" && !checked) {
      toast.error("التصنيع للمخزون يجب أن يستخدم قماشًا من مخزون المحل.");
      return;
    }

    setValue("useStoreFabric", checked, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (!checked) {
      setSelectedFabric(null);
      setValue("fabricVariantId", null, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue("fabricQuantity", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    setValue(
      "fabricQuantity",
      measurementMeters > 0 ? measurementMeters.toFixed(2) : "",
      {
        shouldDirty: false,
        shouldValidate: true,
      },
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
      {
        shouldDirty: false,
        shouldValidate: true,
      },
    );
  }

  const submitHandler = handleSubmit(
    async (values) => {
      if (tailors.length === 0) {
        toast.error("لا يوجد خياطون متاحون في هذا الفرع.");
        return;
      }

      const requestedTotal =
        values.tailoringPurpose === "CUSTOMER" ? Number(values.totalAmount) : 0;
      const requiredDeposit =
        values.tailoringPurpose === "CUSTOMER"
          ? Number(Number(values.depositAmount).toFixed(2))
          : 0;
      if (advanceSource && transferredDeposit > requestedTotal) {
        toast.error(
          `العربون المنقول ${formatSDG(transferredDeposit)} أكبر من إجمالي الطلب الجديد ${formatSDG(requestedTotal)}. استرد الفرق ${formatSDG(transferredDeposit - requestedTotal)} من الطلب الملغي أولًا.`,
        );
        return;
      }
      if (requestedTotal > 0 && transferredDeposit + requiredDeposit > requestedTotal) {
        toast.error(
          advanceSource
            ? "مجموع العربون المنقول والإضافي لا يمكن أن يتجاوز المبلغ الإجمالي."
            : "العربون لا يمكن أن يتجاوز المبلغ الإجمالي.",
        );
        return;
      }

      const payload = {
        tailoringItemName: values.tailoringItemName.trim(),
        tailoringItemDescription:
          values.tailoringItemDescription.trim() || null,
        customerAdvanceSourceOrderId: values.customerAdvanceSourceOrderId,
        tailoringPurpose: values.tailoringPurpose,
        tailorId: values.tailorId,
        customerName:
          values.tailoringPurpose === "CUSTOMER"
            ? values.customerName.trim()
            : null,
        customerWhatsapp:
          values.tailoringPurpose === "CUSTOMER"
            ? values.customerWhatsapp.trim()
            : null,
        measurements: values.measurements.map((row) => ({
          label: row.label.trim(),
          value: Number(row.value),
          unit: row.unit,
        })),
        intakeDate: values.intakeDate,
        expectedDeliveryDate: values.expectedDeliveryDate,
        fabricVariantId: values.useStoreFabric ? values.fabricVariantId : null,
        fabricQuantity: values.useStoreFabric
          ? Number(values.fabricQuantity)
          : null,
        totalAmount:
          values.tailoringPurpose === "CUSTOMER"
            ? Number(values.totalAmount)
            : 0,
        depositAmount:
          values.tailoringPurpose === "CUSTOMER" ? requiredDeposit : 0,
        tailoringCost: Number(values.tailoringCost),
        paymentMethod:
          values.tailoringPurpose === "CUSTOMER" &&
          (!advanceSource || requiredDeposit > 0)
            ? values.paymentMethod
            : null,
        notes: values.notes.trim() || null,
      };

      try {
        const response = await createTailoringOrder(payload, {
          idempotencyKey: idempotency.keyFor(payload),
        });
        idempotency.reset();
        toast.success(`تم إنشاء الطلب ${response.data.order_number} بنجاح.`);
        router.push(
          values.tailoringPurpose === "CUSTOMER"
            ? `/dashboard/tailoring/${response.data.id}?print=1`
            : `/dashboard/tailoring/${response.data.id}`,
        );
        router.refresh();
      } catch (error: unknown) {
        console.error("Create tailoring order:", error);
        toast.error(
          error instanceof Error ? error.message : "تعذر إنشاء طلب التفصيل.",
        );
      }
    },
    () => toast.error("تحقق من الحقول المطلوبة والملاحظات الظاهرة تحت كل حقل."),
  );

  return (
    <form
      onSubmit={submitHandler}
      dir="rtl"
      className="space-y-6 pb-16"
      noValidate
    >
      <header className="border-b border-gray-100 pb-5">
        <div className="mb-3">
          <BackLink
            href="/dashboard/tailoring"
            label="العودة إلى طلبات التفصيل"
          />
        </div>
        <div className="flex items-start gap-2">
          <div>
            <h1 className="text-2xl font-black text-gray-950">
              {advanceSource ? "إنشاء طلب بديل" : "طلب تفصيل جديد"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {advanceSource
                ? `سيتم نقل كامل رصيد العربون من الطلب ${advanceSource.orderNumber} إلى الطلب الجديد، ويمكن تحصيل عربون إضافي اختياري.`
                : canManageAll
                  ? "سجل طلب العميل أو أضف طلب تصنيع للمخزون وحدد الخياط المسؤول."
                  : "سجل طلب العميل وحدد الخياط المسؤول وتفاصيل التسليم."}
            </p>
          </div>
          <div className="mr-auto">
            <ExchangeRateBadge />
          </div>
        </div>
      </header>

      {advanceSource && (
        <section
          className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
          dir="rtl"
        >
          <p className="text-sm font-black text-blue-900">
            عربون منقول من طلب سابق
          </p>
          <p className="mt-1 text-xs text-blue-800">
            الطلب المصدر: <strong>{advanceSource.orderNumber}</strong> — العميل:{" "}
            <strong>{advanceSource.customerName}</strong>
          </p>
          <p className="mt-1 text-xs font-bold text-blue-800">
            العربون المنقول بالكامل: {formatSDG(advanceSource.customerAdvanceAvailable)}.
            سعر الطلب الجديد حر، ويجب ألا يقل عن العربون المنقول (وإلا استرد الفرق
            أولًا من الطلب الملغي).
          </p>
        </section>
      )}

      {canManageAll && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-black text-gray-900">نوع طلب التفصيل</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPurpose("CUSTOMER")}
              disabled={isSubmitting}
              className={`rounded-2xl border p-4 text-right transition ${
                purpose === "CUSTOMER"
                  ? "border-(--primary-red) bg-red-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <LuShoppingBag className="h-5 w-5 text-gray-700" />
              <p className="mt-2 text-sm font-black text-gray-900">
                تفصيل لعميل
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPurpose("PRODUCTION")}
              disabled={isSubmitting || Boolean(advanceSource)}
              className={`rounded-2xl border p-4 text-right transition ${
                purpose === "PRODUCTION"
                  ? "border-(--primary-red) bg-red-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <LuFactory className="h-5 w-5 text-gray-700" />
              <p className="mt-2 text-sm font-black text-gray-900">
                تصنيع للمخزون
              </p>
            </button>
          </div>
          <InlineError message={errors.tailoringPurpose?.message} />
        </section>
      )}
      <input type="hidden" {...register("tailoringPurpose")} />
      <input type="hidden" {...register("customerAdvanceSourceOrderId")} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">
              {purpose === "CUSTOMER"
                ? "الخياط والعميل والمنتج"
                : "الخياط والمنتج"}
            </h2>

            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                الخياط المسؤول
              </span>
              <select
                {...register("tailorId")}
                disabled={isSubmitting || tailors.length === 0}
                className={inputClass(Boolean(errors.tailorId))}
              >
                <option value="">اختر الخياط</option>
                {tailors.map((tailor) => (
                  <option key={tailor.id} value={tailor.id}>
                    {tailor.name}
                  </option>
                ))}
              </select>
              <InlineError message={errors.tailorId?.message} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                اسم العمل / الطلب
              </span>
              <input
                {...register("tailoringItemName")}
                disabled={isSubmitting}
                className={inputClass(Boolean(errors.tailoringItemName))}
                placeholder="مثال: جلابية قطن"
              />
              <InlineError message={errors.tailoringItemName?.message} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-600">وصف العمل</span>
              <textarea
                {...register("tailoringItemDescription")}
                rows={2}
                disabled={isSubmitting}
                className={`${inputClass(Boolean(errors.tailoringItemDescription))} resize-none`}
                placeholder="وصف مختصر للشكل أو القماش أو أي تفاصيل مهمة"
              />
              <InlineError message={errors.tailoringItemDescription?.message} />
            </label>

            {purpose === "CUSTOMER" ? (
              <div className="space-y-4">
                {!advanceSource && (
                  <CustomerPicker
                    initialCustomer={initialCustomer}
                    onSelect={handleCustomerSelection}
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold text-gray-600">
                      اسم العميل
                    </span>
                    <input
                      {...register("customerName")}
                      disabled={isSubmitting}
                      className={inputClass(Boolean(errors.customerName))}
                      placeholder="اسم العميل"
                    />
                    <InlineError message={errors.customerName?.message} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-gray-600">
                      رقم واتساب
                    </span>
                    <input
                      {...register("customerWhatsapp")}
                      disabled={isSubmitting}
                      dir="ltr"
                      inputMode="tel"
                      className={inputClass(Boolean(errors.customerWhatsapp))}
                      placeholder="+2499xxxxxxxx"
                    />
                    <InlineError message={errors.customerWhatsapp?.message} />
                  </label>
                </div>
              </div>
            ) : (
              <div></div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-gray-900">المقاسات</h2>
                <p className="mt-1 text-[11px] text-gray-400">
                  يُستخدم مجموع المقاسات بالمتر لتحديد كمية القماش المسموحة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => append({ label: "", value: "", unit: "CM" })}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <LuPlus className="h-3.5 w-3.5" /> إضافة مقاس
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const rowError = errors.measurements?.[index];
                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-gray-100 p-3"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_auto] gap-2">
                      <input
                        {...register(`measurements.${index}.label`)}
                        disabled={isSubmitting}
                        placeholder="المقاس"
                        className={inputClass(Boolean(rowError?.label))}
                      />
                      <input
                        {...register(`measurements.${index}.value`)}
                        disabled={isSubmitting}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="القيمة"
                        className={inputClass(Boolean(rowError?.value))}
                      />
                      <select
                        {...register(`measurements.${index}.unit`)}
                        disabled={isSubmitting}
                        className={inputClass(Boolean(rowError?.unit))}
                      >
                        <option value="CM">سم</option>
                        <option value="M">متر</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1 || isSubmitting}
                        className="rounded-xl border border-gray-200 px-3 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label="حذف المقاس"
                      >
                        <LuTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {(rowError?.label?.message ||
                      rowError?.value?.message ||
                      rowError?.unit?.message) && (
                      <div className="mt-1 space-y-0.5">
                        <InlineError message={rowError.label?.message} />
                        <InlineError message={rowError.value?.message} />
                        <InlineError message={rowError.unit?.message} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-bold text-gray-400">
                  مجموع المقاسات
                </p>
                <p className="mt-1 text-lg font-black text-gray-900">
                  {formatQuantity(measurementMeters)} متر
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <input
                id="store-fabric"
                type="checkbox"
                {...register("useStoreFabric")}
                checked={useStoreFabric}
                onChange={(event) => handleFabricToggle(event.target.checked)}
                disabled={isSubmitting || purpose === "PRODUCTION"}
                className="mt-1 h-4 w-4"
              />
              <label htmlFor="store-fabric" className="cursor-pointer">
                <span className="block text-sm font-black text-gray-900">
                  القماش من المحل
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  {purpose === "PRODUCTION"
                    ? "إجباري في التصنيع حتى ترتبط تكلفة الخام بالمخزون والمنتج النهائي."
                    : "عند التفعيل سيتم خصم القماش من المخزون وربط تكلفته بالطلب."}
                </span>
              </label>
            </div>

            {!useStoreFabric && purpose === "CUSTOMER" ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
                العميل أحضر القماش من الخارج — لا يوجد سحب من المخزون.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-600">
                    القماش
                  </label>
                  <FabricSearch
                    value={selectedFabricId}
                    onChange={handleFabricSelect}
                    disabled={isSubmitting}
                  />
                  <InlineError message={errors.fabricVariantId?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold text-gray-600">
                      كمية القماش بالمتر
                    </span>
                    <input
                      {...register("fabricQuantity")}
                      disabled={!selectedFabricId || isSubmitting}
                      type="number"
                      min={0.01}
                      max={selectedFabric?.stockQuantity}
                      step="0.01"
                      inputMode="decimal"
                      className={inputClass(Boolean(errors.fabricQuantity))}
                    />
                    <InlineError message={errors.fabricQuantity?.message} />
                    {selectedFabricId && !errors.fabricQuantity && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        الافتراضي {formatQuantity(measurementMeters)} متر، والحد
                        الأعلى المتوفر في المخزون.
                      </p>
                    )}
                  </label>
                  <div className="rounded-xl bg-gray-50 p-3">
                    {selectedFabric && (
                      <p className="mt-2 text-[11px] text-gray-500">
                        المتوفر حاليًا:{" "}
                        {formatQuantity(selectedFabric.stockQuantity)}{" "}
                        {selectedFabric.sellingUnit ?? "وحدة"}
                      </p>
                    )}
                    {selectedFabric?.costPerMeterUsd != null && (
                      <p className="mt-1 text-[11px] font-bold text-amber-600">
                        تكلفة المتر:{" "}
                        {exchangeRate
                          ? formatSDG(usdToSdg(selectedFabric.costPerMeterUsd, exchangeRate))
                          : formatUSD(selectedFabric.costPerMeterUsd)}
                        {exchangeRate && (
                          <span className="mr-1 text-[10px] font-semibold text-amber-400">
                            ≈ {formatUSD(selectedFabric.costPerMeterUsd)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">مواعيد الطلب</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-gray-600">
                  تاريخ استلام الطلب
                </span>
                <input
                  {...register("intakeDate")}
                  disabled={isSubmitting}
                  type="date"
                  className={inputClass(Boolean(errors.intakeDate))}
                />
                <InlineError message={errors.intakeDate?.message} />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-600">
                  تاريخ التسليم المتوقع
                </span>
                <input
                  {...register("expectedDeliveryDate")}
                  disabled={isSubmitting}
                  type="date"
                  min={intakeDate}
                  className={inputClass(Boolean(errors.expectedDeliveryDate))}
                />
                <InlineError message={errors.expectedDeliveryDate?.message} />
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-black text-gray-900">
              التكلفة {purpose === "CUSTOMER" ? "والبيع" : "والإنتاج"}
            </h2>

            {purpose === "CUSTOMER" ? (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600">
                    سعر طلب التفصيل للعميل
                  </span>
                  <input
                    {...register("totalAmount")}
                    disabled={isSubmitting}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="إجمالي المبلغ"
                    className={inputClass(Boolean(errors.totalAmount))}
                  />
                  <InlineError message={errors.totalAmount?.message} />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600">
                    {advanceSource ? "عربون إضافي (اختياري)" : "العربون المدفوع"}
                  </span>
                  <input
                    {...register("depositAmount")}
                    disabled={isSubmitting}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="مبلغ العربون"
                    className={inputClass(Boolean(errors.depositAmount))}
                  />
                  <InlineError message={errors.depositAmount?.message} />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[11px] font-bold text-gray-400">
                      الإجمالي
                    </p>
                    <p dir="ltr" className="mt-1 text-sm font-black">
                      {formatSDG(totalAmount)}
                    </p>
                    {exchangeRate && totalAmount > 0 && (
                      <p
                        dir="ltr"
                        className="mt-0.5 text-[10px] font-semibold text-gray-400"
                      >
                        ≈ {formatUSD(sdgToUsd(totalAmount, exchangeRate))}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-[11px] font-bold text-emerald-600">
                      العربون المستخدم
                    </p>
                    <p
                      dir="ltr"
                      className="mt-1 text-sm font-black text-emerald-700"
                    >
                      {formatSDG(deposit)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-[11px] font-bold text-red-500">
                      المتبقي
                    </p>
                    <p
                      dir="ltr"
                      className="mt-1 text-sm font-black text-red-600"
                    >
                      {formatSDG(Math.max(totalAmount - deposit, 0))}
                    </p>
                  </div>
                </div>
                {advanceSource && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
                    العربون = المنقول {formatSDG(transferredDeposit)} + الإضافي{" "}
                    {formatSDG(extraDeposit)}. الإضافي يُحصَّل بالجنيه بطريقة الدفع
                    المختارة.
                  </div>
                )}
                {(!advanceSource || extraDeposit > 0) && (
                  <label className="block">
                    <span className="text-xs font-bold text-gray-600">
                      {advanceSource ? "طريقة دفع العربون الإضافي" : "طريقة دفع العربون"}
                    </span>
                    <select
                      {...register("paymentMethod")}
                      disabled={isSubmitting}
                      className={inputClass(Boolean(errors.paymentMethod))}
                    >
                      <option value="CASH">نقداً / الخزينة</option>
                      <option value="BANK_TRANSFER">حوالة / البنك</option>
                    </select>
                    <InlineError message={errors.paymentMethod?.message} />
                  </label>
                )}
              </>
            ) : (
              <div></div>
            )}

            <label className="block">
              <span className="text-xs font-bold text-gray-600">
                أجرة الخياطة المتفق عليها مع الخياط (بالجنيه ج.س)
              </span>
              <input
                {...register("tailoringCost")}
                disabled={isSubmitting}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="مثال: 50000"
                className={inputClass(Boolean(errors.tailoringCost))}
              />
              <InlineError message={errors.tailoringCost?.message} />
              {exchangeRate && tailoringCost > 0 && (
                <p
                  dir="ltr"
                  className="mt-1 text-right text-[11px] font-semibold text-emerald-700"
                >
                  ≈ {formatUSD(sdgToUsd(tailoringCost, exchangeRate))} — تُحسب
                  داخليًا بالدولار بسعر اليوم
                </p>
              )}
              <p className="mt-1 text-[11px] text-gray-400">
                تُدخل مرة واحدة. في طلب العميل تُثبت عند التسليم، وفي التصنيع
                تُثبت عند إدخال المنتج النهائي للمخزون.
              </p>
            </label>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">
                التكلفة المعروفة حاليًا
              </p>
              <p className="mt-1 text-sm font-black text-gray-900">
                {formatSDG(tailoringCost > 0 ? tailoringCost : 0)} +{" "}
                {useStoreFabric
                  ? "تكلفة القماش من المخزون"
                  : "لا يوجد خام من المخزون"}
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-gray-600">ملاحظات</span>
              <textarea
                {...register("notes")}
                rows={4}
                disabled={isSubmitting}
                className={`${inputClass(Boolean(errors.notes))} resize-none`}
                placeholder={
                  purpose === "PRODUCTION"
                    ? "وصف أو ملاحظات تنفيذية للعملية"
                    : "ملاحظات خاصة بالطلب"
                }
              />
              <InlineError message={errors.notes?.message} />
            </label>
          </section>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || tailors.length === 0}
        className="w-full rounded-2xl bg-(--primary-red) py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting
          ? "جارٍ إنشاء الطلب..."
          : purpose === "CUSTOMER"
            ? advanceSource
              ? "إنشاء الطلب ونقل العربون"
              : "إنشاء الطلب وتحصيل العربون"
            : "إنشاء طلب تصنيع للمخزون"}
      </button>
    </form>
  );
}

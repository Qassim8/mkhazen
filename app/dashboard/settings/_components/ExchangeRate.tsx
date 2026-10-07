"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { LuBadgeDollarSign, LuLoader, LuPlus } from "react-icons/lu";

import { z } from "zod";

import { ExchangeRate } from "@/lib/validations/exchange-rate.schemas";
import { formatRate } from "@/lib/currency";

import {
  createExchangeRate,
  getExchangeRates,
} from "../services/exchange-rate.services";

// نموذج الإدخال يحتفظ بالقيمة كنص (input type=number) ونحولها عند الإرسال
const rateFormSchema = z.object({
  rate: z
    .string()
    .trim()
    .min(1, "سعر الصرف مطلوب")
    .refine((value) => Number(value) > 0, "سعر الصرف يجب أن يكون أكبر من صفر")
    .refine(
      (value) => Number(value) < 10_000_000,
      "سعر الصرف كبير جدًا، تأكد من القيمة",
    ),
  notes: z.string().trim().max(300, "الملاحظات طويلة جدًا").optional(),
});

type RateFormValues = z.infer<typeof rateFormSchema>;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ExchangeRateSettings() {
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentRate = history[0] ?? null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RateFormValues>({
    resolver: zodResolver(rateFormSchema),
    defaultValues: { rate: "", notes: "" },
  });

  async function loadHistory() {
    try {
      setIsLoading(true);
      const result = await getExchangeRates({ page: 1, limit: 20 });
      setHistory(result.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تحميل سجل أسعار الصرف",
      );
    } finally {
      setIsLoading(false);
    }
  }

  // التحميل الأول (isLoading بيبدأ true، والتحديث بيحصل بعد ما الطلب يرجع)
  useEffect(() => {
    let active = true;

    getExchangeRates({ page: 1, limit: 20 })
      .then((result) => {
        if (active) setHistory(result.data);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "تعذر تحميل سجل أسعار الصرف",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (values: RateFormValues) => {
    try {
      await createExchangeRate({
        rate: Number(values.rate),
        notes: values.notes?.trim() || null,
      });
      toast.success("تم تسجيل سعر الصرف الجديد بنجاح");
      reset({ rate: "", notes: "" });
      await loadHistory();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تسجيل سعر الصرف",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* السعر الحالي بشكل بارز */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-bold text-emerald-700">سعر الصرف الحالي</p>

        {isLoading ? (
          <p className="mt-2 text-sm text-emerald-600">جارٍ التحميل...</p>
        ) : currentRate ? (
          <>
            <p className="mt-1 text-3xl font-black text-emerald-800">
              {formatRate(currentRate.rate)}
            </p>
            <p className="mt-1 text-xs text-emerald-600">
              آخر تحديث: {formatDateTime(currentRate.effectiveAt)}
              {currentRate.notes && ` — ${currentRate.notes}`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm font-bold text-amber-600">
            ⚠️ لايوجد سعر صرف مسجّل حاليًا — البيع من الكاشير والتفصيل لن يعمل
            حتى تسجّل سعرًا
          </p>
        )}
      </div>

      {/* تسجيل سعر جديد */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5"
      >
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-900">
          <LuBadgeDollarSign className="h-4 w-4" />
          تسجيل تغيير سعر الصرف
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-gray-600">
              سعر الصرف الجديد (كم جنيه سوداني = 1 دولار)
            </span>
            <input
              {...register("rate")}
              type="number"
              step="0.01"
              min="0.01"
              disabled={isSubmitting}
              placeholder="مثال: 2500"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
            />
            {errors.rate && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                {errors.rate.message}
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold text-gray-600">
              ملاحظة (اختياري)
            </span>
            <input
              {...register("notes")}
              disabled={isSubmitting}
              placeholder="مثال: تحديث سعر الصرف المتداول اليوم"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-(--primary-red)"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-xl bg-(--primary-red) px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <LuLoader className="h-4 w-4 animate-spin" />
          ) : (
            <LuPlus className="h-4 w-4" />
          )}
          تسجيل السعر الجديد
        </button>

        <p className="text-[11px] text-gray-400">
          كل عملية بيع جديدة (كاشير أو تفصيل) من لحظة التسجيل سوف تستخدم هذا
          السعر تلقائيًا. الأسعار القديمة ستظل محفوظة في السجل تحت ومرتبطة
          بالعمليات التي حدثت وقتها، لن تتغيّر اي عملية بأثر رجعي.
        </p>
      </form>

      {/* السجل التاريخي */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h3 className="text-xs font-black text-gray-900">سجل أسعار الصرف</h3>
        </div>

        {history.length === 0 && !isLoading ? (
          <div className="p-10 text-center text-sm text-gray-400">
            لا يوجد سجل بعد
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div>
                  <p dir="ltr" className="text-sm font-black text-gray-900">
                    {formatRate(entry.rate)}
                  </p>
                  {entry.notes && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {entry.notes}
                    </p>
                  )}
                </div>

                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-600">
                    {formatDateTime(entry.effectiveAt)}
                  </p>
                  {entry.createdByName && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      بواسطة {entry.createdByName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

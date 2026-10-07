"use client";

import { useEffect, useMemo, useState } from "react";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { LuBanknote, LuCalendarDays, LuLoader, LuX } from "react-icons/lu";

import { useRouter } from "next/navigation";

import toast from "react-hot-toast";

import {
  CreatePurchasePaymentFormInput,
  purchasePaymentFields,
} from "../schemas/orders.schemas";

import { createPurchaseOrderPayment } from "../services/order.services";

interface PaymentModalProps {
  isOpen: boolean;
  orderId: string;
  remainingAmount: number;
  onClose: () => void;
}

const getToday = () => {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export default function PaymentModal({
  isOpen,
  orderId,
  remainingAmount,
  onClose,
}: PaymentModalProps) {
  const router = useRouter();

  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreatePurchasePaymentFormInput>({
    resolver: zodResolver(purchasePaymentFields),

    defaultValues: {
      amount: remainingAmount,

      paymentDate: getToday(),

      paymentMethod: "CASH",

      reference: null,

      notes: null,
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    reset({
      amount: remainingAmount,

      paymentDate: getToday(),

      paymentMethod: "CASH",

      reference: null,

      notes: null,
    });
  }, [isOpen, remainingAmount, reset]);

  const amount = Number(watch("amount") || 0);

  const remainingAfterPayment = useMemo(
    () => Math.max(remainingAmount - amount, 0),
    [remainingAmount, amount],
  );

  if (!isOpen) {
    return null;
  }

  const onSubmit = async (data: CreatePurchasePaymentFormInput) => {
    const paymentAmount = Number(data.amount || 0);

    if (paymentAmount > remainingAmount) {
      toast.error(
        `مبلغ الدفعة أكبر من المبلغ المتبقي (${remainingAmount.toFixed(
          2,
        )} ريال)`,
      );

      return;
    }

    try {
      setIsPending(true);

      const response = await createPurchaseOrderPayment(orderId, {
        amount: Number(paymentAmount.toFixed(2)),

        paymentDate: data.paymentDate,

        paymentMethod: data.paymentMethod,

        reference: data.reference || null,

        notes: data.notes || null,
      });

      toast.success(response.message ?? "تم تسجيل الدفعة بنجاح");

      onClose();

      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدفعة");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-xl max-h-165 overflow-auto rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-6">
          <div>
            <h3 className="text-lg font-bold text-gray-950">تسجيل دفعة</h3>

            <p className="mt-1 text-xs text-gray-500">
              تسجيل دفعة جديدة على أمر الشراء
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-amber-700">المبلغ المتبقي</span>

              <span className="font-mono font-bold text-amber-800">
                {remainingAmount.toFixed(2)} ر.س
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              مبلغ الدفعة
            </label>

            <input
              type="number"
              min="0.01"
              max={remainingAmount}
              step="0.01"
              autoFocus
              {...register("amount", {
                valueAsNumber: true,
              })}
              disabled={isPending}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
            />

            {errors.amount && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              طريقة الدفع
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  value="CASH"
                  {...register("paymentMethod")}
                  disabled={isPending}
                  className="peer sr-only"
                />

                <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition peer-checked:border-(--primary-red) peer-checked:bg-red-50 peer-checked:text-(--primary-red)">
                  <LuBanknote className="h-4 w-4" />
                  نقداً
                </div>
              </label>

              <label className="cursor-pointer">
                <input
                  type="radio"
                  value="BANK"
                  {...register("paymentMethod")}
                  disabled={isPending}
                  className="peer sr-only"
                />

                <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 transition peer-checked:border-(--primary-red) peer-checked:bg-red-50 peer-checked:text-(--primary-red)">
                  <LuBanknote className="h-4 w-4" />
                  بنك / تحويل
                </div>
              </label>
            </div>

            {errors.paymentMethod && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.paymentMethod.message}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                تاريخ الدفع
              </label>

              <div className="relative">
                <LuCalendarDays className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="date"
                  {...register("paymentDate")}
                  disabled={isPending}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-9 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                />
              </div>

              {errors.paymentDate && (
                <p className="mt-1 text-xs text-rose-500">
                  {errors.paymentDate.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                المرجع
              </label>

              <input
                type="text"
                maxLength={100}
                placeholder="رقم التحويل أو المرجع"
                {...register("reference")}
                disabled={isPending}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
              />

              {errors.reference && (
                <p className="mt-1 text-xs text-rose-500">
                  {errors.reference.message}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>المتبقي قبل الدفع</span>

                <span className="font-mono font-semibold text-gray-900">
                  {remainingAmount.toFixed(2)} ر.س
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>الدفعة الحالية</span>

                <span className="font-mono font-semibold text-emerald-600">
                  {Math.max(amount, 0).toFixed(2)} ر.س
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-gray-200 pt-2 font-bold text-gray-900">
                <span>المتبقي بعد الدفع</span>

                <span className="font-mono">
                  {remainingAfterPayment.toFixed(2)} ر.س
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              ملاحظات
            </label>

            <textarea
              rows={3}
              {...register("notes")}
              disabled={isPending}
              placeholder="ملاحظات عن الدفعة..."
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isPending || remainingAmount <= 0}
              className="inline-flex items-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <LuLoader className="h-4 w-4 animate-spin" />}

              {isPending ? "جاري التسجيل..." : "تسجيل الدفعة"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

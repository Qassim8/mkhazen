"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuLock, LuLoader } from "react-icons/lu";
import toast from "react-hot-toast";
import { changePassword } from "@/app/(login)/services/auth.services";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validations/auth.schemas";

interface PasswordProps {
  onSuccess?: (role: string) => void;
}

const Password = ({ onSuccess }: PasswordProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: UpdatePasswordInput) => {
    try {
      setIsSubmitting(true);
      const res = await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      toast.success(res.message || "تم تغيير كلمة المرور بنجاح");
      reset();

      // إذا تم تمرير onSuccess استدعها فوراً مع الـ role
      if (onSuccess && res.role) {
        onSuccess(res.role);
      }
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onError = (formErrors: any) => {
    console.log("Validation Errors:", formErrors);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuLock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              تحديث كلمة المرور
            </h2>
            <p className="text-sm text-gray-500">
              غيّر كلمة المرور بشكل آمن هنا.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit, onError)}>
          <div className="grid gap-4 md:grid-cols-2">
            {/* كلمة المرور الحالية */}
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                كلمة المرور الحالية
              </span>
              <input
                type="password"
                {...register("currentPassword")}
                placeholder="أدخل كلمة المرور الحالية"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.currentPassword
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
              />
              {errors.currentPassword && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.currentPassword.message}
                </span>
              )}
            </label>

            {/* كلمة المرور الجديدة */}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                كلمة المرور الجديدة
              </span>
              <input
                type="password"
                {...register("newPassword")}
                placeholder="أدخل كلمة المرور الجديدة"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.newPassword
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
              />
              {errors.newPassword && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.newPassword.message}
                </span>
              )}
            </label>

            {/* تأكيد كلمة المرور */}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                تأكيد كلمة المرور
              </span>
              <input
                type="password"
                {...register("confirmPassword")}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.confirmPassword
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
              />
              {errors.confirmPassword && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.confirmPassword.message}
                </span>
              )}
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 flex items-center gap-2 rounded-xl bg-(--primary-red) px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover) disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting && <LuLoader className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "جاري التحديث..." : "تحديث كلمة المرور"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Password;

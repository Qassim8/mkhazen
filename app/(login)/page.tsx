"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  LuStore,
  LuLock,
  LuMail,
  LuEye,
  LuEyeOff,
  LuLoader,
  LuCircleAlert,
} from "react-icons/lu";

import { loginSchema, LoginInput } from "@/lib/validations/auth.schemas";
import { login } from "./services/auth.services";
import { useModalStore } from "@/store/useModalStore";

export default function LoginPage() {
  const router = useRouter();
  const openModal = useModalStore((state) => state.openModal);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      const res = await login(data);

      toast.success(res.message || "تم تسجيل الدخول بنجاح! مرحباً بك.", {
        duration: 3000,
      });

      router.push("/dashboard");
      router.refresh();
    } catch (error: any) {
      toast.error(
        error.message || "فشل تسجيل الدخول، يرجى التأكد من البيانات",
        {
          duration: 4000,
        },
      );
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-6">
        {/* الشعار والترويسة */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuStore className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-black text-gray-950 mt-4">
            تسجيل الدخول للنظام
          </h1>
          <p className="text-xs font-semibold text-gray-500">
            أدخل بيانات حسابك للمتابعة إلى لوحة التحكم
          </p>
        </div>

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* حقل البريد الإلكتروني */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              البريد الإلكتروني للموظف
            </label>
            <div className="relative">
              <LuMail className="absolute right-4 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="email"
                {...register("email")}
                placeholder="name@store.com"
                className={`w-full rounded-xl border ${
                  errors.email
                    ? "border-red-400 bg-red-50/20"
                    : "border-gray-200 bg-gray-50/50"
                } pl-4 pr-11 py-3 text-xs text-gray-900 font-semibold focus:border-(--primary-red) focus:bg-white focus:outline-none transition`}
              />
            </div>
            {errors.email && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-red-500">
                <LuCircleAlert className="h-3.5 w-3.5" />
                <span>{errors.email.message}</span>
              </p>
            )}
          </div>

          {/* حقل كلمة المرور */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <LuLock className="absolute right-4 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                {...register("password")}
                placeholder="••••••••"
                className={`w-full rounded-xl border ${
                  errors.password
                    ? "border-red-400 bg-red-50/20"
                    : "border-gray-200 bg-gray-50/50"
                } pl-11 pr-11 py-3 text-xs text-gray-900 font-semibold focus:border-(--primary-red) focus:bg-white focus:outline-none transition`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-3.5 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? (
                  <LuEyeOff className="h-4 w-4" />
                ) : (
                  <LuEye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-red-500">
                <LuCircleAlert className="h-3.5 w-3.5" />
                <span>{errors.password.message}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-gray-500">
            <button
              type="button"
              onClick={() => openModal("FORGOT_PASSWORD")}
              className="text-(--primary-red) hover:underline cursor-pointer"
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-950 py-3 text-xs font-bold text-white shadow-sm hover:bg-gray-900 active:scale-[0.99] transition disabled:opacity-50 cursor-pointer pt-3.5"
          >
            {isSubmitting ? (
              <>
                <LuLoader className="h-4 w-4 animate-spin" />
                <span>جاري التحقق من البيانات...</span>
              </>
            ) : (
              "دخول إلى لوحة التحكم"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

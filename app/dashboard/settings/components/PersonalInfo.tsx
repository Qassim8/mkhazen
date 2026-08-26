"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuLoader, LuUserRound } from "react-icons/lu";
import {
  UpdateProfileInput,
  updateProfileSchema,
} from "@/lib/validations/auth.schemas";
import { getMe, updateProfile } from "@/app/(login)/services/auth.services";
import toast from "react-hot-toast";

const PersonalInfo = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: "",
    },
  });

  // 1. جلب بيانات المستخدم الحالية
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        const data = await getMe();
        if (data) {
          reset({
            name: data?.name || "",
            email: data?.email || "",
            phone: data?.phone || "",
          });
        }
      } catch (error: any) {
        toast.error(error.message || "فشل جلب بيانات المستخدم");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [reset]);

  // 2. إرسال التحديثات إلى الـ API
  const onSubmit = async (data: UpdateProfileInput) => {
    console.log("Form Submitted Data:", data);
    try {
      setIsSubmitting(true);
      const res = await updateProfile({
        name: data.name,
        email: data.email,
        phone: data.phone,
      });
      toast.success(res.message || "تم تحديث البيانات بنجاح");
      window.dispatchEvent(new Event("user-updated"));
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء تحديث البيانات");
    } finally {
      setIsSubmitting(false);
    }
  };

  // التقاط الأخطاء في حال فشل الـ Validation
  const onError = (formErrors: any) => {
    console.log("Validation Errors:", formErrors);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuLoader className="h-8 w-8 animate-spin text-(--primary-red)" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
            <LuUserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              تفاصيل الملف الشخصي
            </h2>
            <p className="text-sm text-gray-500">حدث معلوماتك الشخصية من هنا</p>
          </div>
        </div>

        {/* تمرير onError للـ handleSubmit */}
        <form onSubmit={handleSubmit(onSubmit, onError)}>
          <div className="grid gap-4 md:grid-cols-2">
            {/* الاسم الكامل */}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                الاسم الكامل
              </span>
              <input
                {...register("name")}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.name
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
                placeholder="أدخل الاسم الكامل"
              />
              {errors.name && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.name.message}
                </span>
              )}
            </label>

            {/* البريد الإلكتروني */}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                البريد الالكتروني
              </span>
              <input
                {...register("email")}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.email
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
              />
              {errors.email && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.email.message}
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                رقم الهاتف
              </span>
              <input
                {...register("phone")}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                  errors.phone
                    ? "border-red-500 bg-red-50/30"
                    : "border-gray-200 bg-gray-50 focus:border-(--primary-red) focus:bg-white"
                }`}
              />
              {errors.phone && (
                <span className="mt-1 block text-xs text-red-500">
                  {errors.phone.message}
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
            {isSubmitting ? "جاري الحفظ..." : "حفظ المعلومات"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PersonalInfo;

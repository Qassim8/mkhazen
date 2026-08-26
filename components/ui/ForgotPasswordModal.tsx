"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { LuUserCheck, LuLoader, LuCircleAlert, LuX } from "react-icons/lu";

import { useModalStore } from "@/store/useModalStore";
import {
  forgotPasswordSchema,
  ForgotPasswordInput,
} from "@/lib/validations/auth.schemas";
import { requestPasswordReset } from "@/app/(login)/services/auth.services";

export default function ForgotPasswordModal() {
  const { closeModal } = useModalStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      identifier: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      const res = await requestPasswordReset(data.identifier);
      toast.success(res.message || "تم إرسال الطلب لمدير النظام بنجاح", {
        duration: 4000,
      });
      closeModal();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء إرسال الطلب");
    }
  };

  return (
    <div
      dir="rtl"
      className="w-full max-w-xl bg-white rounded-xl p-6 shadow-2xl border border-gray-100"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-red-50 text-(--primary-red) rounded-xl">
            <LuUserCheck className="h-5 w-5" />
          </div>
          <h2 className="text-base font-black text-gray-900">
            طلب إستعادة كلمة المرور
          </h2>
        </div>
        <button
          type="button"
          onClick={closeModal}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"
        >
          <LuX className="h-5 w-5" />
        </button>
      </div>

      <p className="text-xs font-semibold text-gray-500 mb-5 leading-relaxed">
        أدخل اسمك أو البريد الإلكتروني الخاص بك المسجل بالنظام، وسيتم إرسال
        تنبيه لإدارة النظام لإعادة تعيين كلمة المرور الخاصة بك.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            البريد الإلكتروني أو اسم الموظف
          </label>
          <input
            type="text"
            {...register("identifier")}
            placeholder="مثال: name@store.com أو أحمد علي"
            className={`w-full rounded-xl border ${
              errors.identifier
                ? "border-red-400 bg-red-50/20"
                : "border-gray-200 bg-gray-50/50"
            } px-4 py-3 text-xs text-gray-900 font-semibold focus:border-(--primary-red) focus:bg-white focus:outline-none transition`}
          />
          {errors.identifier && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-red-500">
              <LuCircleAlert className="h-3.5 w-3.5" />
              <span>{errors.identifier.message}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
          >
            إلغاء
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-gray-950 hover:bg-gray-900 rounded-xl transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <LuLoader className="h-4 w-4 animate-spin" />
                <span>جاري الإرسال...</span>
              </>
            ) : (
              "تأكيد الإرسال"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

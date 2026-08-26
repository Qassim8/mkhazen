"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useModalStore } from "@/store/useModalStore";
import { LuKeyRound, LuLoader, LuCheck, LuCopy } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { resetEmployeePassword } from "@/app/dashboard/employees/services/employees.services";
import {
  AdminResetPasswordInput,
  adminResetPasswordSchema,
} from "@/lib/validations/auth.schemas";

interface Props {
  employeeId: string;
  employeeName: string;
}

const ResetPasswordModalContent = ({ employeeId, employeeName }: Props) => {
  const closeModal = useModalStore((state) => state.closeModal);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successPassword, setSuccessPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminResetPasswordInput>({
    resolver: zodResolver(adminResetPasswordSchema),
  });

  const onSubmit = async (values: AdminResetPasswordInput) => {
    setServerError(null);
    try {
      const res = await resetEmployeePassword(employeeId, values);
      if (res) {
        setSuccessPassword(values.password);
        router.refresh();
      }
    } catch (err: any) {
      setServerError(err?.message || "حدث خطأ أثناء تعيين كلمة المرور");
    }
  };

  const copyToClipboard = () => {
    if (successPassword) {
      navigator.clipboard.writeText(successPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (successPassword) {
    return (
      <div className="space-y-4 pt-2 text-center">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <LuCheck className="w-6 h-6" />
        </div>

        <div>
          <h4 className="text-sm font-black text-gray-900">
            تم تغيير كلمة المرور بنجاح!
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            يرجى إبلاغ الموظف
            <strong className="text-gray-800">{employeeName}</strong> بكلمة
            المرور الجديدة التالية:
          </p>
        </div>

        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-2 max-w-xs mx-auto">
          <span className="font-mono text-base font-black text-amber-700 tracking-wider">
            {successPassword}
          </span>
          <button
            type="button"
            onClick={copyToClipboard}
            className="p-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition flex items-center gap-1"
          >
            {copied ? <LuCheck className="text-emerald-600" /> : <LuCopy />}
            <span>{copied ? "تم النسخ" : "نسخ"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
        <LuKeyRound className="h-5 w-5 shrink-0 text-amber-600" />
        <p>
          أنت تقوم الآن بإعادة تعيين كلمة المرور للموظف:{" "}
          <strong className="font-extrabold">{employeeName}</strong>
        </p>
      </div>

      {serverError && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
          {serverError}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-bold text-gray-700 block">
          كلمة المرور الجديدة
        </label>
        <input
          type="password"
          placeholder="أدخل كلمة المرور الجديدة"
          {...register("password")}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500 transition"
        />
        {errors.password && (
          <p className="text-[11px] text-rose-600 font-bold">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-gray-700 block">
          تأكيد كلمة المرور
        </label>
        <input
          type="password"
          placeholder="أعد كتابة كلمة المرور"
          {...register("confirmPassword")}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-amber-500 transition"
        />
        {errors.confirmPassword && (
          <p className="text-[11px] text-rose-600 font-bold">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={closeModal}
          className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting && <LuLoader className="h-3.5 w-3.5 animate-spin" />}
          تأكيد وتغيير كلمة المرور
        </button>
      </div>
    </form>
  );
};

export default ResetPasswordModalContent;

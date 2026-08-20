"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createEmployeeSchema,
  CreateEmployeeInput,
} from "@/lib/validations/employee.schemas";

interface ModalContentProps {
  onSubmitSuccess?: () => void;
}

export default function ModalContent({ onSubmitSuccess }: ModalContentProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      position: "tailor",
      shift: "morning",
      status: "active",
    },
  });

  const onSubmit = async (data: CreateEmployeeInput) => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "فشل في إضافة الموظف");
      }

      reset();
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err: any) {
      console.error(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h3 className="text-lg font-bold text-gray-950">إضافة موظف جديد</h3>
        <p className="mt-1 text-sm text-gray-500">
          يرجى ملء جميع الحقول المطلوبة بعناية قبل حفظ بيانات الموظف الجديد.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* الاسم الكامل */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الاسم الكامل <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register("name")}
            placeholder="مثال: أحمد رأفت"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        {/* رقم الهاتف */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            رقم الهاتف <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            {...register("phone")}
            placeholder="+249..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>
          )}
        </div>

        {/* البريد الإلكتروني */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            البريد الإلكتروني <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            {...register("email")}
            placeholder="name@store.com"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* المسمى الوظيفي (Position) */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الوظيفة <span className="text-red-500">*</span>
          </label>
          <select
            {...register("position")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          >
            <option value="tailor">خياط (Tailor)</option>
            <option value="cashier">كاشير (Cashier)</option>
            <option value="system_manager">مدير نظام (Admin)</option>
          </select>
          {errors.position && (
            <p className="mt-1 text-xs text-red-500">
              {errors.position.message}
            </p>
          )}
        </div>

        {/* الدوام (Shift) */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الدوام <span className="text-red-500">*</span>
          </label>
          <select
            {...register("shift")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          >
            <option value="morning">صباحي</option>
            <option value="night">مسائي</option>
            <option value="full_time">دوام كامل / مزدوج</option>
          </select>
          {errors.shift && (
            <p className="mt-1 text-xs text-red-500">{errors.shift.message}</p>
          )}
        </div>

        {/* حالة الحساب (Status) */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            حالة الحساب
          </label>
          <select
            {...register("status")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
          >
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 pt-5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? "جاري الحفظ..." : "حفظ البيانات"}
        </button>
      </div>
    </form>
  );
}

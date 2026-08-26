"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useModalStore } from "@/store/useModalStore";
import {
  updateEmployeeSchema,
  UpdateEmployeeInput,
} from "@/lib/validations/employee.schemas";
import { updateEmployee } from "../services/employees.services";
import { Employee } from "@/types/types";

interface UpdateModalContentProps {
  initialData: Employee;
}

export default function UpdateModalContent({
  initialData,
}: UpdateModalContentProps) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEmployeeInput>({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: {
      name: initialData.name,
      phone: initialData.phone,
      email: initialData.email,
      position: initialData.position,
      shift: initialData.shift,
      isActive:
        initialData.isActive === "TRUE" || initialData.isActive === true,
      salary: initialData.salary ?? 0,
      commissionRate: initialData.commissionRate ?? 0,
    },
  });

  const role = watch("position");

  const onSubmit = async (data: UpdateEmployeeInput) => {
    try {
      await updateEmployee(initialData.id, data);
      toast.success(`تم تحديث بيانات ${initialData.name} بنجاح`);
      closeModal();
      router.refresh();
    } catch (err: any) {
      console.error(err.message || "حدث خطأ أثناء التحديث");
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <p className="text-sm text-gray-500">
          تعديل الحقول الخاصة بالموظف الحالي.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الاسم الكامل <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            {...register("name")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            رقم الهاتف <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            disabled={isSubmitting}
            {...register("phone")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            البريد الإلكتروني <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            disabled={isSubmitting}
            {...register("email")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الوظيفة <span className="text-red-500">*</span>
          </label>
          <select
            disabled={isSubmitting}
            {...register("position")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
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

        {role !== "tailor" && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الراتب الأساسي
            </label>
            <input
              type="number"
              step="0.01"
              disabled={isSubmitting}
              {...register("salary", { valueAsNumber: true })}
              placeholder="0.00"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
            />
            {errors.salary && (
              <p className="mt-1 text-xs text-red-500">
                {errors.salary.message}
              </p>
            )}
          </div>
        )}

        {role === "tailor" && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              نسبة العمولة (%)
            </label>
            <input
              type="number"
              step="0.01"
              disabled={isSubmitting}
              {...register("commissionRate", { valueAsNumber: true })}
              placeholder="مثال: 5.0"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
            />
            {errors.commissionRate && (
              <p className="mt-1 text-xs text-red-500">
                {errors.commissionRate.message}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الدوام <span className="text-red-500">*</span>
          </label>
          <select
            disabled={isSubmitting}
            {...register("shift")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          >
            <option value="morning">صباحي</option>
            <option value="night">مسائي</option>
            <option value="full_time">دوام كامل / مزدوج</option>
          </select>
          {errors.shift && (
            <p className="mt-1 text-xs text-red-500">{errors.shift.message}</p>
          )}
        </div>

        <div className="flex items-center pt-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={isSubmitting}
              {...register("isActive")}
              className="h-4 w-4 rounded border-gray-300 text-(--primary-red) focus:ring-(--primary-red)"
            />
            حساب نشط (Is Active)
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={closeModal}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "جاري التحديث..." : "حفظ التغييرات"}
        </button>
      </div>
    </form>
  );
}

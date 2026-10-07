"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { useModalStore } from "@/store/useModalStore";
import {
  createSupplierSchema,
  CreateSupplierFormInput,
  Supplier,
} from "../schemas/supplier.schemas";
import { createSupplier, updateSupplier } from "../services/supplier.services";

interface SupplierModalContentProps {
  initialData?: Supplier | null;
}

export default function SupplierModalContent({
  initialData,
}: SupplierModalContentProps) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateSupplierFormInput>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      name: initialData?.name || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      address: initialData?.address || "",
      notes: initialData?.notes || "",
      contactPerson: initialData?.contactPerson || "",
      isActive: initialData?.isActive ?? true,
    },
  });

  const onSubmit = async (data: CreateSupplierFormInput) => {
    try {
      if (isEditing && initialData) {
        await updateSupplier(initialData.id, data);
        toast.success(`تم تحديث بيانات ${initialData.name} بنجاح`);
      } else {
        await createSupplier(data);
        toast.success("تمت إضافة المورد بنجاح");
      }

      reset();
      closeModal();
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء حفظ بيانات المورد";

      console.error("Supplier save error:", error);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <p className="text-sm text-gray-500">
          {isEditing
            ? "قم بتعديل بيانات المورد الحالي قبل حفظ التغييرات."
            : "يرجى إدخال بيانات المورد الجديد بدقة."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            اسم المورد <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            {...register("name")}
            placeholder="مثال: شركة النور للإلكترونيات"
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
            placeholder="مثال: 966500000000"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            البريد الإلكتروني
          </label>
          <input
            type="email"
            disabled={isSubmitting}
            {...register("email")}
            placeholder="supplier@example.com"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            جهة الاتصال
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            {...register("contactPerson")}
            placeholder="اسم الشخص المسؤول عن التعامل"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.contactPerson && (
            <p className="mt-1 text-xs text-red-500">
              {errors.contactPerson.message}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            العنوان
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            {...register("address")}
            placeholder="عنوان المورد / المدينة / المنطقة"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.address && (
            <p className="mt-1 text-xs text-red-500">
              {errors.address.message}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            ملاحظات
          </label>

          <textarea
            disabled={isSubmitting}
            {...register("notes")}
            placeholder="أي ملاحظات مهمة عن المورد..."
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />

          {errors.notes && (
            <p className="mt-1 text-xs text-red-500">{errors.notes.message}</p>
          )}
        </div>

        <div className="sm:col-span-2 flex items-center pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              disabled={isSubmitting}
              {...register("isActive")}
              className="h-4 w-4 rounded border-gray-300 text-(--primary-red) focus:ring-(--primary-red)"
            />
            المورد نشط
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
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? isEditing
              ? "جارٍ التحديث..."
              : "جارٍ الحفظ..."
            : isEditing
              ? "حفظ التغييرات"
              : "حفظ المورد"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Image from "next/image";
import { LuUpload, LuLoader, LuImage } from "react-icons/lu";

import {
  categorySchema,
  CategoryInput,
  Category,
} from "@/app/dashboard/categories/schemas/category.schemas";
import {
  createCategory,
  updateCategory,
} from "../services/categories.services";
import { useModalStore } from "@/store/useModalStore";
import { uploadImage } from "@/lib/storage";

interface ModalContentProps {
  categoryToEdit?: Category | null;
  initialData?: Category;
}

export default function ModalContent({
  categoryToEdit,
  initialData,
}: ModalContentProps) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);

  const category = categoryToEdit || initialData;
  const isEditing = Boolean(category);

  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(
    category?.imageUrl || null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name || "",
      description: category?.description || "",
      imageUrl: category?.imageUrl,
    },
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tempUrl = URL.createObjectURL(file);
    setPreviewImage(tempUrl);

    try {
      setIsUploading(true);

      const uploadedUrl = await uploadImage(file, "categories");

      setValue("imageUrl", uploadedUrl, { shouldValidate: true });
      toast.success("تم رفع الصورة بنجاح");
    } catch (err) {
      setPreviewImage(category?.imageUrl || null);
      setValue("imageUrl", category?.imageUrl || null, {
        shouldValidate: true,
      });

      console.error("خطأ رفع الصورة:", err);
      toast.error(
        (err instanceof Error ? err.message : "فشل رفع الصورة") ||
          "فشل رفع الصورة، يُرجى التأكد من صلاحيات Storage RLS وإعادة المحاولة",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit: SubmitHandler<CategoryInput> = async (data) => {
    try {
      const formattedData = {
        ...data,
        description: data.description ?? undefined,
        imageUrl: data.imageUrl ?? undefined,
      };

      if (isEditing && category) {
        await updateCategory(String(category.id), formattedData);
        toast.success(`تم تحديث "${category.name}" بنجاح`);
      } else {
        await createCategory(formattedData);
        toast.success("تمت إضافة الفئة بنجاح");
      }

      reset();
      router.refresh();
      closeModal();
    } catch (err) {
      console.error("فشل في حفظ بيانات الفئة:", err);
      toast.error(
        err instanceof Error ? err.message : "حدث خطأ أثناء حفظ البيانات",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <p className="text-sm text-gray-500">
          {isEditing
            ? `قم بتعديل بيانات الفئة "${category?.name}" والصورة المخصصة لها قبل حفظ التغييرات.`
            : "يرجى ملء بيانات الفئة الجديدة وإرفاق الصورة لتنظيم المنتجات."}
        </p>
      </div>

      <div className="space-y-4">
        {/* رفع الصورة */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            صورة الفئة
          </label>
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
              {previewImage ? (
                <Image
                  src={previewImage}
                  alt="Preview"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover"
                />
              ) : (
                <LuImage className="h-8 w-8 text-gray-400" />
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <LuLoader className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
              <LuUpload className="h-4 w-4" />
              <span>{isUploading ? "جاري الرفع..." : "اختر صورة"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={isUploading || isSubmitting}
                className="hidden"
              />
            </label>
          </div>
          {errors.imageUrl && (
            <p className="mt-1 text-xs text-red-500">
              {errors.imageUrl.message as string}
            </p>
          )}
        </div>

        {/* اسم الصنف */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            اسم الفئة <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            disabled={isSubmitting}
            {...register("name")}
            placeholder="مثال: أقمشة يابانية، أزرار، خيوط"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        {/* الوصف */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الوصف (اختياري)
          </label>
          <textarea
            rows={3}
            disabled={isSubmitting}
            {...register("description")}
            placeholder="اكتب وصفاً قصيراً لمحتويات هذا الصنف..."
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
        <button
          type="submit"
          disabled={isSubmitting || isUploading}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <LuLoader className="h-4 w-4 animate-spin" />
              <span>جاري الحفظ...</span>
            </>
          ) : (
            <span>{isEditing ? "حفظ التعديلات" : "حفظ الفئة"}</span>
          )}
        </button>
      </div>
    </form>
  );
}

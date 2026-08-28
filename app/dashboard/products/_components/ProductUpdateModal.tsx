"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useModalStore } from "@/store/useModalStore";
import {
  updateProductSchema,
  UpdateProductFormInput,
  Product,
  UpdateProductFormOutput,
} from "../schemas/product.schemas";
import React from "react";
import { updateProduct } from "../services/products.services";
import { Category } from "@/types/types";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

interface UpdateProductModalContentProps {
  initialData: Product & {
    category?: Category | null;
    supplier?: Supplier | null;
  };
  categories?: Category[];
  suppliers?: Supplier[];
}

export default function UpdateProductModalContent({
  initialData,
  categories = [],
  suppliers = [],
}: UpdateProductModalContentProps) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);

  // 1. استخراج الـ ID الصحيح (سواء جاء كـ categoryId أو داخل Object الـ category)
  const currentCategoryId =
    initialData.categoryId || initialData.category?.id || "";
  const currentSupplierId =
    initialData.supplierId || initialData.supplier?.id || "";

  // 2. إيجاد الفئة والمورد الحاليين لضمان وجودهما داخل خيارات الـ Select حتى لو لم تكن القائمة الكاملة محملة
  const currentCategory =
    initialData.category || categories?.find((c) => c.id === currentCategoryId);
  const currentSupplier =
    initialData.supplier || suppliers?.find((s) => s.id === currentSupplierId);

  // دمج القائمة الممررة مع العنصر الحالي لمنع اختفائه من الخيارات
  const displayCategories = React.useMemo(() => {
    if (
      currentCategory &&
      !categories.some((c) => c.id === currentCategory.id)
    ) {
      return [currentCategory, ...categories];
    }
    return categories;
  }, [categories, currentCategory]);

  const displaySuppliers = React.useMemo(() => {
    if (
      currentSupplier &&
      !suppliers.some((s) => s.id === currentSupplier.id)
    ) {
      return [currentSupplier, ...suppliers];
    }
    return suppliers;
  }, [suppliers, currentSupplier]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProductFormInput, any, UpdateProductFormOutput>({
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      name: initialData.name,
      images: initialData.images || [],
      sku: initialData.sku || "",
      barcode: initialData.barcode || "",
      purchasePrice: Number(initialData.purchasePrice) || 0,
      sellingPrice: Number(initialData.sellingPrice) || 0,
      minSellingPrice: initialData.minSellingPrice
        ? Number(initialData.minSellingPrice)
        : undefined,
      minStockLevel: Number(initialData.minStockLevel) || 5,
      isActive: initialData.isActive ?? true,
      description: initialData.description || "",
      categoryId: currentCategoryId,
      supplierId: currentSupplierId,
    },
  });

  const onSubmit = async (data: UpdateProductFormInput) => {
    console.log(initialData.category || "ffff");
    try {
      const formattedData = {
        ...data,
        categoryId:
          data.categoryId && data.categoryId.trim() !== ""
            ? data.categoryId
            : null,
        supplierId:
          data.supplierId && data.supplierId.trim() !== ""
            ? data.supplierId
            : null,
      };

      await updateProduct(initialData.id, formattedData as any);
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
          تعديل تفاصيل وأسعار المنتج المحدد. التغييرات في الأسعار تطبق على
          المعاملات الجديدة فقط.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 overflow-y-scroll max-h-[45vh] pe-2">
        {/* اسم المنتج */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            اسم المنتج <span className="text-red-500">*</span>
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

        {/* الفئة */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الفئة / التصنيف
          </label>
          <select
            disabled={isSubmitting}
            {...register("categoryId")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          >
            <option value="">بدون فئة (غير محدد)</option>
            {displayCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="mt-1 text-xs text-red-500">
              {errors.categoryId.message}
            </p>
          )}
        </div>

        {/* المورد */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            المورد المفضل
          </label>
          <select
            disabled={isSubmitting}
            {...register("supplierId")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          >
            <option value="">بدون مورد (غير محدد)</option>
            {displaySuppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="mt-1 text-xs text-red-500">
              {errors.supplierId.message}
            </p>
          )}
        </div>

        {/* سعر التكلفة */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            سعر التكلفة (الشراء) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            disabled={isSubmitting}
            {...register("purchasePrice")}
            placeholder="0.00"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.purchasePrice && (
            <p className="mt-1 text-xs text-red-500">
              {errors.purchasePrice.message}
            </p>
          )}
        </div>

        {/* سعر البيع الافتراضي */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            سعر البيع الافتراضي <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            disabled={isSubmitting}
            {...register("sellingPrice")}
            placeholder="0.00"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.sellingPrice && (
            <p className="mt-1 text-xs text-red-500">
              {errors.sellingPrice.message}
            </p>
          )}
        </div>

        {/* أدنى سعر بيع مسموح */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            أدنى سعر بيع مسموح
          </label>
          <input
            type="number"
            step="0.01"
            disabled={isSubmitting}
            {...register("minSellingPrice")}
            placeholder="0.00"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.minSellingPrice && (
            <p className="mt-1 text-xs text-red-500">
              {errors.minSellingPrice.message}
            </p>
          )}
        </div>

        {/* حد إعادة الطلب */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            حد إشعار النفاذ (حد إعادة الطلب)
          </label>
          <input
            type="number"
            disabled={isSubmitting}
            {...register("minStockLevel")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
          />
          {errors.minStockLevel && (
            <p className="mt-1 text-xs text-red-500">
              {errors.minStockLevel.message}
            </p>
          )}
        </div>

        {/* الوصف */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            الوصف
          </label>
          <textarea
            rows={2}
            disabled={isSubmitting}
            {...register("description")}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60 resize-none"
          />
        </div>

        {/* حالة النشاط */}
        <div className="flex items-center pt-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={isSubmitting}
              {...register("isActive")}
              className="h-4 w-4 rounded border-gray-300 text-(--primary-red) focus:ring-(--primary-red)"
            />
            المنتج نشط ومتاح في عمليات البيع (Is Active)
          </label>
        </div>
      </div>

      {/* أزرار الإجراءات */}
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

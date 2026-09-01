"use client";

import React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LuArrowRight, LuPlus, LuTrash2 } from "react-icons/lu";
import Link from "next/link";

import {
  updateProductSchema,
  UpdateProductFormInput,
  UpdateProductFormOutput,
  Product,
} from "../schemas/product.schemas";
import { updateProduct } from "../services/products.services";
import { Category } from "@/types/types";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

interface EditProductFormProps {
  initialData: Product & {
    category?: Category | null;
    supplier?: Supplier | null;
  };
  categories?: Category[];
  suppliers?: Supplier[];
}

export default function EditProductForm({
  initialData,
  categories = [],
  suppliers = [],
}: EditProductFormProps) {
  const router = useRouter();

  const currentCategoryId =
    initialData.categoryId || initialData.category?.id || "";
  const currentSupplierId =
    initialData.supplierId || initialData.supplier?.id || "";

  // إعداد القيم الافتراضية للـ Variants
  const defaultVariants = initialData.variants?.length
    ? initialData.variants.map((v) => ({
        id: v.id,
        sku: v.sku || "",
        barcode: v.barcode || "",
        purchasePrice: Number(v.purchasePrice) || 0,
        sellingPrice: Number(v.sellingPrice) || 0,
        minSellingPrice: v.minSellingPrice
          ? Number(v.minSellingPrice)
          : undefined,
        stockQuantity: Number(v.stockQuantity) || 0,
        minStockLevel: Number(v.minStockLevel) || 5,
        isDefault: v.isDefault ?? false,
        isActive: v.isActive ?? true,
      }))
    : [
        {
          sku: "",
          barcode: "",
          purchasePrice: 0,
          sellingPrice: 0,
          minSellingPrice: undefined,
          stockQuantity: 0,
          minStockLevel: 5,
          isDefault: true,
          isActive: true,
        },
      ];

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProductFormInput, any, UpdateProductFormOutput>({
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      name: initialData.name,
      description: initialData.description || "",
      categoryId: currentCategoryId,
      supplierId: currentSupplierId,
      sellingUnit: initialData.sellingUnit || "متر",
      purchaseUnit: initialData.purchaseUnit || "طاقة",
      hasVariants: initialData.hasVariants ?? false,
      isActive: initialData.isActive ?? true,
      isVisible: initialData.isVisible ?? true,
      variants: defaultVariants,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  const hasVariants = watch("hasVariants");

  const onSubmit = async (data: UpdateProductFormInput) => {
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
      toast.success(`تم تحديث ${data.name} بنجاح`);
      router.push("/dashboard/products");
      router.refresh();
    } catch (err: any) {
      console.error(err.message || "حدث خطأ أثناء التحديث");
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
      {/* البيانات الأساسية */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-800">البيانات الأساسية</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              اسم المنتج <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              {...register("name")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الفئة / التصنيف
            </label>
            <select
              disabled={isSubmitting}
              {...register("categoryId")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none"
            >
              <option value="">بدون فئة (غير محدد)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              المورد المفضل
            </label>
            <select
              disabled={isSubmitting}
              {...register("supplierId")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none"
            >
              <option value="">بدون مورد (غير محدد)</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              وحدة البيع
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              {...register("sellingUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              وحدة الشراء
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              {...register("purchaseUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الوصف
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting}
              {...register("description")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none resize-none"
            />
          </div>
        </div>
      </div>

      {/* خيارات المتغيرات والأسعار */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              الأسعار والمتغيرات (Variants)
            </h2>
            <p className="text-xs text-gray-500">
              إدارة أسعار الشراء والبيع والمخزون للمنتج
            </p>
          </div>
          {hasVariants && (
            <button
              type="button"
              onClick={() =>
                append({
                  sku: "",
                  barcode: "",
                  purchasePrice: 0,
                  sellingPrice: 0,
                  minSellingPrice: undefined,
                  stockQuantity: 0,
                  minStockLevel: 5,
                  isDefault: false,
                  isActive: true,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition"
            >
              <LuPlus className="h-4 w-4" /> إضافة متغيّر جديد
            </button>
          )}
        </div>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="relative rounded-xl border border-gray-200 p-4 bg-gray-50/50 space-y-3"
            >
              {hasVariants && fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="absolute top-3 left-3 text-red-500 hover:text-red-700 p-1 rounded-lg transition"
                >
                  <LuTrash2 className="h-4 w-4" />
                </button>
              )}

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    سعر الشراء (التكلفة) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.purchasePrice`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                  {errors.variants?.[index]?.purchasePrice && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.variants[index]?.purchasePrice?.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    سعر البيع الافتراضي <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.sellingPrice`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                  {errors.variants?.[index]?.sellingPrice && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.variants[index]?.sellingPrice?.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    أدنى سعر بيع
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.minSellingPrice`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    حد إعادة الطلب
                  </label>
                  <input
                    type="number"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.minStockLevel`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    رمز المنتج (SKU)
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.sku`)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    الباركود
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    {...register(`variants.${index}.barcode`)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition"
        >
          <LuArrowRight className="h-4 w-4" /> العودة إلى المنتجات
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-(--primary-red) px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? "جاري حفظ التغييرات..." : "حفظ التغييرات"}
          </button>
        </div>
      </div>
    </form>
  );
}

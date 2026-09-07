"use client";

import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  LuArrowRight,
  LuPlus,
  LuTrash2,
  LuImage,
  LuLock,
  LuX,
  LuLoader,
} from "react-icons/lu";
import Link from "next/link";
import Image from "next/image";

import {
  updateProductSchema,
  UpdateProductFormInput,
  UpdateProductFormOutput,
  Product,
} from "../schemas/product.schemas";
import { updateProduct } from "../services/products.services";
import { uploadImage } from "@/lib/storage";
import { Category } from "@/types/types";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

// خيارات وحدات القياس المتاحة
const MEASUREMENT_UNITS = [
  "قطعة",
  "متر",
  "طاقة",
  "كيلو جرام",
  "جرام",
  "علبة",
  "كرتونة",
  "طقم",
  "درزن",
];

interface EditProductFormProps {
  initialData: Product & {
    categoryId?: string | null;
    supplierId?: string | null;
    hasStockMovement?: boolean;
    images?: string[];
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
  const hasStockMovement = Boolean(initialData.hasStockMovement);

  // حالة التحكم بأداء التحميل أثناء رفع الصور
  const [uploadingImages, setUploadingImages] = useState(false);

  // إدارة صور المنتج الرئيسي
  const [productImages, setProductImages] = useState<string[]>(
    initialData.images || [],
  );

  const currentCategoryId =
    initialData.categoryId || initialData.category?.id || "";
  const currentSupplierId =
    initialData.supplierId || initialData.supplier?.id || "";

  const defaultVariants = initialData.variants?.length
    ? initialData.variants.map((v: any) => ({
        id: v.id,
        sku: v.sku || "",
        barcode: v.barcode || "",
        colorName: v.colorName || v.attributes?.colorName || "",
        colorCode: v.colorCode || v.attributes?.colorCode || "#000000",
        size: v.size || v.attributes?.size || "",
        images: v.images || [],
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
          color: "",
          size: "",
          images: [],
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
    setValue,
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
  const watchVariants = watch("variants") || [];

  // رفع وإضافة صور للمنتج الرئيسي عبر API Route والمخزن
  const handleAddProductImages = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        Array.from(filesList).map((file) => uploadImage(file, "products")),
      );

      setProductImages((prev) => [...prev, ...uploadedUrls].slice(0, 5));
      toast.success("تم رفع صور المنتج بنجاح!");
    } catch (error: any) {
      toast.error(error?.message || "حدث خطأ أثناء رفع الصور");
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  // حذف صورة للمنتج الرئيسي
  const handleRemoveProductImage = (indexToRemove: number) => {
    setProductImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // رفع وإضافة صور لمتغير معُين
  const handleAddVariantImages = async (
    variantIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        Array.from(filesList).map((file) => uploadImage(file, "products")),
      );

      const currentImages = watchVariants[variantIndex]?.images || [];
      setValue(
        `variants.${variantIndex}.images`,
        [...currentImages, ...uploadedUrls].slice(0, 5),
        { shouldValidate: true },
      );
      toast.success("تم رفع صور المتغير بنجاح!");
    } catch (error: any) {
      toast.error(error?.message || "حدث خطأ أثناء رفع صور المتغير");
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  // حذف صورة لمتغير معُين
  const handleRemoveVariantImage = (
    variantIndex: number,
    imageIndex: number,
  ) => {
    const currentImages = watchVariants[variantIndex]?.images || [];
    const updated = currentImages.filter((_, idx) => idx !== imageIndex);
    setValue(`variants.${variantIndex}.images`, updated, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: UpdateProductFormInput) => {
    try {
      const formattedData = {
        ...data,
        images: productImages,
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

      router.refresh();
      router.push("/dashboard/products");
    } catch (err: any) {
      console.error(err.message || "حدث خطأ أثناء التحديث");
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
      {/* التنبيه عند وجود حركة مخزنية */}
      {hasStockMovement && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-4 text-amber-800 border border-amber-200 text-sm">
          <LuLock className="h-5 w-5 shrink-0" />
          <span>
            هذا المنتج تمت عليه حركات مخزنية أو محاسبية سابقة. تم قفل بعض الحقول
            (مثل وحدات القياس، الـ SKU، والباركود) لحماية دقة سجلات الحسابات
            والجرد.
          </span>
        </div>
      )}

      {/* قسم صور المنتج الرئيسي */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-bold text-gray-800">صور المنتج الرئيسي</h2>
        <div className="flex flex-wrap items-center gap-4">
          {productImages.map((imgUrl, index) => (
            <div
              key={index}
              className="relative h-24 w-24 rounded-xl border border-gray-200 overflow-hidden group"
            >
              <Image
                src={imgUrl}
                alt="Product Image"
                fill
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveProductImage(index)}
                className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
              >
                <LuX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition">
            {uploadingImages ? (
              <LuLoader className="h-6 w-6 text-gray-400 animate-spin" />
            ) : (
              <>
                <LuImage className="h-6 w-6 text-gray-400" />
                <span className="mt-1 text-xs text-gray-500">إضافة صورة</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddProductImages}
              disabled={isSubmitting || uploadingImages}
            />
          </label>
        </div>
      </div>

      {/* البيانات الأساسية */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-bold text-gray-800">البيانات الأساسية</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              اسم المنتج <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              disabled={isSubmitting || uploadingImages}
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
              disabled={isSubmitting || uploadingImages}
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
            {errors.categoryId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              المورد المفضل
            </label>
            <select
              disabled={isSubmitting || uploadingImages}
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
            {errors.supplierId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.supplierId.message}
              </p>
            )}
          </div>

          {/* وحدة البيع كـ Select مقفولة عند وجود حركة */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-gray-700">
              <span>وحدة البيع</span>
              {hasStockMovement && (
                <span className="text-xs font-normal text-amber-600 flex items-center gap-1">
                  <LuLock className="h-3 w-3" /> للقراءة فقط
                </span>
              )}
            </label>
            <select
              disabled={isSubmitting || uploadingImages || hasStockMovement}
              {...register("sellingUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            >
              {MEASUREMENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          {/* وحدة الشراء كـ Select مقفولة عند وجود حركة */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-gray-700">
              <span>وحدة الشراء</span>
              {hasStockMovement && (
                <span className="text-xs font-normal text-amber-600 flex items-center gap-1">
                  <LuLock className="h-3 w-3" /> للقراءة فقط
                </span>
              )}
            </label>
            <select
              disabled={isSubmitting || uploadingImages || hasStockMovement}
              {...register("purchaseUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            >
              {MEASUREMENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الوصف
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting || uploadingImages}
              {...register("description")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none resize-none"
            />
          </div>
        </div>
      </div>

      {/* خيارات المتغيرات والأسعار */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              الأسعار والمتغيرات (Variants)
            </h2>
            <p className="text-xs text-gray-500">
              إدارة أسعار الشراء والبيع والمخزون والخصائص للمنتج
            </p>
          </div>
          {hasVariants && (
            <button
              type="button"
              disabled={isSubmitting || uploadingImages}
              onClick={() =>
                append({
                  sku: "",
                  barcode: "",
                  colorName: "",
                  colorCode: "#000000",
                  size: "",
                  images: [],
                  purchasePrice: 0,
                  sellingPrice: 0,
                  minSellingPrice: undefined,
                  stockQuantity: 0,
                  minStockLevel: 5,
                  isDefault: false,
                  isActive: true,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
            >
              <LuPlus className="h-4 w-4" /> إضافة متغيّر جديد
            </button>
          )}
        </div>

        <div className="space-y-6">
          {fields.map((field, index) => {
            const variantImages = watchVariants[index]?.images || [];
            const currentColorCode =
              watchVariants[index]?.colorCode || "#000000";

            return (
              <div
                key={field.id}
                className="relative rounded-xl border border-gray-200 p-4 bg-gray-50/50 space-y-4"
              >
                {hasVariants && fields.length > 1 && (
                  <button
                    type="button"
                    disabled={isSubmitting || uploadingImages}
                    onClick={() => remove(index)}
                    className="absolute top-3 left-3 text-red-500 hover:text-red-700 p-1 rounded-lg transition disabled:opacity-50"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                )}

                {/* خصائص المتغير: اللون والمقاس */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      كود / درجة اللون
                    </label>
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 transition focus-within:border-(--primary-red) focus-within:ring-2 focus-within:ring-(--primary-red)/10">
                      <input
                        type="color"
                        aria-label="اختيار درجة اللون"
                        disabled={isSubmitting || uploadingImages}
                        {...register(`variants.${index}.colorCode` as any)}
                        className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-left font-mono text-xs font-semibold uppercase text-gray-600"
                        dir="ltr"
                      >
                        {currentColorCode}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      اللون
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: أحمر، أزرق"
                      disabled={isSubmitting || uploadingImages}
                      {...register(`variants.${index}.colorName` as any)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      المقاس
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: XL, 42, 3 متر"
                      disabled={isSubmitting || uploadingImages}
                      {...register(`variants.${index}.size` as any)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                    />
                  </div>
                </div>

                {/* الأسعار والأكواد */}
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      سعر الشراء <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={isSubmitting || uploadingImages}
                      {...register(`variants.${index}.purchasePrice`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      سعر البيع <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={isSubmitting || uploadingImages}
                      {...register(`variants.${index}.sellingPrice`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      أدنى سعر بيع
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={isSubmitting || uploadingImages}
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
                      disabled={isSubmitting || uploadingImages}
                      {...register(`variants.${index}.minStockLevel`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-600">
                      <span>SKU</span>
                      {hasStockMovement && (
                        <LuLock className="h-3 w-3 text-amber-600" />
                      )}
                    </label>
                    <input
                      type="text"
                      disabled={
                        isSubmitting || uploadingImages || hasStockMovement
                      }
                      {...register(`variants.${index}.sku`)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-600">
                      <span>الباركود</span>
                      {hasStockMovement && (
                        <LuLock className="h-3 w-3 text-amber-600" />
                      )}
                    </label>
                    <input
                      type="text"
                      disabled={
                        isSubmitting || uploadingImages || hasStockMovement
                      }
                      {...register(`variants.${index}.barcode`)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-(--primary-red) focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                </div>

                {/* صور المتغيّر */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    صور هذا المتغيّر
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {variantImages.map((vImg: string, imgIdx: number) => (
                      <div
                        key={imgIdx}
                        className="relative h-16 w-16 rounded-lg border border-gray-200 overflow-hidden group"
                      >
                        <Image
                          src={vImg}
                          alt="Variant Image"
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          disabled={isSubmitting || uploadingImages}
                          onClick={() =>
                            handleRemoveVariantImage(index, imgIdx)
                          }
                          className="absolute top-0.5 right-0.5 bg-red-600 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                        >
                          <LuX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white hover:bg-gray-50 transition">
                      {uploadingImages ? (
                        <LuLoader className="h-4 w-4 text-gray-400 animate-spin" />
                      ) : (
                        <>
                          <LuImage className="h-4 w-4 text-gray-400" />
                          <span className="text-[10px] text-gray-500">
                            إضافة
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleAddVariantImages(index, e)}
                        disabled={isSubmitting || uploadingImages}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
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
            disabled={isSubmitting || uploadingImages}
            className="rounded-xl bg-(--primary-red) px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
          >
            {(isSubmitting || uploadingImages) && (
              <LuLoader className="h-4 w-4 animate-spin" />
            )}
            {uploadingImages
              ? "جاري رفع الصور..."
              : isSubmitting
                ? "جاري حفظ التغييرات..."
                : "حفظ التغييرات"}
          </button>
        </div>
      </div>
    </form>
  );
}

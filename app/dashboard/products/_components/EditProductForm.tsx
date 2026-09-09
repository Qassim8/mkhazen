"use client";

import { ChangeEvent, useState } from "react";

import { useFieldArray, useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { useRouter } from "next/navigation";

import Link from "next/link";
import Image from "next/image";

import toast from "react-hot-toast";

import {
  LuArrowRight,
  LuCheck,
  LuImage,
  LuLoader,
  LuLock,
  LuPlus,
  LuTrash2,
  LuX,
} from "react-icons/lu";

import {
  updateProductSchema,
  UpdateProductInput,
  Product,
} from "../schemas/product.schemas";

import { updateProduct } from "../services/products.services";

import { uploadImage } from "@/lib/storage";

import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

/* =========================================================
   Units
========================================================= */

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

/* =========================================================
   Types
========================================================= */

interface ProductWithRelations extends Product {
  category?: {
    id: string;
    name: string;
  } | null;

  supplier?: {
    id: string;
    name: string;
  } | null;
}

interface EditProductFormProps {
  initialData: ProductWithRelations;
  categories?: Category[];
  suppliers?: Supplier[];
}

/* =========================================================
   Helpers
========================================================= */

const isNumberOrUndefined = (value: string) => {
  if (value === "") {
    return undefined;
  }

  const number = Number(value);

  return Number.isNaN(number) ? undefined : number;
};

/* =========================================================
   Component
========================================================= */

export default function EditProductForm({
  initialData,
  categories = [],
  suppliers = [],
}: EditProductFormProps) {
  const router = useRouter();

  const [uploadingImages, setUploadingImages] = useState(false);

  /* =======================================================
     Main product images
  ======================================================= */

  const [productImages, setProductImages] = useState<string[]>(
    (initialData.images ?? []).slice(0, 4),
  );

  /* =======================================================
     Relations
  ======================================================= */

  const currentCategoryId = initialData.categoryId ?? "";

  const currentSupplierId = initialData.supplierId ?? "";

  /* =======================================================
     Initial variants

     IMPORTANT:
     stockQuantity is intentionally NOT included
     because it is not a form field.
  ======================================================= */

  const defaultVariants =
    initialData.variants?.length > 0
      ? initialData.variants.map((variant) => ({
          id: variant.id,

          sku: variant.sku ?? "",

          barcode: variant.barcode ?? "",

          packBarcode: variant.packBarcode ?? "",

          colorName: variant.colorName ?? "",

          colorCode: variant.colorCode ?? "#000000",

          size: variant.size ?? "",

          length: variant.length ?? undefined,

          width: variant.width ?? undefined,

          purchasePrice: Number(variant.purchasePrice ?? 0),

          sellingPrice: Number(variant.sellingPrice ?? 0),

          minSellingPrice:
            variant.minSellingPrice !== null &&
            variant.minSellingPrice !== undefined
              ? Number(variant.minSellingPrice)
              : undefined,

          minStockLevel: Number(variant.minStockLevel ?? 5),

          images: variant.images ?? [],

          isDefault: Boolean(variant.isDefault),

          isActive: Boolean(variant.isActive),
        }))
      : [
          {
            id: undefined,

            sku: "",

            barcode: "",

            packBarcode: "",

            colorName: "",

            colorCode: "#000000",

            size: "",

            length: undefined,

            width: undefined,

            purchasePrice: 0,

            sellingPrice: 0,

            minSellingPrice: undefined,

            minStockLevel: 5,

            images: [],

            isDefault: true,

            isActive: true,
          },
        ];

  /* =======================================================
     Form
  ======================================================= */

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,

    formState: { errors, isSubmitting },
  } = useForm<UpdateProductInput>({
    resolver: zodResolver(updateProductSchema),

    defaultValues: {
      name: initialData.name,

      description: initialData.description ?? "",

      categoryId: currentCategoryId,

      supplierId: currentSupplierId,

      purchaseUnit: initialData.purchaseUnit ?? "طاقة",

      sellingUnit: initialData.sellingUnit ?? "متر",

      conversionFactor: Number(initialData.conversionFactor ?? 1),

      images: productImages,

      isActive: initialData.isActive ?? true,

      isVisible: initialData.isVisible ?? true,

      variants: defaultVariants,
    },
  });

  const { fields, append, replace } = useFieldArray({
    control,
    name: "variants",
  });

  const watchVariants = watch("variants") ?? [];

  const purchaseUnit = watch("purchaseUnit");

  const sellingUnit = watch("sellingUnit");

  const conversionFactor = watch("conversionFactor");

  /*
   * Derived.
   *
   * 1 variant = simple product
   * 2+ variants = multi variant product
   */
  const isMultiVariant = watchVariants.length > 1;

  /* =======================================================
     Category
  ======================================================= */

  const selectedCategory = categories.find(
    (category) => category.id === currentCategoryId,
  );

  const categoryName = selectedCategory?.name?.toLowerCase() ?? "";

  /*
   * Physical dimensions make sense for garments.
   * Do NOT treat fabric as a dimension-based product
   * just because its purchase unit differs from selling unit.
   */
  const isGarmentCategory =
    categoryName.includes("جلاليب") ||
    categoryName.includes("جلابيه") ||
    categoryName.includes("جلابية") ||
    categoryName.includes("ثوب");

  /* =======================================================
     Main product images
  ======================================================= */

  const handleAddProductImages = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    try {
      setUploadingImages(true);

      const remainingSlots = Math.max(0, 4 - productImages.length);

      if (remainingSlots === 0) {
        toast.error("يمكن إضافة 4 صور كحد أقصى");
        return;
      }

      const filesToUpload = Array.from(files).slice(0, remainingSlots);

      const uploadedUrls = await Promise.all(
        filesToUpload.map((file) => uploadImage(file, "products")),
      );

      setProductImages((previous) =>
        [...previous, ...uploadedUrls].slice(0, 4),
      );

      toast.success("تم رفع صور المنتج بنجاح");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصور";

      toast.error(message);
    } finally {
      setUploadingImages(false);

      event.target.value = "";
    }
  };

  const handleRemoveProductImage = (index: number) => {
    setProductImages((previous) =>
      previous.filter((_, imageIndex) => imageIndex !== index),
    );
  };

  /* =======================================================
     Variant images
  ======================================================= */

  const handleAddVariantImages = async (
    variantIndex: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    try {
      setUploadingImages(true);

      const currentImages = watchVariants[variantIndex]?.images ?? [];

      const remainingSlots = Math.max(0, 4 - currentImages.length);

      if (remainingSlots === 0) {
        toast.error("يمكن إضافة 4 صور كحد أقصى للمتغير");
        return;
      }

      const filesToUpload = Array.from(files).slice(0, remainingSlots);

      const uploadedUrls = await Promise.all(
        filesToUpload.map((file) => uploadImage(file, "products")),
      );

      setValue(
        `variants.${variantIndex}.images`,
        [...currentImages, ...uploadedUrls].slice(0, 4),
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );

      toast.success("تم رفع صور المتغير بنجاح");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء رفع صور المتغير";

      toast.error(message);
    } finally {
      setUploadingImages(false);

      event.target.value = "";
    }
  };

  const handleRemoveVariantImage = (
    variantIndex: number,
    imageIndex: number,
  ) => {
    const currentImages = watchVariants[variantIndex]?.images ?? [];

    const updatedImages = currentImages.filter(
      (_, index) => index !== imageIndex,
    );

    setValue(`variants.${variantIndex}.images`, updatedImages, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  /* =======================================================
     Variants
  ======================================================= */

  const createEmptyVariant = () => ({
    id: undefined,

    sku: "",

    barcode: "",

    packBarcode: "",

    colorName: "",

    colorCode: "#000000",

    size: "",

    length: undefined,

    width: undefined,

    purchasePrice: 0,

    sellingPrice: 0,

    minSellingPrice: undefined,

    minStockLevel: 5,

    images: [],

    isDefault: false,

    isActive: true,
  });

  const handleAddVariant = () => {
    append(createEmptyVariant());
  };

  const handleRemoveVariant = (index: number) => {
    const nextVariants = watchVariants.filter(
      (_, variantIndex) => variantIndex !== index,
    );

    /*
     * Never allow the product to have
     * zero variants.
     */
    if (nextVariants.length === 0) {
      toast.error("يجب أن يحتوي المنتج على Variant واحد على الأقل");

      return;
    }

    /*
     * If only one remains,
     * it must be the default variant.
     */
    if (nextVariants.length === 1) {
      nextVariants[0] = {
        ...nextVariants[0],
        isDefault: true,
      };
    }

    /*
     * If several remain but no default exists,
     * make the first one default.
     */
    if (
      nextVariants.length > 1 &&
      !nextVariants.some((variant) => variant.isDefault)
    ) {
      nextVariants[0] = {
        ...nextVariants[0],
        isDefault: true,
      };
    }

    replace(nextVariants);
  };

  const handleSetDefaultVariant = (selectedIndex: number) => {
    const nextVariants = watchVariants.map((variant, index) => ({
      ...variant,
      isDefault: index === selectedIndex,
    }));

    replace(nextVariants);
  };

  /* =======================================================
     Submit
  ======================================================= */

  const onSubmit = async (data: UpdateProductInput) => {
    try {
      /*
       * Ensure the image state is part
       * of the submitted payload.
       */
      const formattedData: UpdateProductInput = {
        ...data,

        images: productImages,

        categoryId: data.categoryId || null,

        supplierId: data.supplierId || null,

        conversionFactor: Number(data.conversionFactor ?? 1),

        variants: data.variants?.map((variant) => ({
          ...variant,

          /*
           * stockQuantity intentionally
           * does not exist here.
           */
          minStockLevel: Number(variant.minStockLevel ?? 5),
        })),
      };

      await updateProduct(initialData.id, formattedData);

      toast.success(`تم تحديث ${data.name} بنجاح`);

      router.push("/dashboard/products");

      router.refresh();
    } catch (error: unknown) {
      console.error("Update product error:", error);

      const message =
        error instanceof Error ? error.message : "حدث خطأ أثناء التحديث";

      toast.error(message);
    }
  };

  /* =======================================================
     Disabled state
  ======================================================= */

  const isDisabled = isSubmitting || uploadingImages;

  /* =======================================================
     Render
  ======================================================= */

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
      {/* ===================================================
          Main Images
      =================================================== */}
      <Link
        href="/dashboard/products"
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900"
      >
        <LuArrowRight className="h-4 w-4" />
        العودة إلى المنتجات
      </Link>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">صور المنتج</h2>

          <p className="mt-1 text-xs text-gray-400">
            يمكنك إضافة حتى 4 صور للمنتج.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          {productImages.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className="group relative h-24 w-24 overflow-hidden rounded-xl border border-gray-200"
            >
              <Image
                src={image}
                alt={`${initialData.name} ${index + 1}`}
                fill
                sizes="96px"
                className="object-cover"
              />

              <button
                type="button"
                onClick={() => handleRemoveProductImage(index)}
                disabled={isDisabled}
                aria-label="حذف الصورة"
                className="absolute right-1 top-1 rounded-full bg-red-600 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                <LuX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {productImages.length < 4 && (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:bg-gray-100">
              {uploadingImages ? (
                <LuLoader className="h-6 w-6 animate-spin text-gray-400" />
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
                disabled={isDisabled}
                onChange={handleAddProductImages}
              />
            </label>
          )}
        </div>
      </section>

      {/* ===================================================
          Basic Information
      =================================================== */}

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">البيانات الأساسية</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Name */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              اسم المنتج <span className="text-red-500">*</span>
            </label>

            <input
              type="text"
              disabled={isDisabled}
              {...register("name")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            />

            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الفئة
            </label>

            <select
              disabled={isDisabled}
              {...register("categoryId")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            >
              <option value="">بدون فئة</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {errors.categoryId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          {/* Preferred supplier */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              المورد المفضل
            </label>

            <select
              disabled={isDisabled}
              {...register("supplierId")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            >
              <option value="">بدون مورد</option>

              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            {errors.supplierId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.supplierId.message}
              </p>
            )}
          </div>

          {/* Purchase Unit */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              وحدة الشراء
            </label>

            <select
              disabled={isDisabled}
              {...register("purchaseUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            >
              {MEASUREMENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          {/* Selling Unit */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              وحدة البيع
            </label>

            <select
              disabled={isDisabled}
              {...register("sellingUnit")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            >
              {MEASUREMENT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          {/* Conversion */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-gray-700">
              <span>معامل التحويل</span>

              {purchaseUnit === sellingUnit && (
                <span className="text-[10px] font-normal text-gray-400">
                  الوحدتان متطابقتان
                </span>
              )}
            </label>

            <input
              type="number"
              min="0.0001"
              step="any"
              disabled={isDisabled || purchaseUnit === sellingUnit}
              {...register("conversionFactor", {
                valueAsNumber: true,
              })}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-500 focus:border-(--primary-red) focus:bg-white"
            />

            <p className="mt-1 text-[10px] text-gray-400">
              {purchaseUnit === sellingUnit
                ? "يجب أن يكون المعامل 1"
                : `1 ${purchaseUnit} = ${conversionFactor || "?"} ${sellingUnit}`}
            </p>

            {errors.conversionFactor && (
              <p className="mt-1 text-xs text-red-500">
                {errors.conversionFactor.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              الوصف
            </label>

            <textarea
              rows={4}
              disabled={isDisabled}
              {...register("description")}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-(--primary-red) focus:bg-white"
            />
          </div>
        </div>
      </section>

      {/* ===================================================
          Product status
      =================================================== */}

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">حالة المنتج</h2>

          <p className="mt-1 text-xs text-gray-400">
            التحكم في نشاط المنتج وظهوره.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Active */}
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-bold text-gray-800">المنتج نشط</p>

              <p className="mt-1 text-[11px] text-gray-400">
                يسمح للنظام بالتعامل مع المنتج.
              </p>
            </div>

            <input
              type="checkbox"
              disabled={isDisabled}
              {...register("isActive")}
              className="h-4 w-4 accent-(--primary-red)"
            />
          </label>

          {/* Visible */}
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-bold text-gray-800">ظاهر في المتجر</p>

              <p className="mt-1 text-[11px] text-gray-400">
                التحكم في ظهور المنتج للعملاء.
              </p>
            </div>

            <input
              type="checkbox"
              disabled={isDisabled}
              {...register("isVisible")}
              className="h-4 w-4 accent-(--primary-red)"
            />
          </label>
        </div>
      </section>

      {/* ===================================================
          Variants
      =================================================== */}

      <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">
                {isMultiVariant ? "خيارات المنتج" : "بيانات المنتج"}
              </h2>

              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500">
                {isMultiVariant
                  ? `${watchVariants.length} خيارات`
                  : "منتج مفرد"}
              </span>
            </div>

            <p className="mt-1 text-xs text-gray-500">
              {isMultiVariant
                ? "كل خيار له سعر ومخزون وأكواد وصور مستقلة."
                : "بيانات المنتج مخزنة داخل الـVariant الوحيد."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddVariant}
            disabled={isDisabled}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
          >
            <LuPlus className="h-4 w-4" />
            إضافة خيار
          </button>
        </div>

        {/* Errors */}
        {errors.variants && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
            {typeof errors.variants.message === "string"
              ? errors.variants.message
              : "تحقق من بيانات الخيارات."}
          </p>
        )}

        {/* Variants */}
        <div className="space-y-6">
          {fields.map((field, index) => {
            const variant = watchVariants[index];

            const variantImages = variant?.images ?? [];

            const stock = Number(
              initialData.variants?.find((item) => item.id === variant?.id)
                ?.stockQuantity ?? 0,
            );

            const currentColorCode = variant?.colorCode || "#000000";

            const isDefault = Boolean(variant?.isDefault);

            return (
              <div
                key={field.id}
                className="space-y-5 rounded-2xl border border-gray-200 bg-gray-50/50 p-4"
              >
                {/* Variant header */}
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                      خيار #{index + 1}
                    </span>

                    <p className="mt-1 text-sm font-bold text-gray-800">
                      {isDefault ? "الخيار الافتراضي" : "خيار المنتج"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isMultiVariant && (
                      <button
                        type="button"
                        disabled={isDisabled || isDefault}
                        onClick={() => handleSetDefaultVariant(index)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${
                          isDefault
                            ? "bg-red-50 text-red-600"
                            : "bg-white text-gray-500 hover:bg-gray-100"
                        } disabled:opacity-50`}
                      >
                        <LuCheck className="h-3.5 w-3.5" />

                        {isDefault ? "افتراضي" : "تعيين كافتراضي"}
                      </button>
                    )}

                    {isMultiVariant && (
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleRemoveVariant(index)}
                        aria-label="حذف الخيار"
                        title="حذف الخيار"
                        className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        <LuTrash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Basic attributes */}
                {isMultiVariant && (
                  <>
                    {/* Color + Size */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {/* Color code */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          لون المنتج
                        </label>

                        <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2">
                          <input
                            type="color"
                            value={currentColorCode}
                            onChange={(event) =>
                              setValue(
                                `variants.${index}.colorCode`,
                                event.target.value,
                                {
                                  shouldDirty: true,
                                },
                              )
                            }
                            disabled={isDisabled}
                            className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0"
                          />

                          <span
                            className="truncate font-mono text-xs font-semibold uppercase text-gray-600"
                            dir="ltr"
                          >
                            {currentColorCode}
                          </span>
                        </div>
                      </div>

                      {/* Color name */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          اسم اللون
                        </label>

                        <input
                          type="text"
                          placeholder="مثال: أحمر"
                          disabled={isDisabled}
                          {...register(`variants.${index}.colorName`)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                        />
                      </div>

                      {/* Size */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">
                          المقاس
                        </label>

                        <input
                          type="text"
                          placeholder="مثال: XL أو 42"
                          disabled={isDisabled}
                          {...register(`variants.${index}.size`)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                        />
                      </div>
                    </div>

                    {/* Garment dimensions */}
                    {isGarmentCategory && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">
                            الطول
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={isDisabled}
                            {...register(`variants.${index}.length`, {
                              setValueAs: isNumberOrUndefined,
                            })}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">
                            العرض
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={isDisabled}
                            {...register(`variants.${index}.width`, {
                              setValueAs: isNumberOrUndefined,
                            })}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Garment dimensions */}
                {isGarmentCategory && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        الطول
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isDisabled}
                        {...register(`variants.${index}.length`, {
                          setValueAs: isNumberOrUndefined,
                        })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        العرض
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isDisabled}
                        {...register(`variants.${index}.width`, {
                          setValueAs: isNumberOrUndefined,
                        })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                      />
                    </div>
                  </div>
                )}

                {/* Prices + inventory */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Purchase price */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      سعر الشراء <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isDisabled}
                      {...register(`variants.${index}.purchasePrice`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                    />

                    {errors.variants?.[index]?.purchasePrice && (
                      <p className="mt-1 text-[10px] text-red-500">
                        {errors.variants[index]?.purchasePrice?.message}
                      </p>
                    )}
                  </div>

                  {/* Selling price */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      سعر البيع <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isDisabled}
                      {...register(`variants.${index}.sellingPrice`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                    />
                  </div>

                  {/* Minimum selling price */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      أدنى سعر بيع
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isDisabled}
                      {...register(`variants.${index}.minSellingPrice`, {
                        setValueAs: isNumberOrUndefined,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                    />
                  </div>

                  {/* Minimum stock */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      حد إعادة الطلب
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      disabled={isDisabled}
                      {...register(`variants.${index}.minStockLevel`, {
                        valueAsNumber: true,
                      })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--primary-red)"
                    />
                  </div>
                </div>

                {/* Stock read-only + codes */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Stock */}
                  <div className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <LuLock className="h-3.5 w-3.5" />
                      المخزون الحالي
                    </div>

                    <div className="text-sm font-bold text-gray-800">
                      {stock.toLocaleString()}{" "}
                      {initialData.sellingUnit ?? "وحدة"}
                    </div>

                    <p className="mt-1 text-[9px] text-gray-400">
                      يتم تعديل المخزون من خلال حركات المخزون.
                    </p>
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      SKU
                    </label>

                    <input
                      type="text"
                      disabled={isDisabled}
                      {...register(`variants.${index}.sku`)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-(--primary-red)"
                    />
                  </div>

                  {/* Barcode */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      الباركود
                    </label>

                    <input
                      type="text"
                      disabled={isDisabled}
                      {...register(`variants.${index}.barcode`)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-(--primary-red)"
                    />
                  </div>

                  {/* Pack barcode */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      باركود العبوة
                    </label>

                    <input
                      type="text"
                      disabled={isDisabled}
                      {...register(`variants.${index}.packBarcode`)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-(--primary-red)"
                    />
                  </div>
                </div>

                {/* Variant images */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="mb-2">
                    <label className="block text-xs font-semibold text-gray-600">
                      صور هذا الخيار
                    </label>

                    <p className="mt-1 text-[10px] text-gray-400">حتى 4 صور.</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {variantImages.map((image, imageIndex) => (
                      <div
                        key={`${image}-${imageIndex}`}
                        className="group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200"
                      >
                        <Image
                          src={image}
                          alt={`${initialData.name} option`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />

                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() =>
                            handleRemoveVariantImage(index, imageIndex)
                          }
                          className="absolute right-0.5 top-0.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
                        >
                          <LuX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {variantImages.length < 4 && (
                      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white transition hover:bg-gray-50">
                        {uploadingImages ? (
                          <LuLoader className="h-4 w-4 animate-spin text-gray-400" />
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
                          disabled={isDisabled}
                          onChange={(event) =>
                            handleAddVariantImages(index, event)
                          }
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===================================================
          Actions
      =================================================== */}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={isDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDisabled && <LuLoader className="h-4 w-4 animate-spin" />}

          {uploadingImages
            ? "جاري رفع الصور..."
            : isSubmitting
              ? "جاري حفظ التغييرات..."
              : "حفظ التغييرات"}
        </button>
      </div>
    </form>
  );
}

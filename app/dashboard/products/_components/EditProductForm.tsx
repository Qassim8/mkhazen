"use client";

/**
 * تعديل المنتج — نفس تصميم ومكونات صفحة إضافة المنتج (AddProductClient).
 * الفرق: المتغيرات الموجودة تحمل id، والرصيد للعرض فقط (يتعدل من حركات المخزون).
 */

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { LuLayers, LuLoader, LuPackage, LuSave } from "react-icons/lu";

import {
  productFormSchema,
  type Product,
  type ProductFormInputType,
  type ProductFormOutputType,
} from "../schemas/product.schemas";
import { updateProduct } from "../services/products.services";
import { uploadImage } from "@/lib/storage";

import Images from "./Images";
import BasicInfoForm from "./BasicInfoForm";
import ProductVisibility from "./ProductVisibility";
import UnitConversionSection from "./UnitConversionSection";
import ProductVariantsSection from "./ProductVariants";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

function mergeById<T extends { id: string | number }>(base: T[], added: T[]) {
  const seen = new Set(base.map((item) => String(item.id)));
  return [...added.filter((item) => !seen.has(String(item.id))), ...base];
}

interface ProductWithRelations extends Product {
  category?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
}

interface EditProductFormProps {
  initialData: ProductWithRelations;
  categories?: Category[];
  suppliers?: Supplier[];
}

const EMPTY_VARIANT = {
  sku: "",
  barcode: "",
  packBarcode: "",
  size: "",
  colorName: "",
  colorCode: "#000000",
  length: undefined,
  width: undefined,
  purchasePrice: 0,
  sellingPrice: 0,
  minSellingPrice: 0,
  minStockLevel: 5,
  isDefault: false,
  isActive: true,
  images: [] as string[],
};

export default function EditProductForm({
  initialData,
  categories: initialCategories = [],
  suppliers: initialSuppliers = [],
}: EditProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [addedCategories, setAddedCategories] = useState<Category[]>([]);
  const [addedSuppliers, setAddedSuppliers] = useState<Supplier[]>([]);

  const categories = useMemo(
    () => mergeById(initialCategories, addedCategories),
    [initialCategories, addedCategories],
  );
  const suppliers = useMemo(
    () => mergeById(initialSuppliers, addedSuppliers),
    [initialSuppliers, addedSuppliers],
  );

  // الرصيد مش حقل في الفورم — يظهر للعرض بس
  const stockByVariantId = useMemo(
    () =>
      Object.fromEntries(
        (initialData.variants ?? []).map((variant) => [
          variant.id,
          Number(variant.stockQuantity ?? 0),
        ]),
      ),
    [initialData.variants],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProductFormInputType, unknown, ProductFormOutputType>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initialData.name,
      description: initialData.description ?? "",
      categoryId: initialData.categoryId ?? "",
      supplierId: initialData.supplierId ?? "",
      purchaseUnit: initialData.purchaseUnit ?? "قطعة",
      sellingUnit: initialData.sellingUnit ?? "قطعة",
      conversionFactor: Number(initialData.conversionFactor ?? 1),
      images: (initialData.images ?? []).slice(0, 4),
      isActive: initialData.isActive ?? true,
      isVisible: initialData.isVisible ?? true,
      variants:
        initialData.variants?.length > 0
          ? initialData.variants.map((variant) => ({
              id: variant.id,
              sku: variant.sku ?? "",
              barcode: variant.barcode ?? "",
              packBarcode: variant.packBarcode ?? "",
              size: variant.size ?? "",
              colorName: variant.colorName ?? "",
              colorCode: variant.colorCode ?? "#000000",
              length: variant.length ?? undefined,
              width: variant.width ?? undefined,
              purchasePrice: Number(variant.purchasePrice ?? 0),
              sellingPrice: Number(variant.sellingPrice ?? 0),
              minSellingPrice:
                variant.minSellingPrice != null
                  ? Number(variant.minSellingPrice)
                  : undefined,
              minStockLevel: Number(variant.minStockLevel ?? 5),
              isDefault: Boolean(variant.isDefault),
              isActive: Boolean(variant.isActive),
              images: variant.images ?? [],
            }))
          : [{ ...EMPTY_VARIANT, isDefault: true }],
    },
  });

  const currentImages = useWatch({ control, name: "images" }) ?? [];
  const currentVariants = useWatch({ control, name: "variants" }) ?? [];
  const hasVariants = currentVariants.length > 1;

  const toggleHasVariants = (value: boolean) => {
    if (value) {
      if (currentVariants.length < 2) {
        setValue("variants", [...currentVariants, { ...EMPTY_VARIANT }]);
      }
      return;
    }

    if (currentVariants.length > 1) {
      // الرجوع لمنتج فردي يحذف باقي المتغيرات — نتأكد أولًا
      const withStock = currentVariants
        .slice(1)
        .some((variant) => variant.id && (stockByVariantId[variant.id] ?? 0) > 0);
      if (withStock) {
        toast.error("لا يمكن التحويل لمنتج فردي: توجد متغيرات أخرى لها رصيد بالمخزن.");
        return;
      }
    }

    const firstVariant = currentVariants[0];
    setValue("variants", [
      {
        ...firstVariant,
        colorName: null,
        colorCode: null,
        size: null,
        length: null,
        width: null,
        isDefault: true,
      },
    ]);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        Array.from(filesList).map((file) => uploadImage(file, "products")),
      );

      setValue("images", [...currentImages, ...uploadedUrls].slice(0, 4), {
        shouldValidate: true,
      });
      toast.success("تم رفع الصور بنجاح!");
    } catch (error: unknown) {
      console.error("Product image upload:", error);
      toast.error(
        error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصور",
      );
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    setValue(
      "images",
      currentImages.filter((_, i) => i !== index),
      { shouldValidate: true },
    );
  };

  const handleVariantImageChange = async (
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

      const existingVariantImages = currentVariants[variantIndex]?.images || [];
      setValue(
        `variants.${variantIndex}.images`,
        [...existingVariantImages, ...uploadedUrls].slice(0, 4),
        { shouldValidate: true },
      );
      toast.success("تم رفع صور المتغير بنجاح!");
    } catch (error: unknown) {
      console.error("Product variant image upload:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء رفع صور المتغير",
      );
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  const removeVariantImage = (variantIndex: number, imageIndex: number) => {
    const existingVariantImages = currentVariants[variantIndex]?.images || [];
    setValue(
      `variants.${variantIndex}.images`,
      existingVariantImages.filter((_, i) => i !== imageIndex),
      { shouldValidate: true },
    );
  };

  const onSubmit = async (data: ProductFormOutputType) => {
    try {
      setIsSubmitting(true);
      await updateProduct(initialData.id, {
        ...data,
        categoryId: data.categoryId || null,
        supplierId: data.supplierId || null,
      });
      toast.success(`تم تحديث ${data.name} بنجاح`);
      router.push("/dashboard/products");
      router.refresh();
    } catch (error: unknown) {
      console.error("Update product:", error);
      toast.error(
        error instanceof Error ? error.message : "حدث خطأ أثناء التحديث",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid gap-6 lg:grid-cols-2"
    >
      {/* العمود الأول */}
      <div className="space-y-6">
        <Images
          images={currentImages}
          onImageChange={handleImageChange}
          onRemoveImage={removeImage}
        />

        <BasicInfoForm
          register={register}
          errors={errors}
          categories={categories}
          suppliers={suppliers}
          loadingOptions={false}
          onCategoryCreated={(category) => {
            flushSync(() => setAddedCategories((prev) => [category, ...prev]));
            setValue("categoryId", String(category.id), { shouldValidate: true });
          }}
          onSupplierCreated={(supplier) => {
            flushSync(() => setAddedSuppliers((prev) => [supplier, ...prev]));
            setValue("supplierId", String(supplier.id), { shouldValidate: true });
          }}
        />
      </div>

      {/* العمود الثاني */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <label className="block text-sm font-bold text-gray-900">
            نوع المنتج
          </label>
          <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => toggleHasVariants(false)}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition ${
                !hasVariants
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <LuPackage className="h-4 w-4 text-(--primary-red)" />
              منتج مفرد (بدون خيارات)
            </button>

            <button
              type="button"
              onClick={() => toggleHasVariants(true)}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition ${
                hasVariants
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <LuLayers className="h-4 w-4 text-(--primary-red)" />
              منتج متعدد الخيارات
            </button>
          </div>
        </div>

        <UnitConversionSection control={control} register={register} />

        <ProductVariantsSection
          control={control}
          register={register}
          errors={errors}
          categories={categories}
          hasVariants={hasVariants}
          onVariantImageChange={handleVariantImageChange}
          onRemoveVariantImage={removeVariantImage}
          stockByVariantId={stockByVariantId}
        />

        <ProductVisibility register={register} />

        {errors.variants?.root && (
          <p className="text-xs font-semibold text-red-500">
            {errors.variants.root.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || uploadingImages}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) py-3.5 text-sm font-bold text-white hover:bg-(--primary-red-hover) active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting || uploadingImages ? (
            <LuLoader className="h-5 w-5 animate-spin" />
          ) : (
            <LuSave className="h-5 w-5" />
          )}
          {uploadingImages ? "جاري رفع الصور..." : "حفظ التعديلات"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ProductFormInputType,
  ProductFormOutputType,
  productSchema,
} from "../schemas/product.schemas";
import { useRouter } from "next/navigation";
import { LuSave, LuLoader, LuPackage, LuLayers } from "react-icons/lu";
import { createProduct } from "../services/products.services";
import { uploadImage } from "@/lib/storage";
import { toast } from "react-hot-toast";

// Components
import Images from "./Images";
import BasicInfoForm from "./BasicInfoForm";
import ProductVisibility from "./ProductVisibility";
import UnitConversionSection from "./UnitConversionSection";
import ProductVariantsSection from "./ProductVariants";
import { Category } from "../../categories/schemas/category.schemas";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";

// interface Category {
//   id: string;
//   name: string;
// }

// interface Supplier {
//   id: string;
//   name: string;
// }

interface AddProductFormProps {
  initialCategories: Category[];
  initialSuppliers: Supplier[];
}

export default function AddProductClient({
  initialCategories,
  initialSuppliers,
}: AddProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormInputType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      supplierId: "",
      purchaseUnit: "قطعة",
      sellingUnit: "قطعة",
      conversionFactor: 1,
      hasVariants: false,
      images: [],
      isActive: true,
      isVisible: true,
      variants: [
        {
          sku: "",
          barcode: "",
          packBarcode: "",
          size: "",
          colorName: "",
          colorCode: "#000000",
          purchasePrice: 0,
          sellingPrice: 0,
          minSellingPrice: 0,
          stockQuantity: 0,
          minStockLevel: 5,
          isDefault: true,
          isActive: true,
          images: [],
        },
      ],
    },
  });

  const hasVariants = watch("hasVariants");
  const currentImages = watch("images") ?? [];

  // التبديل بين نوع المنتج (مفرد / متعدد المتغيرات)
  const toggleHasVariants = (value: boolean) => {
    setValue("hasVariants", value, { shouldValidate: true });

    if (!value) {
      const currentVariants = watch("variants");
      const firstVariant = currentVariants?.[0] || {};

      setValue("variants", [
        {
          ...firstVariant,
          colorName: null,
          colorCode: null,
          size: null,
          isDefault: true,
        },
      ]);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        Array.from(filesList).map((file) => uploadImage(file, "products")),
      );

      setValue("images", [...currentImages, ...uploadedUrls].slice(0, 5), {
        shouldValidate: true,
      });
      toast.success("تم رفع الصور بنجاح!");
    } catch (error: any) {
      toast.error(error?.message || "حدث خطأ أثناء رفع الصور");
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

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories((prev) => [...prev, newCategory]); // تحديث القائمة فوراً
    setValue("categoryId", newCategory.id, { shouldValidate: true }); // اختيارها تلقائياً في النموذج
  };

  const handleSupplierCreated = (newSupplier: Supplier) => {
    setSuppliers((prev) => [...prev, newSupplier]); // تحديث القائمة فوراً
    setValue("supplierId", newSupplier.id, { shouldValidate: true }); // اختياره تلقائياً
  };

  const onSubmit = async (data: ProductFormInputType) => {
    try {
      setIsSubmitting(true);
      await createProduct(data as ProductFormOutputType);
      toast.success("تم إضافة المنتج بنجاح");
      router.push("/dashboard/products");
    } catch (err: any) {
      console.log("Validation Errors:", err?.response?.data || err);
      toast.error(err.message || "حدث خطأ أثناء حفظ المنتج");
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
        />
      </div>

      {/* العمود الثاني */}
      <div className="space-y-6">
        {/* 🔘 شريط اختيارات نوع المنتج (مفرد / متعدد) */}
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

        <UnitConversionSection
          register={register}
          watch={watch}
          setValue={setValue}
        />

        <ProductVariantsSection
          control={control}
          register={register}
          errors={errors}
          watch={watch}
          setValue={setValue}
          categories={categories}
          hasVariants={hasVariants}
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
          {uploadingImages ? "جاري رفع الصور..." : "حفظ المنتج"}
        </button>
      </div>
    </form>
  );
}

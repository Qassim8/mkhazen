"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ProductFormInputType,
  ProductFormOutputType,
  productSchema,
} from "@/lib/validations/product.schemas";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LuArrowRight, LuSave, LuLoader } from "react-icons/lu";
import ProductMediaAndSizes, {
  Category,
} from "../_components/ProductMediaAndSizes";
import { createProduct } from "../service/products.services";
import { uploadImage } from "@/lib/storage";
import { toast } from "react-hot-toast";

const INITIAL_CATEGORIES: Category[] = [
  { id: "1", name: "جلابيات وثياب" },
  { id: "2", name: "صديري وشالات" },
  { id: "3", name: "أقمشة (طاقات/أمتار)" },
  { id: "4", name: "طواقي وعمم" },
  { id: "5", name: "عطور وإكسسوارات" },
  { id: "6", name: "عصايات وساعات" },
];

const SUPPLIERS = [
  { id: "1", name: "مورد الأقمشة الكويتية" },
  { id: "2", name: "مصنع الثياب السودانية" },
  { id: "3", name: "مؤسسة العطور العربية" },
];

export default function AddProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormInputType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      description: "",
      categoryId: "",
      supplierId: "",
      purchasePrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      minStockLevel: 5,
      purchaseUnit: "قطعة",
      sellingUnit: "قطعة",
      length: "",
      width: "",
      sizes: [],
      images: [],
      isActive: true,
    },
  });

  const selectedCategoryId = watch("categoryId") ?? "";
  const selectedSellingUnit = watch("sellingUnit");
  const selectedSizes = watch("sizes") ?? [];
  const currentImages = watch("images") ?? [];
  const currentLength = watch("length") ?? "";
  const currentWidth = watch("width") ?? "";

  // إنشاء فئة جديدة ديناميكياً
  const handleCreateCategory = (categoryName: string) => {
    const newCategory: Category = {
      id: Date.now().toString(),
      name: categoryName,
    };
    setCategories((prev) => [...prev, newCategory]);
    setValue("categoryId", newCategory.id, { shouldValidate: true });
    toast.success(`تمت إضافة فئة "${categoryName}" بنجاح`);
  };

  const toggleSize = (size: string) => {
    const exists = selectedSizes.includes(size);
    const updated = exists
      ? selectedSizes.filter((s) => s !== size)
      : [...selectedSizes, size];
    setValue("sizes", updated, { shouldValidate: true });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const files = Array.from(filesList);

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(
        files.map((file) => uploadImage(file, "products")),
      );

      setValue("images", [...currentImages, ...uploadedUrls].slice(0, 5), {
        shouldValidate: true,
      });

      toast.success("تم رفع الصور بنجاح!");
    } catch (error: any) {
      console.error("تفاصيل الخطأ الكاملة:", error);
      toast.error(error?.message || "حدث خطأ غير معروف أثناء رفع الصور", {
        duration: 6000,
      });
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

  const onSubmit = async (data: ProductFormInputType) => {
    try {
      setIsSubmitting(true);
      setServerError(null);

      await createProduct(data as ProductFormOutputType);
      toast.success("تم إيجاد المنتج بنجاح");
      router.push("/dashboard/products");
    } catch (err: any) {
      setServerError(err.message || "حدث خطأ أثناء حفظ المنتج");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-(--primary-red) mb-1 transition"
          >
            <LuArrowRight className="h-4 w-4" /> العودة لقائمة المنتجات
          </Link>
          <h1 className="text-2xl font-black text-gray-950">
            إضافة منتج جديد للمخزن
          </h1>
        </div>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm font-semibold">
          {serverError}
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-5 lg:grid-cols-2"
      >
        {/* الجزء الأيسر: الوسائط والمقاسات والفئات */}
        <div className="space-y-6">
          <ProductMediaAndSizes
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(id) =>
              setValue("categoryId", id, { shouldValidate: true })
            }
            onCreateCategory={handleCreateCategory}
            length={currentLength}
            width={currentWidth}
            onLengthChange={(val) => setValue("length", val)}
            onWidthChange={(val) => setValue("width", val)}
            selectedSizes={selectedSizes}
            onToggleSize={toggleSize}
            images={currentImages}
            onImageChange={handleImageChange}
            onRemoveImage={removeImage}
          />

          <button
            type="submit"
            disabled={isSubmitting || uploadingImages}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-(--primary-red) py-3.5 text-sm font-bold text-white shadow-md hover:bg-(--primary-red-hover) active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting || uploadingImages ? (
              <LuLoader className="h-5 w-5 animate-spin" />
            ) : (
              <LuSave className="h-5 w-5" />
            )}
            {uploadingImages ? "جاري رفع الصور..." : "حفظ المنتج"}
          </button>
        </div>
        <div className="space-y-6">
          {/* البيانات الأساسية */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
              البيانات الأساسية والتصنيف
            </h3>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                اسم المنتج *
              </label>
              <input
                {...register("name")}
                placeholder="مثال: جلابية كتان كويتي أبيض فاخر"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* التصنيف والمورد */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  المورد
                </label>
                <select
                  {...register("supplierId")}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                >
                  <option value="">اختر المورد (اختياري)...</option>
                  {SUPPLIERS.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* الوصف */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  وصف المنتج
                </label>
                <textarea
                  {...register("description")}
                  rows={3}
                  placeholder="تفاصيل المنتج، نوع القماش، بلد التصنيع، إلخ..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium resize-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-gray-50">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  رمز الـ SKU (اختياري)
                </label>
                <input
                  {...register("sku")}
                  placeholder="سيتم التوليد تلقائياً إن ترك فارغاً"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  الباركود (Barcode)
                </label>
                <input
                  {...register("barcode")}
                  placeholder="امسح الباركود أو اتركه للتوليد"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>
            </div>
          </div>

          {/* التسعير والمخزون */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
              التسعير ووحدات القياس
            </h3>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  وحدة البيع الرئيسية
                </label>
                <select
                  {...register("sellingUnit")}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                >
                  <option value="قطعة">قطعة (ثوب / صديري / عطر)</option>
                  <option value="متر">متر (قماش بالترديد/المتر)</option>
                  <option value="طاقة">طاقة (ثوب قماش كامل)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  سعر التكلفة ({selectedSellingUnit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register("purchasePrice", { valueAsNumber: true })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  سعر البيع ({selectedSellingUnit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register("sellingPrice", { valueAsNumber: true })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>
            </div>

            {selectedSellingUnit === "طاقة" && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-medium">
                💡 **ملاحظة للمخزون:** سيتم تسجيل الكمية بعدد الطاقات. يُفضل ذكر
                عدد الأمتار في طاقة الثوب الواحدة ضمن وصف المنتج لضمان دقة البيع
                بالمتر لاحقاً.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-50 pt-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  الكمية المتوفرة ({selectedSellingUnit})
                </label>
                <input
                  type="number"
                  {...register("stockQuantity", { valueAsNumber: true })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  حد إعادة الطلب (أقل كمية)
                </label>
                <input
                  type="number"
                  {...register("minStockLevel", { valueAsNumber: true })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

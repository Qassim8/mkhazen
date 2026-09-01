"use client";

import {
  Control,
  UseFormRegister,
  useFieldArray,
  FieldErrors,
  UseFormWatch,
  UseFormSetValue,
} from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";
import {
  LuPlus,
  LuTrash2,
  LuLayers,
  LuPalette,
  LuRuler,
  LuTag,
  LuDollarSign,
  LuImage,
  LuLock,
  LuUpload,
} from "react-icons/lu";

interface Category {
  id: string;
  name: string;
}

interface ProductVariantsSectionProps {
  control: Control<ProductFormInputType>;
  register: UseFormRegister<ProductFormInputType>;
  errors?: FieldErrors<ProductFormInputType>;
  watch: UseFormWatch<ProductFormInputType>;
  setValue: UseFormSetValue<ProductFormInputType>;
  categories?: Category[];
  hasVariants?: boolean;
}

export default function ProductVariantsSection({
  control,
  register,
  errors,
  watch,
  setValue,
  categories = [],
  hasVariants = false,
}: ProductVariantsSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  const purchaseUnit = watch("purchaseUnit") || "طاقة";
  const sellingUnit = watch("sellingUnit") || "متر";
  const selectedCategoryId = watch("categoryId");
  const selectedCategoryObj = categories.find(
    (c) => c.id === selectedCategoryId,
  );
  const categoryName = selectedCategoryObj?.name?.toLowerCase() || "";

  const isJallabiyaOrFabric =
    categoryName.includes("جلاليب") ||
    categoryName.includes("جلابيه") ||
    categoryName.includes("ثوب") ||
    categoryName.includes("أقمشة") ||
    categoryName.includes("قماش");

  const addVariant = () => {
    append({
      size: "",
      length: 0,
      width: 0,
      colorName: "",
      colorCode: "#000000",
      sku: "",
      barcode: "",
      packBarcode: "",
      purchasePrice: 0,
      sellingPrice: 0,
      minSellingPrice: 0,
      stockQuantity: 0,
      minStockLevel: 5,
      isDefault: false,
      isActive: true,
      images: [],
    });
  };

  const handleImageUpload = (
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;

    const currentImages = watch(`variants.${index}.images`) || [];
    const newImageUrls = Array.from(files).map((file) =>
      URL.createObjectURL(file),
    );

    setValue(`variants.${index}.images`, [...currentImages, ...newImageUrls]);
  };

  const removeImage = (variantIndex: number, imageIndex: number) => {
    const currentImages = watch(`variants.${variantIndex}.images`) || [];
    const updated = currentImages.filter((_, i) => i !== imageIndex);
    setValue(`variants.${variantIndex}.images`, updated);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <LuLayers className="h-5 w-5 text-(--primary-red)" />
            {hasVariants
              ? "خيارات وأسعار المنتج (Variants)"
              : "الأسعار والباركود"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {hasVariants
              ? "إدارة المتغيرات والأسعار والباركود وصور كل خيار"
              : "تحديد أسعار المنتج والباركود الخاص به"}
          </p>
        </div>

        {hasVariants && (
          <button
            type="button"
            onClick={addVariant}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-(--primary-red) bg-red-50 hover:bg-red-100/80 rounded-xl transition cursor-pointer"
          >
            <LuPlus className="h-4 w-4" />
            إضافة خيار/مقاس جديد
          </button>
        )}
      </div>

      <div className="space-y-6">
        {fields.map((field, index) => {
          const variantErrors = errors?.variants?.[index];
          const variantImages = watch(`variants.${index}.images`) || [];
          const currentColorCode =
            watch(`variants.${index}.colorCode`) || "#000000";

          return (
            <div
              key={field.id}
              className="p-5 rounded-2xl border border-gray-200 bg-gray-50/60 space-y-5 relative transition hover:border-gray-300"
            >
              {/* ترويسة المتغير (تظهر فقط عند تفعيل خيار المتغيرات) */}
              {hasVariants && (
                <div className="flex justify-between items-center border-b border-gray-200/80 pb-3">
                  <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-(--primary-red)" />
                    {index === 0
                      ? "المتغير الرئيسي / الأساسي"
                      : `متغير #${index + 1}`}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg transition"
                      title="حذف هذا المتغير"
                    >
                      <LuTrash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}

              {/* 🖼️ قسم صور المتغير (يظهر عند استخدام المتغيرات) */}
              {hasVariants && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <LuImage className="h-3.5 w-3.5 text-gray-500" />
                    صور هذا الخيار
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {variantImages.map((imgUrl, imgIdx) => (
                      <div
                        key={imgIdx}
                        className="relative h-16 w-16 rounded-xl border border-gray-200 overflow-hidden group bg-white"
                      >
                        <img
                          src={imgUrl}
                          alt="variant"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index, imgIdx)}
                          className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                        >
                          <LuTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <label className="h-16 w-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-(--primary-red) flex flex-col items-center justify-center cursor-pointer bg-white text-gray-400 hover:text-(--primary-red) transition">
                      <LuUpload className="h-4 w-4" />
                      <span className="text-[10px] font-medium mt-1">رفع</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(index, e)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* 🎨 الألوان والمقاسات (تظهر عند تفعيل المتغيرات) */}
              {hasVariants && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                      <LuPalette className="h-3.5 w-3.5 text-gray-500" />
                      اسم اللون
                    </label>
                    <input
                      {...register(`variants.${index}.colorName`)}
                      placeholder="مثال: أبيض ناصع"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      كود / درجة اللون
                    </label>
                    <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-2 py-1">
                      <input
                        type="color"
                        {...register(`variants.${index}.colorCode`)}
                        className="h-7 w-8 rounded-md cursor-pointer border-0 bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-600 uppercase">
                        {currentColorCode}
                      </span>
                    </div>
                  </div>

                  {isJallabiyaOrFabric ? (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                          <LuRuler className="h-3.5 w-3.5 text-gray-500" />
                          الطول
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`variants.${index}.length`, {
                            valueAsNumber: true,
                          })}
                          placeholder="مثال: 58"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                          <LuRuler className="h-3.5 w-3.5 text-gray-500" />
                          العرض
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`variants.${index}.width`, {
                            valueAsNumber: true,
                          })}
                          placeholder="مثال: 24"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                        <LuRuler className="h-3.5 w-3.5 text-gray-500" />
                        المقاس (Size)
                      </label>
                      <input
                        {...register(`variants.${index}.size`)}
                        placeholder="مثال: XL / 42"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 🏷️ الـ SKU والباركودات */}
              <div
                className={`grid gap-4 md:grid-cols-3 ${
                  hasVariants ? "border-t border-gray-200/60 pt-4" : ""
                }`}
              >
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <LuTag className="h-3.5 w-3.5 text-gray-500" />
                    رمز SKU
                  </label>
                  <input
                    {...register(`variants.${index}.sku`)}
                    placeholder="رمز SKU التمييزي"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">
                    باركود البيع ({sellingUnit})
                  </label>
                  <input
                    {...register(`variants.${index}.barcode`)}
                    placeholder={`باركود ${sellingUnit}`}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 truncate">
                    باركود الشراء ({purchaseUnit})
                  </label>
                  <input
                    {...register(`variants.${index}.packBarcode`)}
                    placeholder={`باركود ${purchaseUnit}`}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium focus:border-(--primary-red) outline-hidden"
                  />
                </div>
              </div>

              {/* 💰 الأسعار وحد الخصوم */}
              <div className="grid gap-4 md:grid-cols-3 border-t border-gray-200/60 pt-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    سعر الشراء *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`variants.${index}.purchasePrice`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold focus:border-(--primary-red) outline-hidden"
                  />
                  {variantErrors?.purchasePrice && (
                    <p className="text-[11px] text-red-500 mt-1">
                      {variantErrors.purchasePrice.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 truncate">
                    سعر البيع ({sellingUnit}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`variants.${index}.sellingPrice`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold focus:border-(--primary-red) outline-hidden"
                  />
                  {variantErrors?.sellingPrice && (
                    <p className="text-[11px] text-red-500 mt-1">
                      {variantErrors.sellingPrice.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1.5 truncate flex items-center gap-1">
                    <LuDollarSign className="h-3.5 w-3.5" />
                    أقل سعر بيع (الخصم)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`variants.${index}.minSellingPrice`, {
                      valueAsNumber: true,
                    })}
                    placeholder="حد الخصم"
                    className="w-full rounded-xl border border-amber-200 bg-amber-50/30 px-3 py-2 text-xs font-bold focus:border-amber-500 outline-hidden"
                  />
                  {variantErrors?.minSellingPrice && (
                    <p className="text-[11px] text-red-500 mt-1">
                      {variantErrors.minSellingPrice.message}
                    </p>
                  )}
                </div>
              </div>

              {/* 📦 المخزون */}
              <div className="grid gap-4 md:grid-cols-2 border-t border-gray-200/60 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <LuLock className="h-3.5 w-3.5 text-gray-400" />
                    الكمية بالمخزن (للعرض فقط)
                  </label>
                  <input
                    type="number"
                    readOnly
                    {...register(`variants.${index}.stockQuantity`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-100/80 px-3 py-2 text-xs font-bold text-gray-500 cursor-not-allowed outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    حد إعادة الطلب
                  </label>
                  <input
                    type="number"
                    {...register(`variants.${index}.minStockLevel`, {
                      valueAsNumber: true,
                    })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold focus:border-(--primary-red) outline-hidden"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

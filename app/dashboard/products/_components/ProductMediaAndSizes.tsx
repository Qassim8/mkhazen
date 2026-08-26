"use client";

import { useState } from "react";
import Image from "next/image";
import { LuImagePlus, LuX, LuPlus, LuCheck } from "react-icons/lu";

// واجهة الفئة القادمة من قاعدة البيانات
export interface Category {
  id: string;
  name: string;
}

interface MediaSizesProps {
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  onCreateCategory?: (categoryName: string) => void;

  // بيانات المقاسات (طول وعرض)
  length: string;
  width: string;
  onLengthChange: (val: string) => void;
  onWidthChange: (val: string) => void;

  // المقاسات التقديرية/السديري إن لزم الأمر (S, M, L, XL, XXL)
  selectedSizes: string[];
  onToggleSize: (size: string) => void;

  images: string[];
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
}

export default function ProductMediaAndSizes({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onCreateCategory,
  length,
  width,
  onLengthChange,
  onWidthChange,
  selectedSizes,
  onToggleSize,
  images,
  onImageChange,
  onRemoveImage,
}: MediaSizesProps) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // مقاسات السديري/الملحقات العلوية
  const vestSizes = ["S", "M", "L", "XL", "2XL", "3XL"];

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    if (onCreateCategory) {
      onCreateCategory(newCategoryName.trim());
    }
    setNewCategoryName("");
    setIsAddingCategory(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. قسم الفئات (Categories from DB) */}
      <div className="frame space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">فئة المنتج</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              اختر الفئة التابع لها المنتج من قاعدة البيانات
            </p>
          </div>

          {!isAddingCategory && (
            <button
              type="button"
              onClick={() => setIsAddingCategory(true)}
              className="flex items-center gap-1 text-xs font-bold text-(--primary-red) hover:bg-red-50 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              <LuPlus className="h-4 w-4" />
              إنشاء فئة جديدة
            </button>
          )}
        </div>

        {/* نموذج إضافة فئة جديدة سريع */}
        {isAddingCategory && (
          <div className="flex items-center gap-2 p-3 bg-red-50/50 border border-red-100 rounded-xl transition">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="اسم الفئة الجديدة..."
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-(--primary-red)"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              className="px-3 py-1.5 bg-(--primary-red) text-white text-xs font-bold rounded-lg hover:opacity-90 transition flex items-center gap-1"
            >
              <LuCheck className="h-3.5 w-3.5" />
              حفظ
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingCategory(false);
                setNewCategoryName("");
              }}
              className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-xs"
            >
              إلغاء
            </button>
          </div>
        )}

        {/* قائمة الفئات المتاحة */}
        <div className="flex flex-wrap gap-2">
          {categories.length > 0 ? (
            categories.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={`h-9 px-4 rounded-xl border text-xs font-bold transition transform active:scale-95 cursor-pointer ${
                    isSelected
                      ? "border-(--primary-red) bg-red-50 text-(--primary-red)"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })
          ) : (
            <p className="text-xs text-gray-400 italic">
              لا توجد فئات حالياً، أضف فئة جديدة.
            </p>
          )}
        </div>
      </div>

      {/* 2. قسم أبعاد ومقاسات الجلابية والسديري */}
      <div className="frame space-y-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            المقاسات والأبعاد
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            حدد مقاسات الطول والعرض للجلابية (بالأمتار/السنتيمتر) أو مقاسات
            السديري.
          </p>
        </div>

        {/* مقاسات الجلابية بالأبعاد (طول * عرض) */}
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-xs font-bold text-gray-700 block">
            أبعاد القماش / الجلابية:
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-400 block mb-1">
                الطول (مثال: 3 متر)
              </span>
              <input
                type="text"
                value={length}
                onChange={(e) => onLengthChange(e.target.value)}
                placeholder="مثال: 3 متر أو 160 سم"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-(--primary-red) transition"
              />
            </div>
            <div>
              <span className="text-[11px] text-gray-400 block mb-1">
                العرض (مثال: 1.5 متر)
              </span>
              <input
                type="text"
                value={width}
                onChange={(e) => onWidthChange(e.target.value)}
                placeholder="مثال: 1.5 متر أو 58 سم"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-(--primary-red) transition"
              />
            </div>
          </div>
        </div>

        {/* اختيار مقاسات الملحقات / السديري (S, M, L, XL, إلخ) */}
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-xs font-bold text-gray-700 block">
            مقاسات السديري / الملحقات (إن وجدت):
          </label>
          <div className="flex flex-wrap gap-2">
            {vestSizes.map((size) => {
              const isSelected = selectedSizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={`h-9 min-w-10 px-2 rounded-xl border text-xs font-bold transition transform active:scale-95 cursor-pointer ${
                    isSelected
                      ? "border-(--primary-red) bg-red-50 text-(--primary-red)"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. صندوق رفع صور المنتج */}
      <div className="frame space-y-4">
        <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
          صور المنتج
        </h3>

        <div className="space-y-4">
          {images.length < 4 && (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100/70 cursor-pointer transition group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <LuImagePlus className="h-7 w-7 text-gray-400 group-hover:text-(--primary-red) mb-2 transition transform group-hover:scale-110" />
                <p className="text-xs font-bold text-gray-700">
                  اضغط هنا لتحميل صور الجلابية
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  يمكنك رفع حتى 4 صور معاينة
                </p>
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={onImageChange}
                className="hidden"
              />
            </label>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((src, index) => (
                <div
                  key={index}
                  className="relative group aspect-square rounded-xl border border-gray-100 overflow-hidden bg-gray-50"
                >
                  <Image
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    src={src}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-lg text-white hover:bg-(--primary-red) transition opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <LuX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

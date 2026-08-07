"use client";

import Image from "next/image";
import { LuImagePlus, LuX } from "react-icons/lu";

interface MediaSizesProps {
  sizes: string[];
  images: string[];
  onToggleSize: (size: string) => void;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
}

export default function ProductMediaAndSizes({
  sizes,
  images,
  onToggleSize,
  onImageChange,
  onRemoveImage,
}: MediaSizesProps) {
  const availableSizes = ["M", "L", "XL", "2XL", "3XL", "56", "58", "60", "62"];

  return (
    <div className="space-y-6">
      {/* صندوق رفع الصور المنقط التفاعلي */}
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

      {/* كرت اختيار المقاسات */}
      <div className="frame space-y-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            المقاسات المتاحة للجلابية
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            حدد المقاسات المتوفرة في المخزن لهذا الموديل.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {availableSizes.map((size) => {
            const isSelected = sizes.includes(size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => onToggleSize(size)}
                className={`h-10 min-w-[42px] px-2 rounded-xl border text-xs font-bold transition transform active:scale-95 cursor-pointer ${
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
  );
}

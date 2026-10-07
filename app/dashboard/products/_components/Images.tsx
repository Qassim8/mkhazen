import Image from "next/image";
import React from "react";
import { LuImagePlus, LuX } from "react-icons/lu";

interface ImagesProps {
  images: string[];
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
}

const Images = ({ images, onImageChange, onRemoveImage }: ImagesProps) => {
  return (
    <div>
      {/* 3. صندوق رفع صور المنتج */}
      <div className="frame space-y-4">
        <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
          صور المنتج
        </h3>

        <div className="space-y-4">
          {images.length < 4 && (
            <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100/70 cursor-pointer transition group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <LuImagePlus className="h-7 w-7 text-gray-400 group-hover:text-(--primary-red) mb-2 transition transform group-hover:scale-110" />
                <p className="text-xs font-bold text-gray-700">
                  اضغط هنا لتحميل صور للمنتج
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
};

export default Images;

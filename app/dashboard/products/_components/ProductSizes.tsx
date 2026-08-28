"use client";

interface ProductSizesProps {
  categoryName: string; // اسم الفئة (مثل: أحذية، صديري، جلاليب، قماش، عطور)

  selectedSizes: string[];
  onToggleSize: (size: string) => void;
}

export default function ProductSizes({
  categoryName,
  selectedSizes,
  onToggleSize,
}: ProductSizesProps) {
  // المقاسات المعيارية
  const vestSizes = ["S", "M", "L", "XL", "2XL", "3XL"];
  const shoeSizes = ["38", "39", "40", "41", "42", "43", "44", "45"];

  const cat = categoryName.toLowerCase();

  // الفلاتر الشاملة لمسميات الفئات
  const isVest =
    cat.includes("صديري") || cat.includes("سديري") || cat.includes("vest");
  const isShoes =
    cat.includes("حذاء") ||
    cat.includes("احذية") ||
    cat.includes("أحذية") ||
    cat.includes("مركوب") ||
    cat.includes("shoes");
  const isJallabiya =
    cat.includes("جلابية") ||
    cat.includes("جلاليب") ||
    cat.includes("ثوب") ||
    cat.includes("ثياب") ||
    cat.includes("thobe");
  const isFabric =
    cat.includes("قماش") ||
    cat.includes("أقمشة") ||
    cat.includes("اقمشة") ||
    cat.includes("أقمشه") ||
    cat.includes("اقمشه") ||
    cat.includes("fabric");
  const isPerfume =
    cat.includes("عطر") || cat.includes("عطور") || cat.includes("perfume");

  // حالة عدم اختيار فئة أو اختيار فئة لا تحتاج مقاسات (قماش / عطور)
  if (!categoryName) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-5 text-center text-xs font-semibold text-gray-400">
        اختر فئة للمنتج لعرض خيارات المقاسات والأبعاد المناسبة.
      </div>
    );
  }

  if (isFabric || isPerfume) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-blue-50/60 p-4 text-xs font-semibold text-blue-900 leading-relaxed">
        {isFabric
          ? "💡 هذه الفئة (أقمشة) تعتمد على وحدات القياس (المتر / الطاقة) من قسم التسعير ولا تتطلب مقاسات محددة."
          : "💡 هذه الفئة (عطور) لا تتطلب مقاسات أو أبعاد."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">المقاسات والأبعاد</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          المقاسات المتاحة المخصصة لفئة ({categoryName}):
        </p>
      </div>

      {/* 1. أبعاد الجلابية */}
      {/* {isJallabiya && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-xs font-bold text-gray-700 block">
            أبعاد الجلابية / الثوب:
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-400 block mb-1">
                الطول (مثال: 160 سم أو 3 متر)
              </span>
              <input
                type="text"
                value={length}
                onChange={(e) => onLengthChange(e.target.value)}
                placeholder="مثال: 160 سم"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-(--primary-red) transition"
              />
            </div>
            <div>
              <span className="text-[11px] text-gray-400 block mb-1">
                العرض (مثال: 58 سم)
              </span>
              <input
                type="text"
                value={width}
                onChange={(e) => onWidthChange(e.target.value)}
                placeholder="مثال: 58 سم"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-(--primary-red) transition"
              />
            </div>
          </div>
        </div>
      )} */}

      {/* 2. مقاسات الصديري */}
      {isVest && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-xs font-bold text-gray-700 block">
            مقاسات الصديري المتوفرة:
          </label>
          <div className="flex flex-wrap gap-2">
            {vestSizes.map((size) => {
              const isSelected = selectedSizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={`h-9 min-w-10 px-3 rounded-xl border text-xs font-bold transition transform active:scale-95 cursor-pointer ${
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
      )}

      {/* 3. مقاسات الأحذية والمركوب */}
      {isShoes && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-xs font-bold text-gray-700 block">
            مقاسات الأحذية / المركوب المتوفرة:
          </label>
          <div className="flex flex-wrap gap-2">
            {shoeSizes.map((size) => {
              const isSelected = selectedSizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={`h-9 min-w-10 px-3 rounded-xl border text-xs font-bold transition transform active:scale-95 cursor-pointer ${
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
      )}
    </div>
  );
}

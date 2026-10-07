"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LuPlus,
  LuSearch,
  LuTrash2,
  LuX,
  LuLink2,
  LuPackage,
} from "react-icons/lu";

// واجهة المنتج المرتبط
export interface RelatedProductItem {
  id: string;
  name: string;
  categoryName?: string;
  sellingPrice: number;
  image?: string;
}

interface RelatedProductsProps {
  // المنتجات المختارة حالياً
  selectedProducts: RelatedProductItem[];
  // دالة تحديث قائمة المنتجات المختارة
  onProductsChange: (products: RelatedProductItem[]) => void;
  // قائمة كل المنتجات المتاحة للبحث منها (تأتي من API أو Props)
  availableProducts?: RelatedProductItem[];
}

export default function RelatedProducts({
  selectedProducts = [],
  onProductsChange,
  availableProducts = [],
}: RelatedProductsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // تصفية المنتجات في البحث (حسب الاسم أو التصنيف) واستثناء المنتجات المضافة المسبقاً
  const filteredProducts = availableProducts.filter((product) => {
    const isAlreadySelected = selectedProducts.some((p) => p.id === product.id);
    if (isAlreadySelected) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchName = product.name.toLowerCase().includes(query);
    const matchCategory = product.categoryName?.toLowerCase().includes(query);

    return matchName || matchCategory;
  });

  // إضافة منتج للقائمة
  const handleAddProduct = (product: RelatedProductItem) => {
    onProductsChange([...selectedProducts, product]);
  };

  // حذف منتج من القائمة
  const handleRemoveProduct = (productId: string) => {
    onProductsChange(selectedProducts.filter((p) => p.id !== productId));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 ">
      {/* الهيدر: العنوان والزر */}
      <div className="flex items-center justify-between border-b border-gray-50 pb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <LuLink2 className="h-4 w-4 text-(--primary-red)" />
            المنتجات المرتبطة {selectedProducts.length}{" "}
            <span className="text-xs font-semibold">(اختياري)</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            ربط منتجات مقترحة تظهر للزوار في المتجر عند عرض هذا المنتج
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-2 bg-red-50 text-(--primary-red) hover:bg-red-100/80 rounded-xl text-xs font-bold transition cursor-pointer"
        >
          <LuPlus className="h-4 w-4" />
        </button>
      </div>

      {/* عرض المنتجات المضافة */}
      {selectedProducts.length > 0 ? (
        <div className="space-y-2">
          {selectedProducts.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 text-gray-500 rounded-xl border border-slate-300"
            >
              {/* صورة المنتج والاسم والكلية */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <LuPackage className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold truncate text-gray-700">
                    {item.name}
                  </h4>
                  {item.categoryName && (
                    <span className="text-[10px] text-gray-400 block truncate">
                      {item.categoryName}
                    </span>
                  )}
                </div>
              </div>

              {/* السعر وزر الحذف */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-black text-emerald-500 dir-ltr">
                  {item.sellingPrice.toLocaleString()} ريال
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveProduct(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-lg transition cursor-pointer"
                  title="حذف من المنتجات المرتبطة"
                >
                  <LuTrash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center border-2 border-dashed border-gray-100 rounded-xl">
          <p className="text-xs text-gray-400">
            لم يتم ربط أي منتجات بعد. انقر على "إضافة عنصر" للربط.
          </p>
        </div>
      )}

      {/* مودال البحث عن منتج */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4 border border-gray-100">
            {/* راس المودال */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900">
                البحث عن منتج لربطه
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            {/* حقل البحث */}
            <div className="relative">
              <LuSearch className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم المنتج أو الفئة..."
                className="w-full pr-9 pl-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:border-(--primary-red) transition"
                autoFocus
              />
            </div>

            {/* نتائج البحث */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50/40 transition cursor-pointer group"
                    onClick={() => {
                      handleAddProduct(product);
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                        {product.image ? (
                          <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <LuPackage className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 group-hover:text-(--primary-red) truncate">
                          {product.name}
                        </p>
                        {product.categoryName && (
                          <span className="text-[10px] text-gray-400 block">
                            {product.categoryName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-gray-700">
                        {product.sellingPrice} ج.س
                      </span>
                      <button
                        type="button"
                        className="p-1 bg-red-50 text-(--primary-red) rounded-lg group-hover:bg-(--primary-red) group-hover:text-white transition"
                      >
                        <LuPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">
                  لا توجد نتائج مطابقة لـ "{searchQuery}"
                </div>
              )}
            </div>

            {/* إغلاق المودال */}
            <div className="pt-2 border-t border-gray-100 text-left">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

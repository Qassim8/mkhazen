"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LuBarcode,
  LuLayers,
  LuDollarSign,
  LuTrendingUp,
  LuTag,
  LuTruck,
  LuStore,
  LuCircleX,
  LuTriangleAlert,
  LuCircleCheck,
  LuBox,
  LuCoins,
  LuQrCode,
  LuPencil,
  LuTrash2,
} from "react-icons/lu";
import { ProductTemplate, ProductVariant } from "../schemas/product.schemas";
import { ProductBarcode } from "./ProductBarcodeCard";

interface ProductDetailsClientProps {
  product: ProductTemplate;
  onEditVariant?: (variant: ProductVariant) => void;
  onDeleteVariant?: (variantId: string) => void;
}

export default function ProductDetailsClient({
  product,
  onEditVariant,
  onDeleteVariant,
}: ProductDetailsClientProps) {
  // 🔹 استخراج المتغيرات مع حماية ضد القيم الفارغة
  const variants = product.variants || [];

  // يتم اعتبار المنتج "متعدد المتغيرات" إذا كان يملك أكثر من متغير واحد، أو متغير واحد بخصائص (Attributes)
  const defaultVariant = variants[0] || ({} as ProductVariant);
  const isMultiVariant =
    variants.length > 1 ||
    (variants.length === 1 &&
      variants[0].attributes &&
      Object.keys(variants[0].attributes).length > 0);

  // 🔹 الحسابات بأمان بدون الوجوع في خطأ TypeScript
  const totalStock = variants.reduce(
    (sum, v) => sum + (v.stockQuantity || 0),
    0,
  );

  const sellingPrices = variants.map((v) => v.sellingPrice || 0);
  const purchasePrices = variants.map((v) => v.purchasePrice || 0);

  const minSellingPrice = sellingPrices.length ? Math.min(...sellingPrices) : 0;
  const maxSellingPrice = sellingPrices.length ? Math.max(...sellingPrices) : 0;
  const minPurchasePrice = purchasePrices.length
    ? Math.min(...purchasePrices)
    : 0;
  const maxPurchasePrice = purchasePrices.length
    ? Math.max(...purchasePrices)
    : 0;

  // القيمة المالية الإجمالية
  const totalCostValue = variants.reduce(
    (sum, v) => sum + (v.stockQuantity || 0) * (v.purchasePrice || 0),
    0,
  );

  const totalSalesValue = variants.reduce(
    (sum, v) => sum + (v.stockQuantity || 0) * (v.sellingPrice || 0),
    0,
  );

  // معرض الصور (تجميع صور القالب والمتغيرات)
  const allImages = [
    ...(product.images || []),
    ...variants.flatMap((v) => v.images || []),
  ].filter(Boolean);

  const [selectedImage, setSelectedImage] = useState<string>(
    allImages[0] || "/placeholder.png",
  );

  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);

  const activeVariant = variants[selectedVariantIndex] || defaultVariant;

  const minStock = product.minStockLevel ?? 5;
  const isOutOfStock = totalStock <= 0;
  const isLowStock = totalStock <= minStock && !isOutOfStock;

  // استخراج الباركود والسعر الحالي بأمان
  const currentBarcode = activeVariant.barcode || product.barcode || "";
  const currentPrice = activeVariant.sellingPrice || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 📌 العمود الأيمن */}
      <div className="lg:col-span-1 space-y-6">
        {/* معرض الصور */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
          <div className="relative aspect-square w-full rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
            <Image
              src={selectedImage}
              alt={product.name}
              fill
              className="object-cover"
              priority
            />
          </div>

          {allImages.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {allImages.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImage(img)}
                  className={`relative h-16 w-16 shrink-0 rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${
                    selectedImage === img
                      ? "border-red-500 ring-2 ring-red-100"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Image
                    src={img}
                    alt={`${product.name} ${idx + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* كارت طباعة الباركود */}
        {currentBarcode && (
          <ProductBarcode
            value={currentBarcode}
            productName={
              activeVariant.attributes &&
              Object.keys(activeVariant.attributes).length > 0
                ? `${product.name} (${Object.values(
                    activeVariant.attributes,
                  ).join(" - ")})`
                : product.name
            }
            price={currentPrice}
          />
        )}

        {/* بطاقة الهيكل والتصنيف */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
            المعلومات الهيكلية
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-1.5">
                <LuTag className="h-4 w-4 text-gray-400" /> الفئة:
              </span>
              <span className="font-bold text-gray-800">
                {product.category?.name || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-1.5">
                <LuTruck className="h-4 w-4 text-gray-400" /> المورد:
              </span>
              <span className="font-bold text-gray-800">
                {product.supplier?.name || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-1.5">
                <LuBarcode className="h-4 w-4 text-gray-400" /> SKU القالب:
              </span>
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded-md font-bold text-gray-700">
                {product.sku || defaultVariant.sku || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-1.5">
                <LuStore className="h-4 w-4 text-gray-400" /> حالة التوفر:
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
                  isOutOfStock
                    ? "bg-red-50 text-red-700 border border-red-100"
                    : isLowStock
                      ? "bg-amber-50 text-amber-700 border border-amber-100"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                }`}
              >
                {isOutOfStock ? (
                  <LuCircleX className="h-3.5 w-3.5" />
                ) : isLowStock ? (
                  <LuTriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <LuCircleCheck className="h-3.5 w-3.5" />
                )}
                {isOutOfStock
                  ? "نفذت الكمية"
                  : isLowStock
                    ? "مخزون منخفض"
                    : "متوفر في المخزن"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 📌 العمود الأيسر */}
      <div className="lg:col-span-2 space-y-6">
        {/* 1️⃣ كروت الإحصائيات السريعة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-1">
            <div className="p-2 w-fit rounded-xl bg-gray-50 text-gray-600 mb-2">
              <LuBox className="h-5 w-5" />
            </div>
            <p className="text-[11px] text-gray-400 font-bold">إجمالي الكمية</p>
            <p className="text-lg font-black text-gray-900">
              {totalStock.toLocaleString()}{" "}
              <span className="text-xs font-medium text-gray-500">
                {product.sellingUnit || "قطعة"}
              </span>
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-1">
            <div className="p-2 w-fit rounded-xl bg-emerald-50 text-emerald-600 mb-2">
              <LuTrendingUp className="h-5 w-5" />
            </div>
            <p className="text-[11px] text-gray-400 font-bold">سعر البيع</p>
            <p className="text-lg font-black text-emerald-600">
              {minSellingPrice === maxSellingPrice
                ? minSellingPrice.toLocaleString()
                : `${minSellingPrice} - ${maxSellingPrice}`}{" "}
              <span className="text-xs font-normal">ريال</span>
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 space-y-1">
            <div className="p-2 w-fit rounded-xl bg-blue-50 text-blue-600 mb-2">
              <LuDollarSign className="h-5 w-5" />
            </div>
            <p className="text-[11px] text-gray-400 font-bold">سعر الشراء</p>
            <p className="text-lg font-black text-gray-900">
              {minPurchasePrice === maxPurchasePrice
                ? minPurchasePrice.toLocaleString()
                : `${minPurchasePrice} - ${maxPurchasePrice}`}{" "}
              <span className="text-xs font-normal">ريال</span>
            </p>
          </div>
        </div>

        {/* 2️⃣ عرض بوكسات المتغيرات (في حال وجود متغيرات متعددة) */}
        {isMultiVariant ? (
          <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <LuLayers className="h-4 w-4 text-red-500" />
                متغيرات المنتج والخيارات المتاحة ({variants.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {variants.map((v, index) => {
                const isSelected = selectedVariantIndex === index;
                const vStock = v.stockQuantity || 0;
                const vIsOutOfStock = vStock <= 0;
                const vIsLowStock = vStock <= minStock && !vIsOutOfStock;
                const vProfit = (v.sellingPrice || 0) - (v.purchasePrice || 0);

                return (
                  <div
                    key={v.id || index}
                    onClick={() => {
                      setSelectedVariantIndex(index);
                      if (v.images && v.images[0]) {
                        setSelectedImage(v.images[0]);
                      }
                    }}
                    className={`relative p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? "border-(--primary-red) bg-red-50/10"
                        : "border-gray-200 bg-gray-50/40 hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-gray-100/80 pb-2.5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                          خيار #{index + 1}
                        </span>
                        <h4 className="text-xs font-bold text-gray-900">
                          {v.attributes && Object.keys(v.attributes).length > 0
                            ? Object.entries(v.attributes)
                                .map(([key, val]) => `${key}: ${val}`)
                                .join(" | ")
                            : `متغير ${index + 1}`}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-lg ${
                            vIsOutOfStock
                              ? "bg-red-100 text-red-700"
                              : vIsLowStock
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {vStock} {product.sellingUnit || "قطعة"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-xl border border-gray-100">
                      <div>
                        <span className="text-gray-400 block text-[10px]">
                          SKU
                        </span>
                        <span className="font-mono font-bold text-gray-700 truncate block">
                          {v.sku || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px] flex items-center gap-1">
                          <LuQrCode className="h-3 w-3" /> الباركود
                        </span>
                        <span className="font-mono font-bold text-gray-700 truncate block">
                          {v.barcode || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-center">
                      <div className="bg-gray-100/70 p-2 rounded-xl">
                        <span className="text-[10px] text-gray-400 block">
                          التكلفة
                        </span>
                        <span className="text-xs font-bold text-gray-700">
                          {v.purchasePrice || 0}
                        </span>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl">
                        <span className="text-[10px] text-emerald-600 block">
                          البيع
                        </span>
                        <span className="text-xs font-black text-emerald-600">
                          {v.sellingPrice || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* 3️⃣ تفاصيل تسعير ومخزون المنتج المفرد (تُقرأ بأمان من defaultVariant) */
          <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
              <LuCoins className="h-4 w-4 text-emerald-600" />
              تفاصيل تسعير ومخزون المنتج المفرد
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">
                  رمز الـ SKU:
                </span>
                <p className="font-mono font-bold text-gray-800 text-sm">
                  {defaultVariant.sku || product.sku || "غير محدد"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">الباركود:</span>
                <p className="font-mono font-bold text-gray-800 text-sm">
                  {defaultVariant.barcode || product.barcode || "غير محدد"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">
                  الكمية بالمخزن:
                </span>
                <p className="font-bold text-gray-900 text-sm">
                  {defaultVariant.stockQuantity ?? 0}{" "}
                  {product.sellingUnit || "قطعة"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">
                  سعر الشراء (التكلفة):
                </span>
                <p className="font-bold text-gray-900 text-sm">
                  {defaultVariant.purchasePrice ?? 0} ريال
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">سعر البيع:</span>
                <p className="font-bold text-emerald-600 text-sm">
                  {defaultVariant.sellingPrice ?? 0} ريال
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-1">
                <span className="text-gray-400 font-semibold">
                  حد الأدنى للمخزون:
                </span>
                <p className="font-bold text-amber-600 text-sm">
                  {minStock} {product.sellingUnit || "قطعة"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4️⃣ تقييم قيمة المخزون الحالي */}
        {/* <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
            تقييم قيمة المخزون الحالي
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100">
              <p className="text-xs text-gray-500 font-semibold">
                إجمالي التكلفة الرأسمالية للمخزون
              </p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {totalCostValue.toLocaleString()}{" "}
                <span className="text-xs font-normal">ريال</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                حساب: (سعر الشراء × الكمية المتاحة لكل متغير)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-semibold">
                العائد المتوقع عند البيع الكامل
              </p>
              <p className="text-xl font-black text-emerald-700 mt-1">
                {totalSalesValue.toLocaleString()}{" "}
                <span className="text-xs font-normal">ريال</span>
              </p>
              <p className="text-[10px] text-emerald-600 mt-1">
                صافي الربح المتوقع:{" "}
                {(totalSalesValue - totalCostValue).toLocaleString()} ريال
              </p>
            </div>
          </div>
        </div> */}

        {/* 5️⃣ التفاصيل والوصف */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
            المواصفات والتعليمات الإضافية
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100">
              <p className="text-gray-400 font-semibold mb-1">وحدات التعامل</p>
              <p className="font-bold text-gray-800">
                وحدة الشراء:{" "}
                <span className="text-red-600">
                  {product.purchaseUnit || "—"}
                </span>{" "}
                | وحدة البيع:{" "}
                <span className="text-red-600">
                  {product.sellingUnit || "—"}
                </span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100">
              <p className="text-gray-400 font-semibold mb-1">
                تنبيه انخفاض المخزون
              </p>
              <p className="font-bold text-gray-800">
                يتم الإشعار عند وصول المخزون لـ{" "}
                <span className="text-amber-600">{minStock}</span>{" "}
                {product.sellingUnit || "قطعة"}
              </p>
            </div>
          </div>

          {product.description && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 font-semibold mb-2">
                وصف المنتج
              </p>
              <div className="p-4 rounded-2xl bg-gray-50/70 border border-gray-100 text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                {product.description}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

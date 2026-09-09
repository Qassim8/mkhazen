"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  LuBarcode,
  LuBox,
  LuCircleCheck,
  LuCircleX,
  LuLayers,
  LuPackage,
  LuTag,
  LuTriangleAlert,
  LuTruck,
} from "react-icons/lu";

import { Product, ProductVariant } from "../schemas/product.schemas";

import { ProductBarcode } from "./ProductBarcodeCard";

type ProductDetails = Product & {
  category?: {
    id?: string;
    name: string;
  } | null;

  supplier?: {
    id?: string;
    name: string;
  } | null;
};

interface ProductDetailsClientProps {
  product: ProductDetails;
}

/* =========================================================
   Helpers
========================================================= */

const getVariantStatus = (variant: ProductVariant) => {
  const stock = Number(variant.stockQuantity ?? 0);

  const minStock = Number(variant.minStockLevel ?? 0);

  const isOutOfStock = stock <= 0;

  const isLowStock = stock > 0 && stock <= minStock;

  return {
    stock,
    minStock,
    isOutOfStock,
    isLowStock,
    label: isOutOfStock ? "نفذت الكمية" : isLowStock ? "مخزون منخفض" : "متوفر",

    className: isOutOfStock
      ? "bg-red-50 text-red-700 border-red-100"
      : isLowStock
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-emerald-50 text-emerald-700 border-emerald-100",

    dotClass: isOutOfStock
      ? "bg-red-500"
      : isLowStock
        ? "bg-amber-500"
        : "bg-emerald-500",
  };
};

const formatPrice = (price: number) => {
  return Number(price ?? 0).toLocaleString();
};

/* =========================================================
   Component
========================================================= */

export default function ProductDetailsClient({
  product,
}: ProductDetailsClientProps) {
  const variants = product.variants ?? [];

  /*
   * According to the business rule:
   * 1 variant  = simple product
   * 2+ variants = product with variants
   */
  const isMultiVariant = variants.length > 1;

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  const activeVariant = variants[selectedVariantIndex] ?? variants[0];

  /* =======================================================
     Images
  ======================================================= */

  const allImages = useMemo(() => {
    const images = [
      ...(product.images ?? []),
      ...variants.flatMap((variant) => variant.images ?? []),
    ];

    return [...new Set(images)].filter(Boolean);
  }, [product.images, variants]);

  const initialImage =
    activeVariant?.images?.[0] ?? allImages[0] ?? "/placeholder.png";

  const [selectedImage, setSelectedImage] = useState(initialImage);

  const selectVariant = (index: number) => {
    setSelectedVariantIndex(index);

    const variant = variants[index];

    /*
     * عندما يكون للـvariant صورة،
     * نعرضها مباشرة.
     */
    if (variant?.images?.[0]) {
      setSelectedImage(variant.images[0]);
      return;
    }

    /*
     * وإلا نرجع لصورة المنتج الرئيسية.
     */
    if (product.images?.[0]) {
      setSelectedImage(product.images[0]);
    }
  };

  /* =======================================================
     Product stock summary
  ======================================================= */

  const activeVariants = variants.filter((variant) => variant.isActive);

  const totalStock = activeVariants.reduce(
    (sum, variant) => sum + Number(variant.stockQuantity ?? 0),
    0,
  );

  const totalMinStock = activeVariants.reduce(
    (sum, variant) => sum + Number(variant.minStockLevel ?? 0),
    0,
  );

  const productIsOutOfStock = activeVariants.length > 0 && totalStock <= 0;

  const productIsLowStock = totalStock > 0 && totalStock <= totalMinStock;

  const productStatusText = productIsOutOfStock
    ? "نفذت الكمية"
    : productIsLowStock
      ? "مخزون منخفض"
      : "متوفر";

  const productStatusClass = productIsOutOfStock
    ? "bg-red-50 text-red-700 border-red-100"
    : productIsLowStock
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-emerald-50 text-emerald-700 border-emerald-100";

  /* =======================================================
     Price summary
  ======================================================= */

  const sellingPrices = variants.map((variant) =>
    Number(variant.sellingPrice ?? 0),
  );

  const minSellingPrice =
    sellingPrices.length > 0 ? Math.min(...sellingPrices) : 0;

  const maxSellingPrice =
    sellingPrices.length > 0 ? Math.max(...sellingPrices) : 0;

  /* =======================================================
     Barcode
  ======================================================= */

  const currentBarcode = activeVariant?.barcode ?? "";

  /* =======================================================
     Render
  ======================================================= */

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ===================================================
          RIGHT COLUMN
      =================================================== */}

      <div className="space-y-6 lg:col-span-1">
        {/* Images */}
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
            <Image
              src={selectedImage || "/placeholder.png"}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover"
              priority
            />
          </div>

          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className={`relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${
                    selectedImage === image
                      ? "border-(--primary-red)"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Image
                    src={image}
                    alt={`${product.name} ${index + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Barcode */}
        {currentBarcode && activeVariant && (
          <ProductBarcode
            value={currentBarcode}
            productName={product.name}
            price={Number(activeVariant.sellingPrice ?? 0)}
          />
        )}
      </div>

      {/* ===================================================
          LEFT COLUMN
      =================================================== */}

      <div className="space-y-6 lg:col-span-2">
        {/* =================================================
            Summary
        ================================================= */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Stock */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 w-fit rounded-xl bg-gray-50 p-2 text-gray-600">
              <LuBox className="h-5 w-5" />
            </div>

            <p className="text-[11px] font-bold text-gray-400">إجمالي الكمية</p>

            <p className="mt-1 text-lg font-black text-gray-900">
              {totalStock.toLocaleString()}{" "}
              <span className="text-xs font-medium text-gray-500">
                {product.sellingUnit ?? "وحدة"}
              </span>
            </p>
          </div>

          {/* Selling price */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 w-fit rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <LuPackage className="h-5 w-5" />
            </div>

            <p className="text-[11px] font-bold text-gray-400">سعر البيع</p>

            <p className="mt-1 text-lg font-black text-emerald-600">
              {minSellingPrice === maxSellingPrice
                ? formatPrice(minSellingPrice)
                : `${formatPrice(minSellingPrice)} - ${formatPrice(
                    maxSellingPrice,
                  )}`}{" "}
              <span className="text-xs font-normal">ريال</span>
            </p>
          </div>

          {/* Status */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 w-fit rounded-xl bg-gray-50 p-2 text-gray-600">
              <LuTriangleAlert className="h-5 w-5" />
            </div>

            <p className="text-[11px] font-bold text-gray-400">حالة المخزون</p>

            <div className="mt-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${productStatusClass}`}
              >
                {productIsOutOfStock ? (
                  <LuCircleX className="h-3.5 w-3.5" />
                ) : productIsLowStock ? (
                  <LuTriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <LuCircleCheck className="h-3.5 w-3.5" />
                )}

                {productStatusText}
              </span>
            </div>
          </div>
        </div>

        {/* =================================================
            Basic information
        ================================================= */}

        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="border-b border-gray-100 pb-3 text-sm font-bold text-gray-900">
            معلومات المنتج
          </h2>

          <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
            {/* Category */}
            <div className="flex items-center justify-between rounded-xl bg-gray-50/70 p-3">
              <span className="flex items-center gap-1.5 text-gray-500">
                <LuTag className="h-4 w-4 text-gray-400" />
                الفئة
              </span>

              <span className="font-bold text-gray-800">
                {product.category?.name ?? "—"}
              </span>
            </div>

            {/* Supplier */}
            <div className="flex items-center justify-between rounded-xl bg-gray-50/70 p-3">
              <span className="flex items-center gap-1.5 text-gray-500">
                <LuTruck className="h-4 w-4 text-gray-400" />
                المورد المفضل
              </span>

              <span className="font-bold text-gray-800">
                {product.supplier?.name ?? "—"}
              </span>
            </div>

            {/* Units */}
            <div className="flex items-center justify-between rounded-xl bg-gray-50/70 p-3">
              <span className="text-gray-500">وحدات التعامل</span>

              <span className="font-bold text-gray-800">
                {product.purchaseUnit ?? "—"} → {product.sellingUnit ?? "—"}
              </span>
            </div>

            {/* Conversion */}
            {product.purchaseUnit !== product.sellingUnit && (
              <div className="flex items-center justify-between rounded-xl bg-gray-50/70 p-3">
                <span className="text-gray-500">معامل التحويل</span>

                <span className="font-bold text-gray-800">
                  1 : {product.conversionFactor ?? "—"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* =================================================
            Variant section
        ================================================= */}

        {isMultiVariant ? (
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <LuLayers className="h-4 w-4 text-red-500" />
                خيارات المنتج
              </h2>

              <span className="text-xs text-gray-400">
                {variants.length} خيارات
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {variants.map((variant, index) => {
                const status = getVariantStatus(variant);

                const isSelected = selectedVariantIndex === index;

                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => selectVariant(index)}
                    className={`text-right rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-(--primary-red) bg-red-50/30"
                        : "border-gray-200 bg-gray-50/40 hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    {/* Variant header */}
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {variant.images?.[0] ? (
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <Image
                              src={variant.images[0]}
                              alt={`${product.name} ${index + 1}`}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
                            <LuPackage className="h-5 w-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                            خيار #{index + 1}
                          </span>

                          <p className="truncate font-mono text-xs font-bold text-gray-700">
                            {variant.sku || "بدون SKU"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    {/* Attributes */}
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {variant.colorName && (
                        <div className="rounded-xl border border-gray-100 bg-white p-2.5">
                          <span className="mb-1 block text-[10px] text-gray-400">
                            اللون
                          </span>

                          <div className="flex items-center gap-2">
                            {variant.colorCode && (
                              <span
                                className="h-4 w-4 rounded-full border border-gray-200"
                                style={{
                                  backgroundColor: variant.colorCode,
                                }}
                              />
                            )}

                            <span className="truncate text-xs font-bold text-gray-700">
                              {variant.colorName}
                            </span>
                          </div>
                        </div>
                      )}

                      {variant.size && (
                        <div className="rounded-xl border border-gray-100 bg-white p-2.5">
                          <span className="mb-1 block text-[10px] text-gray-400">
                            المقاس
                          </span>

                          <span className="text-xs font-bold text-gray-700">
                            {variant.size}
                          </span>
                        </div>
                      )}

                      {variant.length !== null &&
                        variant.length !== undefined && (
                          <div className="rounded-xl border border-gray-100 bg-white p-2.5">
                            <span className="mb-1 block text-[10px] text-gray-400">
                              الطول
                            </span>

                            <span className="text-xs font-bold text-gray-700">
                              {variant.length}
                            </span>
                          </div>
                        )}

                      {variant.width !== null &&
                        variant.width !== undefined && (
                          <div className="rounded-xl border border-gray-100 bg-white p-2.5">
                            <span className="mb-1 block text-[10px] text-gray-400">
                              العرض
                            </span>

                            <span className="text-xs font-bold text-gray-700">
                              {variant.width}
                            </span>
                          </div>
                        )}
                    </div>

                    {/* Price + stock */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-gray-50 p-2">
                        <span className="block text-[10px] text-gray-400">
                          المخزون
                        </span>

                        <span className="text-xs font-black text-gray-800">
                          {status.stock}
                        </span>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-2">
                        <span className="block text-[10px] text-gray-400">
                          الشراء
                        </span>

                        <span className="text-xs font-bold text-gray-700">
                          {formatPrice(Number(variant.purchasePrice))}
                        </span>
                      </div>

                      <div className="rounded-xl bg-emerald-50 p-2">
                        <span className="block text-[10px] text-emerald-600">
                          البيع
                        </span>

                        <span className="text-xs font-black text-emerald-600">
                          {formatPrice(Number(variant.sellingPrice))}
                        </span>
                      </div>
                    </div>

                    {/* Barcode */}
                    {variant.barcode && (
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <LuBarcode className="h-3.5 w-3.5" />
                          الباركود
                        </span>

                        <span className="font-mono text-[10px] font-bold text-gray-700">
                          {variant.barcode}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* =================================================
             Single product
          ================================================= */

          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-900">تفاصيل المنتج</h2>

              <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-500">
                منتج مفرد
              </span>
            </div>

            {activeVariant ? (
              <SingleVariantDetails
                variant={activeVariant}
                sellingUnit={product.sellingUnit}
              />
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-400">
                لا توجد بيانات للمنتج.
              </div>
            )}
          </div>
        )}

        {/* =================================================
            Description
        ================================================= */}

        {product.description && (
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="border-b border-gray-100 pb-3 text-sm font-bold text-gray-900">
              وصف المنتج
            </h2>

            <p className="whitespace-pre-line text-xs leading-7 text-gray-600">
              {product.description}
            </p>
          </div>
        )}

        {/* Product visibility */}
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <p className="text-xs font-bold text-gray-800">حالة المنتج</p>

            <p className="mt-1 text-[11px] text-gray-400">
              حالة المنتج في النظام والمتجر
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                product.isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {product.isActive ? "نشط" : "غير نشط"}
            </span>

            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                product.isVisible
                  ? "bg-blue-50 text-blue-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {product.isVisible ? "ظاهر في المتجر" : "مخفي"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Single Variant Details
========================================================= */

interface SingleVariantDetailsProps {
  variant: ProductVariant;
  sellingUnit: string | null;
}

function SingleVariantDetails({
  variant,
  sellingUnit,
}: SingleVariantDetailsProps) {
  const status = getVariantStatus(variant);

  return (
    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <DetailCard
        label="SKU"
        value={variant.sku || "غير محدد"}
        mono
        icon={<LuBarcode className="h-4 w-4" />}
      />

      <DetailCard label="الباركود" value={variant.barcode || "غير محدد"} mono />

      <DetailCard
        label="المخزون"
        value={`${status.stock.toLocaleString()} ${sellingUnit ?? "وحدة"}`}
      />

      <DetailCard
        label="الحد الأدنى للمخزون"
        value={`${status.minStock.toLocaleString()} ${sellingUnit ?? "وحدة"}`}
      />

      <DetailCard
        label="سعر الشراء"
        value={`${formatPrice(Number(variant.purchasePrice))} ريال`}
      />

      <DetailCard
        label="سعر البيع"
        value={`${formatPrice(Number(variant.sellingPrice))} ريال`}
        valueClassName="text-emerald-600"
      />

      {variant.minSellingPrice !== null &&
        variant.minSellingPrice !== undefined && (
          <DetailCard
            label="الحد الأدنى لسعر البيع"
            value={`${formatPrice(Number(variant.minSellingPrice))} ريال`}
          />
        )}

      {variant.colorName && (
        <DetailCard label="اللون" value={variant.colorName} />
      )}

      {variant.size && <DetailCard label="المقاس" value={variant.size} />}

      {variant.length !== null && variant.length !== undefined && (
        <DetailCard label="الطول" value={String(variant.length)} />
      )}

      {variant.width !== null && variant.width !== undefined && (
        <DetailCard label="العرض" value={String(variant.width)} />
      )}
    </div>
  );
}

/* =========================================================
   Detail Card
========================================================= */

interface DetailCardProps {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
  valueClassName?: string;
}

function DetailCard({
  label,
  value,
  mono = false,
  icon,
  valueClassName = "text-gray-800",
}: DetailCardProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3.5">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
        {icon}
        {label}
      </span>

      <p
        className={`mt-1 text-sm font-bold ${valueClassName} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

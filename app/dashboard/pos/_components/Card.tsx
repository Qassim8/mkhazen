"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import {
  LuCheck,
  LuChevronLeft,
  LuPlus,
  LuSearch,
  LuX,
} from "react-icons/lu";

import type {
  Product,
  ProductVariant,
} from "../../products/schemas/product.schemas";
import { formatSDG, formatUSD, usdToSdg } from "@/lib/currency";

interface CardProps {
  product: Product;
  onAdd: (product: Product, variant: ProductVariant) => void;
  /** سعر الصرف الحالي (ج.س لكل 1$) — أسعار المنتجات مخزنة بالدولار */
  exchangeRate: number | null;
}

function getVariantImage(product: Product, variant: ProductVariant): string {
  return (
    variant.images?.[0] ??
    product.images?.[0] ??
    "/images/placeholder.png"
  );
}

function getVariantLabel(variant: ProductVariant): string {
  const parts: string[] = [];

  if (variant.colorName) {
    parts.push(variant.colorName);
  }

  if (variant.size) {
    parts.push(`مقاس ${variant.size}`);
  }

  if (variant.length !== null && variant.length !== undefined) {
    parts.push(`طول ${variant.length}`);
  }

  if (variant.width !== null && variant.width !== undefined) {
    parts.push(`عرض ${variant.width}`);
  }

  return parts.length > 0 ? parts.join(" • ") : "متغير افتراضي";
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(2)).toString();
}

/** نطاق سعر البيع بالجنيه (محسوب من سعر الدولار × سعر الصرف الحالي) */
function formatPriceRange(
  variants: ProductVariant[],
  exchangeRate: number | null,
): string {
  const prices = variants
    .map((variant) => usdToSdg(variant.sellingPrice, exchangeRate))
    .filter((price) => Number.isFinite(price));

  if (prices.length === 0 || !exchangeRate) {
    return "—";
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const format = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

  if (Math.abs(min - max) < 0.001) {
    return format(min);
  }

  return `${format(min)} – ${format(max)}`;
}

export default function Card({ product, onAdd, exchangeRate }: CardProps) {
  const [isVariantPickerOpen, setIsVariantPickerOpen] = useState(false);
  const [variantSearch, setVariantSearch] = useState("");

  const activeVariants = useMemo(
    () => product.variants.filter((variant) => variant.isActive),
    [product.variants],
  );

  const availableVariants = useMemo(
    () => activeVariants.filter((variant) => Number(variant.stockQuantity) > 0),
    [activeVariants],
  );

  const totalStock = activeVariants.reduce(
    (sum, variant) => sum + Number(variant.stockQuantity ?? 0),
    0,
  );

  const productOutOfStock =
    activeVariants.length === 0 || availableVariants.length === 0;

  const hasMultipleVariants = activeVariants.length > 1;

  const filteredVariants = useMemo(() => {
    const term = variantSearch.trim().toLowerCase();

    if (!term) {
      return activeVariants;
    }

    return activeVariants.filter((variant) => {
      const haystack = [
        getVariantLabel(variant),
        variant.sku ?? "",
        variant.barcode ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [activeVariants, variantSearch]);

  const closeVariantPicker = () => {
    setIsVariantPickerOpen(false);
    setVariantSearch("");
  };

  const handleMainAction = () => {
    if (productOutOfStock) {
      return;
    }

    if (!hasMultipleVariants) {
      const variant = availableVariants[0];

      if (variant) {
        onAdd(product, variant);
      }

      return;
    }

    setIsVariantPickerOpen(true);
  };

  const handleVariantAdd = (variant: ProductVariant) => {
    if (Number(variant.stockQuantity) <= 0) {
      return;
    }

    onAdd(product, variant);
    closeVariantPicker();
  };

  return (
    <>
      <div className="group flex min-h-[305px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
        <div className="relative h-36 w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          <Image
            src={
              product.images?.[0] ??
              activeVariants[0]?.images?.[0] ??
              "/images/placeholder.png"
            }
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {productOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-red-600">
                غير متوفر
              </span>
            </div>
          )}

          {hasMultipleVariants && !productOutOfStock && (
            <span className="absolute right-2 top-2 rounded-lg border border-white/60 bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              {activeVariants.length} متغير
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-1 flex-col">
          <div>
            <h3 className="line-clamp-2 text-sm font-bold leading-tight text-gray-900">
              {product.name}
            </h3>

            {product.description && (
              <p className="mt-1 line-clamp-1 text-[10px] text-gray-400">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-auto pt-3">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px] text-gray-400">
              <span>
                {activeVariants.length === 0
                  ? "لا توجد متغيرات"
                  : `${activeVariants.length} ${
                      activeVariants.length === 1 ? "متغير" : "متغيرات"
                    }`}
              </span>
              <span>المخزون: {formatQuantity(totalStock)}</span>
            </div>

            <div className="mb-2.5 flex items-end justify-between gap-2">
              <div>
                <span className="text-[9px] text-gray-400">سعر البيع</span>
                <div className="text-sm font-black text-emerald-600">
                  {formatPriceRange(activeVariants, exchangeRate)}
                  <span className="mr-1 text-[9px] font-bold text-gray-400">
                    ج.س
                  </span>
                </div>
              </div>

              {hasMultipleVariants && !productOutOfStock && (
                <span className="rounded-lg bg-gray-50 px-2 py-1 text-[9px] font-bold text-gray-500">
                  اختر المتغير
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={productOutOfStock}
              onClick={handleMainAction}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <LuPlus className="h-4 w-4" />
              {hasMultipleVariants ? "اختيار المتغير وإضافة" : "إضافة للسلة"}
            </button>
          </div>
        </div>
      </div>

      {isVariantPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`variant-picker-${product.id}`}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400">اختيار المتغير</p>
                <h2
                  id={`variant-picker-${product.id}`}
                  className="mt-1 truncate text-base font-black text-gray-900"
                >
                  {product.name}
                </h2>
                <p className="mt-1 text-[10px] text-gray-400">
                  اختر اللون أو المقاس أو المواصفة المطلوبة ثم أضفها للسلة.
                </p>
              </div>

              <button
                type="button"
                onClick={closeVariantPicker}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                aria-label="إغلاق اختيار المتغير"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-gray-100 px-5 py-3">
              <div className="relative">
                <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={variantSearch}
                  onChange={(event) => setVariantSearch(event.target.value)}
                  placeholder="ابحث داخل المتغيرات..."
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-10 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-(--primary-red) focus:bg-white"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {filteredVariants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
                  <p className="text-xs font-bold text-gray-500">
                    لا يوجد متغير مطابق للبحث.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredVariants.map((variant) => {
                    const stock = Number(variant.stockQuantity ?? 0);
                    const outOfStock = stock <= 0;
                    const label = getVariantLabel(variant);

                    return (
                      <div
                        key={variant.id}
                        className={`flex min-h-[92px] gap-3 rounded-2xl border p-2.5 transition ${
                          outOfStock
                            ? "border-gray-100 bg-gray-50 opacity-60"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                          <Image
                            src={getVariantImage(product, variant)}
                            alt={`${product.name} - ${label}`}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[11px] font-bold text-gray-800">
                            {label}
                          </div>

                          {variant.sku && (
                            <div className="mt-0.5 truncate text-[9px] text-gray-400">
                              SKU: {variant.sku}
                            </div>
                          )}

                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[11px] font-black text-emerald-600">
                              {exchangeRate
                                ? formatSDG(usdToSdg(variant.sellingPrice, exchangeRate))
                                : formatUSD(variant.sellingPrice)}
                            </span>
                            <span
                              className={`text-[9px] font-semibold ${
                                outOfStock ? "text-red-500" : "text-gray-400"
                              }`}
                            >
                              المخزون: {formatQuantity(stock)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => handleVariantAdd(variant)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-xl bg-(--primary-red) text-white shadow-sm transition hover:opacity-90 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
                          aria-label={`إضافة ${product.name} - ${label}`}
                        >
                          {outOfStock ? (
                            <LuChevronLeft className="h-4 w-4 opacity-50" />
                          ) : (
                            <LuCheck className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-5 py-3 text-[10px] text-gray-500">
              <span>{activeVariants.length} متغير إجمالاً</span>
              <button
                type="button"
                onClick={closeVariantPicker}
                className="rounded-lg px-3 py-1.5 font-bold text-gray-600 transition hover:bg-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

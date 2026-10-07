"use client";

import Image from "next/image";

import { LuPlus } from "react-icons/lu";

import type {
  Product,
  ProductVariant,
} from "../../products/schemas/product.schemas";

interface CardProps {
  product: Product;

  onAdd: (product: Product, variant: ProductVariant) => void;
}

function getVariantImage(product: Product, variant: ProductVariant): string {
  return (
    variant.images?.[0] ?? product.images?.[0] ?? "/images/placeholder.png"
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

  return parts.length > 0 ? parts.join(" • ") : "متغير";
}

export default function Card({ product, onAdd }: CardProps) {
  const activeVariants = product.variants.filter((variant) => variant.isActive);

  const totalStock = activeVariants.reduce(
    (sum, variant) => sum + Number(variant.stockQuantity ?? 0),
    0,
  );

  const productOutOfStock = activeVariants.length === 0 || totalStock <= 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-col overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* =================================================
          Product Header
      ================================================= */}

      <div>
        <div className="relative w-full h-32 sm:h-40 rounded-xl bg-(--primary-red)/5 overflow-hidden border border-gray-50">
          <Image
            src={
              product.images?.[0] ??
              activeVariants[0]?.images?.[0] ??
              "/images/placeholder.png"
            }
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />

          {productOutOfStock && (
            <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
              <span className="bg-white text-red-600 text-xs font-black px-3 py-1.5 rounded-lg">
                غير متوفر
              </span>
            </div>
          )}
        </div>

        <div className="mt-2.5">
          <h3 className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">
            {product.name}
          </h3>

          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[10px] text-gray-400">
              {activeVariants.length}{" "}
              {activeVariants.length === 1 ? "متغير" : "متغيرات"}
            </span>

            <span className="text-[10px] text-gray-400">
              المخزون: {totalStock}
            </span>
          </div>
        </div>
      </div>

      {/* =================================================
          Variants
      ================================================= */}

      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
        {activeVariants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-4 text-center">
            <span className="text-[10px] font-semibold text-gray-400">
              لا توجد متغيرات نشطة للبيع
            </span>
          </div>
        ) : (
          activeVariants.map((variant) => {
            const stock = Number(variant.stockQuantity ?? 0);

            const outOfStock = stock <= 0;

            return (
              <div
                key={variant.id}
                className={`rounded-xl border p-2.5 transition ${
                  outOfStock
                    ? "border-gray-100 bg-gray-50/70 opacity-60"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Variant Image */}

                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gray-50 border border-gray-100">
                    <Image
                      src={getVariantImage(product, variant)}
                      alt={`${product.name} - ${getVariantLabel(variant)}`}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  </div>

                  {/* Variant Information */}

                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-gray-800 truncate">
                      {getVariantLabel(variant)}
                    </div>

                    {variant.sku && (
                      <div className="text-[9px] text-gray-400 truncate mt-0.5">
                        {variant.sku}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-black text-emerald-600">
                        {Number(variant.sellingPrice).toFixed(2)}
                      </span>

                      <span
                        className={`text-[9px] font-semibold ${
                          outOfStock ? "text-red-500" : "text-gray-400"
                        }`}
                      >
                        المخزون: {stock}
                      </span>
                    </div>
                  </div>

                  {/* Add Variant */}

                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => onAdd(product, variant)}
                    className="h-8 w-8 shrink-0 text-white bg-(--primary-red) rounded-xl flex items-center justify-center cursor-pointer transition active:scale-90 hover:opacity-90 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`إضافة ${product.name} - ${getVariantLabel(variant)}`}
                  >
                    <LuPlus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

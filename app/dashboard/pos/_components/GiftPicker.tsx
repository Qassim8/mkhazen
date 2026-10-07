"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  LuCheck,
  LuGift,
  LuMinus,
  LuPlus,
  LuSearch,
  LuX,
} from "react-icons/lu";
import toast from "react-hot-toast";
import type {
  Product,
  ProductVariant,
} from "../../products/schemas/product.schemas";
import { createPortal } from "react-dom";
import { getProducts } from "@/app/dashboard/products/services/products.services";
import {
  formatProductSize,
  isCustomProductSize,
} from "../../products/utils/product-size";

const subscribeToNothing = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface GiftPickerProps {
  initialProducts: Product[];
  onClose: () => void;
  onAddGift: (
    product: Product,
    variant: ProductVariant,
    quantity: number,
    giftNote: string | null,
  ) => boolean;
}

function getVariantImage(product: Product, variant: ProductVariant) {
  return (
    variant.images?.[0] ?? product.images?.[0] ?? "/images/placeholder.png"
  );
}

function getVariantLabel(variant: ProductVariant) {
  const parts: string[] = [];
  if (variant.colorName) parts.push(variant.colorName);
  const size = formatProductSize(variant.size);
  if (size) {
    parts.push(`${isCustomProductSize(variant.size) ? "مقاسات" : "مقاس"} ${size}`);
  }
  if (variant.length !== null && variant.length !== undefined) {
    parts.push(`طول ${variant.length}`);
  }
  if (variant.width !== null && variant.width !== undefined) {
    parts.push(`عرض ${variant.width}`);
  }
  return parts.length > 0 ? parts.join(" • ") : "متغير افتراضي";
}

function isMeterBasedProduct(product: Product) {
  const unit = product.sellingUnit?.trim().toLowerCase();
  return ["متر", "م", "meter", "meters", "m"].includes(unit ?? "");
}

export default function GiftPicker({
  initialProducts,
  onClose,
  onAddGift,
}: GiftPickerProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [giftNote, setGiftNote] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot,
  );

  const availableProducts = useMemo(
    () =>
      products
        .map((product) => ({
          ...product,
          variants: product.variants.filter(
            (variant) => variant.isActive && Number(variant.stockQuantity) > 0,
          ),
        }))
        .filter((product) => product.variants.length > 0),
    [products],
  );

  const selectedVariant = useMemo(
    () =>
      selectedProduct?.variants.find(
        (variant) => variant.id === selectedVariantId,
      ) ?? null,
    [selectedProduct, selectedVariantId],
  );

  const maxQuantity = Number(selectedVariant?.stockQuantity ?? 0);
  const meterProduct = selectedProduct
    ? isMeterBasedProduct(selectedProduct)
    : false;

  const searchProducts = async (term: string) => {
    const normalized = term.trim();
    if (!normalized) {
      setProducts(initialProducts);
      return;
    }

    setIsSearching(true);
    try {
      const result = await getProducts({
        search: normalized,
        page: 1,
        limit: 100,
      });
      setProducts(result.data);
      setSelectedProduct(null);
      setSelectedVariantId("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "حدث خطأ أثناء البحث عن المنتجات",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    const onlyVariant =
      product.variants.length === 1 ? product.variants[0] : null;
    setSelectedProduct(product);
    setSelectedVariantId(onlyVariant?.id ?? "");
    setQuantity(
      onlyVariant ? Math.min(1, Number(onlyVariant.stockQuantity)) : 1,
    );
  };

  const handleAdd = () => {
    if (!selectedProduct || !selectedVariant) {
      toast.error("اختر المنتج والمتغير أولًا");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("كمية الهدية يجب أن تكون أكبر من صفر");
      return;
    }

    const normalizedQuantity = Number(quantity.toFixed(2));
    if (normalizedQuantity > maxQuantity + 0.000001) {
      toast.error(`المخزون المتاح فقط ${maxQuantity}`);
      return;
    }

    const added = onAddGift(
      selectedProduct,
      selectedVariant,
      normalizedQuantity,
      giftNote.trim() || null,
    );
    if (added) {
      onClose();
    }
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-picker-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <LuGift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400">
                  نقطة البيع
                </p>
                <h2
                  id="gift-picker-title"
                  className="text-base font-black text-gray-900"
                >
                  إضافة هدية
                </h2>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              اختر صنفًا من المخزون ليتم سحبه كهدية بسعر صفر وإظهاره في
              الفاتورة.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
            aria-label="إغلاق إضافة الهدية"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void searchProducts(search);
            }}
          >
            <div className="relative">
              <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث عن المنتج أو امسح الباركود..."
                autoFocus
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-10 py-2.5 pl-20 text-xs font-medium text-gray-900 outline-none transition focus:border-(--primary-red) focus:bg-white"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg bg-gray-900 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {isSearching ? "..." : "بحث"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1.1fr)_minmax(0,0.9fr)] overflow-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:grid-rows-1">
          <div className="min-h-0 overflow-y-auto border-b border-gray-100 p-5 lg:border-b-0 lg:border-l">
            {availableProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
                <p className="text-xs font-bold text-gray-500">
                  لا توجد منتجات متاحة في المخزون.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product)}
                    className={`flex gap-3 rounded-2xl border p-2.5 text-right transition ${
                      selectedProduct?.id === product.id
                        ? "border-(--primary-red) bg-(--primary-red)/5"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                      <Image
                        src={getVariantImage(product, product.variants[0])}
                        alt={product.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-[11px] font-bold text-gray-800">
                          {product.name}
                        </span>
                        {selectedProduct?.id === product.id && (
                          <LuCheck className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-red)" />
                        )}
                      </div>
                      <p className="mt-1 text-[9px] text-gray-400">
                        {product.variants.length} متغير متاح
                      </p>
                      <p className="mt-1 text-[9px] font-semibold text-gray-500">
                        إجمالي المخزون:{" "}
                        {product.variants.reduce(
                          (sum, variant) => sum + Number(variant.stockQuantity),
                          0,
                        )}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto bg-gray-50/60 p-5">
            {!selectedProduct ? (
              <div className="flex h-full min-h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 text-center">
                <div>
                  <LuGift className="mx-auto h-8 w-8 text-amber-500 opacity-60" />
                  <p className="mt-3 text-xs font-bold text-gray-500">
                    اختر منتجًا لإضافته كهدية
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">
                    سيتم استخدام تكلفة الصنف الحالية من قاعدة البيانات عند إتمام
                    البيع.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                      <Image
                        src={
                          selectedVariant
                            ? getVariantImage(selectedProduct, selectedVariant)
                            : (selectedProduct.images?.[0] ??
                              "/images/placeholder.png")
                        }
                        alt={selectedProduct.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-gray-400">
                        المنتج المختار
                      </p>
                      <p className="mt-0.5 truncate text-xs font-black text-gray-900">
                        {selectedProduct.name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="mb-2 block text-[10px] font-bold text-gray-700">
                    المتغير
                  </label>
                  <select
                    value={selectedVariantId}
                    onChange={(event) => {
                      const variantId = event.target.value;
                      const variant = selectedProduct.variants.find(
                        (candidate) => candidate.id === variantId,
                      );
                      setSelectedVariantId(variantId);
                      setQuantity(
                        variant
                          ? Math.min(1, Number(variant.stockQuantity))
                          : 1,
                      );
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:border-(--primary-red)"
                  >
                    <option value="">اختر المتغير</option>
                    {selectedProduct.variants
                      .filter(
                        (variant) =>
                          variant.isActive && Number(variant.stockQuantity) > 0,
                      )
                      .map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {getVariantLabel(variant)} — المخزون{" "}
                          {variant.stockQuantity}
                        </option>
                      ))}
                  </select>
                </div>

                {selectedVariant && (
                  <>
                    <div className="rounded-2xl border border-gray-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="text-[10px] font-bold text-gray-700">
                          الكمية
                        </label>
                        <span className="text-[9px] text-gray-400">
                          المتاح: {maxQuantity}
                        </span>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity((current) =>
                              Math.max(
                                0.01,
                                Number(
                                  (current - (meterProduct ? 0.01 : 1)).toFixed(
                                    2,
                                  ),
                                ),
                              ),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
                          aria-label="إنقاص كمية الهدية"
                        >
                          <LuMinus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0.01"
                          max={maxQuantity}
                          step={meterProduct ? "0.01" : "1"}
                          inputMode="decimal"
                          value={quantity}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setQuantity(Number.isFinite(value) ? value : 0);
                          }}
                          className="h-9 w-28 rounded-xl border border-gray-200 bg-gray-50 text-center text-xs font-black text-gray-900 outline-none focus:border-(--primary-red) focus:bg-white"
                          aria-label="كمية الهدية"
                        />
                        <button
                          type="button"
                          disabled={quantity >= maxQuantity}
                          onClick={() =>
                            setQuantity((current) =>
                              Math.min(
                                maxQuantity,
                                Number(
                                  (current + (meterProduct ? 0.01 : 1)).toFixed(
                                    2,
                                  ),
                                ),
                              ),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="زيادة كمية الهدية"
                        >
                          <LuPlus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-3">
                      <label
                        htmlFor="gift-note"
                        className="mb-2 block text-[10px] font-bold text-gray-700"
                      >
                        ملاحظة / سبب الهدية{" "}
                        <span className="font-normal text-gray-400">
                          (اختياري)
                        </span>
                      </label>
                      <textarea
                        id="gift-note"
                        value={giftNote}
                        onChange={(event) => setGiftNote(event.target.value)}
                        maxLength={500}
                        rows={4}
                        placeholder="مثال: هدية للعميلة بمناسبة المناسبة"
                        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-900 outline-none transition focus:border-(--primary-red) focus:bg-white"
                      />
                      <p className="mt-1 text-left text-[9px] text-gray-400">
                        {giftNote.length}/500
                      </p>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-amber-800">
                          قيمة الهدية على الفاتورة
                        </span>
                        <span className="text-sm font-black text-amber-700">
                          0.00 ج.س
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] text-amber-700/80">
                        سيتم خصم تكلفة المنتج من المخزون وتسجيلها كمصروف هدايا
                        محاسبيًا.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAdd}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-(--primary-red) py-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
                    >
                      <LuGift className="h-4 w-4" />
                      إضافة الهدية للسلة
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-3">
          <span className="text-[10px] text-gray-400">
            الهدية لا تؤثر على إجمالي الفاتورة.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-600 transition hover:bg-gray-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

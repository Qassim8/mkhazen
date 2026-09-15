"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  inventoryAdjustmentSchema,
  InventoryAdjustmentInput,
} from "../schema/inventory.schemas";

import {
  createInventoryAdjustment,
  InventoryVariant,
} from "../services/inventory.services";

import {
  LuArrowDownToLine,
  LuArrowUpFromLine,
  LuLoader,
  LuSearch,
  LuX,
} from "react-icons/lu";

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  variants: InventoryVariant[];
  selectedVariant?: InventoryVariant | null;
  onSuccess?: () => void;
}

export default function AdjustmentModal({
  isOpen,
  onClose,
  variants,
  selectedVariant = null,
  onSuccess,
}: AdjustmentModalProps) {
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InventoryAdjustmentInput>({
    resolver: zodResolver(inventoryAdjustmentSchema),

    defaultValues: {
      variantId: selectedVariant?.id || "",

      adjustmentType: "IN",

      quantity: 0,

      notes: "",
    },
  });

  const selectedVariantId = watch("variantId");

  const adjustmentType = watch("adjustmentType");

  const quantity = Number(watch("quantity") || 0);

  const currentVariant =
    variants.find((variant) => variant.id === selectedVariantId) ||
    selectedVariant;

  const currentStock = Number(currentVariant?.stockQuantity || 0);

  const willExceedStock = adjustmentType === "OUT" && quantity > currentStock;

  /* =========================================================
     RESET WHEN OPENING
  ========================================================= */

  useEffect(() => {
    if (!isOpen) return;

    reset({
      variantId: selectedVariant?.id || "",

      adjustmentType: "IN",

      quantity: 0,

      notes: "",
    });

    setSearchQuery(selectedVariant ? getVariantLabel(selectedVariant) : "");

    setIsDropdownOpen(false);
  }, [isOpen, selectedVariant, reset]);

  /* =========================================================
     CLOSE DROPDOWN
  ========================================================= */

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredVariants = useMemo(() => {
    if (!searchQuery.trim()) {
      return variants.slice(0, 20);
    }

    const q = searchQuery.trim().toLowerCase();

    return variants
      .filter((variant) => {
        const productName = variant.product_templates?.name || "";

        const sku = variant.sku || "";

        const barcode = variant.barcode || "";

        const packBarcode = variant.packBarcode || "";

        const color = variant.colorName || "";

        const size = variant.size || "";

        return (
          productName.toLowerCase().includes(q) ||
          sku.toLowerCase().includes(q) ||
          barcode.toLowerCase().includes(q) ||
          packBarcode.toLowerCase().includes(q) ||
          color.toLowerCase().includes(q) ||
          size.toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [variants, searchQuery]);

  /* =========================================================
     SUBMIT
  ========================================================= */

  const onSubmit = (data: InventoryAdjustmentInput) => {
    if (willExceedStock) {
      return;
    }

    startTransition(async () => {
      try {
        await createInventoryAdjustment(data);

        reset();

        setSearchQuery("");

        onClose();

        onSuccess?.();
      } catch (error) {
        console.error("فشل إجراء التسوية المخزنية:", error);
      }
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        dir="rtl"
        className="w-full max-w-xl overflow-visible rounded-2xl border border-gray-100 bg-white shadow-xl"
      >
        {/* =================================================
            HEADER
        ================================================== */}

        <div className="flex items-start justify-between border-b border-gray-100 p-6">
          <div>
            <h3 className="text-lg font-bold text-gray-950">تسوية مخزنية</h3>

            <p className="mt-1 text-xs text-gray-500">
              تسجيل زيادة أو نقص في رصيد المخزون
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* =================================================
            FORM
        ================================================== */}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6">
          {/* =================================================
              PRODUCT SEARCH
          ================================================== */}

          <div ref={dropdownRef} className="relative">
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              الصنف
            </label>

            <div className="relative">
              <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="text"
                value={searchQuery}
                disabled={isPending || Boolean(selectedVariant)}
                placeholder="ابحث باسم المنتج، SKU، الباركود..."
                onFocus={() => {
                  if (!selectedVariant) {
                    setIsDropdownOpen(true);
                  }
                }}
                onChange={(event) => {
                  setSearchQuery(event.target.value);

                  setValue("variantId", "", {
                    shouldValidate: true,
                  });

                  setIsDropdownOpen(true);
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-4 pr-10 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </div>

            {/* Hidden form value */}
            <input type="hidden" {...register("variantId")} />

            {isDropdownOpen && !selectedVariant && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-xl ring-1 ring-black/5">
                {filteredVariants.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    لا توجد نتائج مطابقة
                  </div>
                ) : (
                  filteredVariants.map((variant) => {
                    const productName =
                      variant.product_templates?.name || "منتج";

                    const attributes = [
                      variant.colorName && `اللون: ${variant.colorName}`,

                      variant.size && `المقاس: ${variant.size}`,
                    ]
                      .filter(Boolean)
                      .join(" | ");

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => {
                          setValue("variantId", variant.id, {
                            shouldValidate: true,
                          });

                          setSearchQuery(getVariantLabel(variant));

                          setIsDropdownOpen(false);
                        }}
                        className="flex w-full flex-col gap-1 rounded-lg border-b border-gray-50 px-3 py-2.5 text-right transition last:border-none hover:bg-red-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {productName}
                          </span>

                          <span className="shrink-0 font-mono text-xs text-gray-500">
                            {variant.stockQuantity}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          {attributes && <span>{attributes}</span>}

                          {variant.sku && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                              SKU: {variant.sku}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {errors.variantId && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.variantId.message}
              </p>
            )}
          </div>

          {/* =================================================
              CURRENT STOCK
          ================================================== */}

          {currentVariant && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {currentVariant.product_templates?.name}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {[currentVariant.colorName, currentVariant.size]
                      .filter(Boolean)
                      .join(" | ") || "المتغير الأساسي"}
                  </p>
                </div>

                <div className="shrink-0 text-left">
                  <p className="text-xs text-gray-500">المخزون الحالي</p>

                  <p className="mt-1 font-mono text-lg font-bold text-gray-900">
                    {currentStock.toLocaleString("en-US")}

                    {currentVariant.product_templates?.sellingUnit && (
                      <span className="mr-1 text-xs font-normal text-gray-400">
                        {currentVariant.product_templates.sellingUnit}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              TYPE
          ================================================== */}

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              نوع التسوية
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  adjustmentType === "IN"
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  value="IN"
                  {...register("adjustmentType")}
                  disabled={isPending}
                  className="accent-emerald-600"
                />

                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <LuArrowDownToLine className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-800">إدخال</p>

                  <p className="text-xs text-gray-500">زيادة المخزون</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                  adjustmentType === "OUT"
                    ? "border-rose-300 bg-rose-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  value="OUT"
                  {...register("adjustmentType")}
                  disabled={isPending}
                  className="accent-rose-600"
                />

                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <LuArrowUpFromLine className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-800">إخراج</p>

                  <p className="text-xs text-gray-500">نقص المخزون</p>
                </div>
              </label>
            </div>

            {errors.adjustmentType && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.adjustmentType.message}
              </p>
            )}
          </div>

          {/* =================================================
              QUANTITY
          ================================================== */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              الكمية
            </label>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="مثال: 5"
              {...register("quantity", {
                valueAsNumber: true,
              })}
              disabled={isPending}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />

            {errors.quantity && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.quantity.message}
              </p>
            )}

            {willExceedStock && (
              <p className="mt-1 text-xs text-rose-500">
                لا يمكن إخراج كمية أكبر من المخزون الحالي
              </p>
            )}
          </div>

          {/* =================================================
              PREVIEW
          ================================================== */}

          {currentVariant && quantity > 0 && !willExceedStock && (
            <div
              className={`rounded-xl border px-4 py-3 ${
                adjustmentType === "IN"
                  ? "border-emerald-100 bg-emerald-50"
                  : "border-rose-100 bg-rose-50"
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">الرصيد بعد التسوية</span>

                <span className="font-mono font-bold text-gray-900">
                  {(adjustmentType === "IN"
                    ? currentStock + quantity
                    : currentStock - quantity
                  ).toLocaleString("en-US")}
                </span>
              </div>
            </div>
          )}

          {/* =================================================
              NOTES
          ================================================== */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              سبب التسوية
            </label>

            <textarea
              rows={3}
              placeholder="مثال: جرد دوري، تلف، عجز، إضافة كمية..."
              {...register("notes")}
              disabled={isPending}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />

            {errors.notes && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.notes.message}
              </p>
            )}
          </div>

          {/* =================================================
              ACTIONS
          ================================================== */}

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isPending || !currentVariant || willExceedStock}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <LuLoader className="h-4 w-4 animate-spin" />}

              {isPending ? "جاري التسجيل..." : "تسجيل التسوية"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getVariantLabel(variant: InventoryVariant) {
  const productName = variant.product_templates?.name || "منتج";

  const attributes = [variant.colorName, variant.size]
    .filter(Boolean)
    .join(" / ");

  return attributes ? `${productName} - ${attributes}` : productName;
}

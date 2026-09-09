"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { FieldErrors, useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import PurchaseCart, { PurchaseItem } from "../_components/Cart";

import {
  PurchaseOrder,
  UpdatePurchaseOrderInput,
  updatePurchaseOrderSchema,
} from "../schemas/orders.schemas";

import { updatePurchaseOrder } from "../services/order.services";

import { z } from "zod";
import { LuArrowRight } from "react-icons/lu";

/* =========================================================
   TYPES
========================================================= */

interface Variant {
  id: string;
  templateId: string;
  sku?: string;
  colorName?: string | null;
  size?: string | null;
  purchasePrice: number;
}

interface ProductTemplate {
  id: string;
  name: string;
  variants: Variant[];
}

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  initialOrder: PurchaseOrder;
  products: ProductTemplate[];
  suppliers: Supplier[];
}

/*
 * مهم:
 * z.input = البيانات التي يتعامل معها الفورم
 * z.output = البيانات بعد معالجة Zod
 */
type UpdatePurchaseOrderFormInput = z.input<typeof updatePurchaseOrderSchema>;

/* =========================================================
   COMPONENT
========================================================= */

export default function EditPurchaseOrderForm({
  initialOrder,
  products,
  suppliers,
}: Props) {
  const router = useRouter();

  /* =========================================================
     INITIAL CART
  ========================================================= */

  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>(() => {
    return (
      initialOrder.items?.map((item) => {
        const attributesStr = [
          item.colorName && `اللون: ${item.colorName}`,
          item.size && `المقاس: ${item.size}`,
        ]
          .filter(Boolean)
          .join(" | ");

        return {
          id: item.variantId,

          templateId: item.templateId,

          variantId: item.variantId,

          productName: item.productName || "منتج غير معروف",

          sku: item.sku,

          variantAttributes: attributesStr,

          /* Cart uses unitCost */
          unitCost: item.unitCost,

          quantity: item.quantity,
        };
      }) || []
    );
  });

  /* =========================================================
     SEARCH
  ========================================================= */

  const [searchQuery, setSearchQuery] = useState("");

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  /* =========================================================
     FORM
  ========================================================= */

  const form = useForm<
    UpdatePurchaseOrderFormInput,
    unknown,
    UpdatePurchaseOrderInput
  >({
    resolver: zodResolver(updatePurchaseOrderSchema),

    defaultValues: {
      id: initialOrder.id,

      supplierId: initialOrder.supplierId || null,

      orderNumber: initialOrder.orderNumber,

      orderDate: initialOrder.orderDate
        ? new Date(initialOrder.orderDate).toISOString().split("T")[0]
        : "",

      expectedDate: initialOrder.expectedDate
        ? new Date(initialOrder.expectedDate).toISOString().split("T")[0]
        : null,

      notes: initialOrder.notes || null,

      deliveryCost: initialOrder.deliveryCost || 0,

      discountAmount: initialOrder.discountAmount || 0,

      items:
        initialOrder.items?.map((item) => ({
          templateId: item.templateId,

          variantId: item.variantId,

          quantity: item.quantity,

          unitCost: item.unitCost,
        })) || [],
    },
  });

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const deliveryCost = Number(watch("deliveryCost") || 0);

  const discountAmount = Number(watch("discountAmount") || 0);

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
     SYNC CART -> FORM
  ========================================================= */

  useEffect(() => {
    setValue(
      "items",
      purchaseItems.map((item) => ({
        templateId: item.templateId,

        variantId: item.variantId,

        quantity: item.quantity,

        unitCost: item.unitCost,
      })),
      {
        shouldValidate: true,
      },
    );
  }, [purchaseItems, setValue]);

  /* =========================================================
     FILTER PRODUCTS
  ========================================================= */

  const filteredVariants = useMemo(() => {
    const list: {
      variantId: string;
      templateId: string;
      productName: string;
      sku?: string;
      attributesStr: string;
      price: number;
    }[] = [];

    products.forEach((product) => {
      product.variants?.forEach((variant) => {
        const attributesStr = [
          variant.colorName && `اللون: ${variant.colorName}`,

          variant.size && `المقاس: ${variant.size}`,
        ]
          .filter(Boolean)
          .join(" | ");

        list.push({
          variantId: variant.id,

          templateId: product.id,

          productName: product.name,

          sku: variant.sku,

          attributesStr,

          price: variant.purchasePrice || 0,
        });
      });
    });

    if (!searchQuery.trim()) {
      return list;
    }

    const q = searchQuery.trim().toLowerCase();

    return list.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        Boolean(item.sku?.toLowerCase().includes(q)) ||
        item.attributesStr.toLowerCase().includes(q),
    );
  }, [products, searchQuery]);

  /* =========================================================
     ADD VARIANT
  ========================================================= */

  const addVariantToOrder = (variantId: string) => {
    if (!variantId) return;

    let foundTemplate: ProductTemplate | undefined;

    let foundVariant: Variant | undefined;

    for (const template of products) {
      const variant = template.variants?.find((item) => item.id === variantId);

      if (variant) {
        foundTemplate = template;

        foundVariant = variant;

        break;
      }
    }

    if (!foundTemplate || !foundVariant) {
      return;
    }

    const attributesStr = [
      foundVariant.colorName && `اللون: ${foundVariant.colorName}`,

      foundVariant.size && `المقاس: ${foundVariant.size}`,
    ]
      .filter(Boolean)
      .join(" | ");

    setPurchaseItems((previousItems) => {
      const existingItem = previousItems.find(
        (item) => item.variantId === variantId,
      );

      if (existingItem) {
        return previousItems.map((item) =>
          item.variantId === variantId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      const newItem: PurchaseItem = {
        id: foundVariant!.id,

        templateId: foundTemplate!.id,

        variantId: foundVariant!.id,

        productName: foundTemplate!.name,

        sku: foundVariant!.sku,

        variantAttributes: attributesStr,

        unitCost: foundVariant!.purchasePrice || 0,

        quantity: 1,
      };

      return [...previousItems, newItem];
    });

    setSearchQuery("");
    setIsDropdownOpen(false);
  };

  /* =========================================================
     UPDATE
  ========================================================= */

  const handleUpdate = async (data: UpdatePurchaseOrderInput) => {
    try {
      await updatePurchaseOrder(initialOrder.id, {
        /*
         * updatePurchaseOrderInput requires id
         */
        id: initialOrder.id,

        supplierId: data.supplierId || null,

        orderDate: data.orderDate,

        expectedDate: data.expectedDate || null,

        notes: data.notes || null,

        deliveryCost: data.deliveryCost ?? 0,

        discountAmount: data.discountAmount ?? 0,

        items: data.items || [],
      });

      toast.success("تم تحديث أمر الشراء بنجاح");

      router.push(`/dashboard/orders/${initialOrder.id}`);

      router.refresh();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "حدث خطأ أثناء تعديل الطلب",
      );
    }
  };

  /* =========================================================
     VALIDATION ERROR
  ========================================================= */

  const onError = (errors: FieldErrors<UpdatePurchaseOrderFormInput>) => {
    if (errors.items) {
      toast.error("يرجى إضافة متغير منتج واحد على الأقل للطلب");

      return;
    }

    if (errors.supplierId) {
      toast.error("بيانات المورد غير صحيحة");

      return;
    }

    if (errors.orderDate) {
      toast.error("يرجى تحديد تاريخ الشراء");

      return;
    }

    toast.error("يرجى التأكد من ملء الحقول المطلوبة بشكل صحيح");
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div dir="rtl" className="space-y-6">
      {/* =====================================================
          FORM CARD
      ====================================================== */}

      <div className="rounded-2xl border border-gray-300 bg-white p-6">
        <div className="grid gap-8 lg:grid-cols-12">
          {/* =================================================
              LEFT SIDE
          ================================================== */}

          <div className="space-y-4 lg:col-span-5">
            {/* Supplier */}

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                المورد
              </label>

              <select
                {...register("supplierId")}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
              >
                <option value="">بدون مورد (اختياري)</option>

                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dates */}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  تاريخ الشراء
                </label>

                <input
                  type="date"
                  disabled={isSubmitting}
                  {...register("orderDate")}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  تاريخ الاستلام المتوقع
                </label>

                <input
                  type="date"
                  disabled={isSubmitting}
                  {...register("expectedDate")}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Delivery + Discount */}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  تكلفة الشحن
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isSubmitting}
                  {...register("deliveryCost", {
                    setValueAs: (value) => (value === "" ? 0 : Number(value)),
                  })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  مبلغ الخصم
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isSubmitting}
                  {...register("discountAmount", {
                    setValueAs: (value) => (value === "" ? 0 : Number(value)),
                  })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Product Search */}

            <div className="relative" ref={dropdownRef}>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                البحث عن منتج وإضافته
              </label>

              <input
                type="text"
                disabled={isSubmitting}
                placeholder="ابحث باسم المنتج، الـ SKU، أو المواصفات..."
                value={searchQuery}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);

                  setIsDropdownOpen(true);
                }}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
              />

              {isDropdownOpen && (
                <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg ring-1 ring-black/5">
                  {filteredVariants.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-400">
                      لا توجد منتجات مطابقة لنتيجة البحث
                    </div>
                  ) : (
                    filteredVariants.map((item) => (
                      <button
                        key={item.variantId}
                        type="button"
                        onClick={() => addVariantToOrder(item.variantId)}
                        className="flex w-full flex-col gap-0.5 rounded-lg border-b border-gray-50 px-3 py-2 text-right text-xs transition last:border-none hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                      >
                        <div className="flex items-center justify-between font-medium text-gray-900">
                          <span>{item.productName}</span>

                          <span className="font-semibold text-emerald-600">
                            {item.price} ر.س
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-gray-500">
                          {item.attributesStr && (
                            <span>{item.attributesStr}</span>
                          )}

                          {item.sku && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px]">
                              SKU: {item.sku}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Notes */}

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                ملاحظات
              </label>

              <textarea
                rows={3}
                disabled={isSubmitting}
                {...register("notes")}
                className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red)/80 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* =================================================
              RIGHT SIDE
          ================================================== */}

          <div className="border-t border-gray-100 pt-6 lg:col-span-7 lg:border-r lg:border-t-0 lg:pr-6 lg:pt-0">
            <PurchaseCart
              purchaseItems={purchaseItems}
              setPurchaseItems={setPurchaseItems}
              deliveryCost={deliveryCost}
              discountAmount={discountAmount}
            />
          </div>
        </div>

        {/* =====================================================
            BUTTONS
        ====================================================== */}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-6">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => router.push(`/dashboard/orders/${initialOrder.id}`)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-60"
          >
            إلغاء
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit(handleUpdate, onError)}
            className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red)/80 disabled:opacity-60"
          >
            {isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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

export default function EditPurchaseOrderForm({
  initialOrder,
  products,
  suppliers,
}: Props) {
  const router = useRouter();

  // تجهيز عناصر السلة الأوليّة من إغلاق أمر الشراء
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
          costPrice: item.unitCost,
          quantity: item.quantity,
        };
      }) || []
    );
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const form = useForm<UpdatePurchaseOrderInput>({
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
      items: initialOrder.items?.map((i) => ({
        templateId: i.templateId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // المزامنة مع Form Items
  useEffect(() => {
    setValue(
      "items",
      purchaseItems.map((item) => ({
        templateId: item.templateId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitCost: item.costPrice,
      })),
      { shouldValidate: true },
    );
  }, [purchaseItems, setValue]);

  const filteredVariants = useMemo(() => {
    const list: {
      variantId: string;
      templateId: string;
      productName: string;
      sku?: string;
      attributesStr: string;
      price: number;
    }[] = [];

    products.forEach((p) => {
      p.variants?.forEach((v) => {
        const attributesStr = [
          v.colorName && `اللون: ${v.colorName}`,
          v.size && `المقاس: ${v.size}`,
        ]
          .filter(Boolean)
          .join(" | ");

        list.push({
          variantId: v.id,
          templateId: p.id,
          productName: p.name,
          sku: v.sku,
          attributesStr,
          price: v.purchasePrice || 0,
        });
      });
    });

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        item.attributesStr.toLowerCase().includes(q),
    );
  }, [products, searchQuery]);

  const addVariantToOrder = (variantId: string) => {
    if (!variantId) return;

    let foundTemplate: ProductTemplate | undefined;
    let foundVariant: Variant | undefined;

    for (const tmpl of products) {
      const v = tmpl.variants?.find((varItem) => varItem.id === variantId);
      if (v) {
        foundTemplate = tmpl;
        foundVariant = v;
        break;
      }
    }

    if (!foundTemplate || !foundVariant) return;

    const attributesStr = [
      foundVariant.colorName && `اللون: ${foundVariant.colorName}`,
      foundVariant.size && `المقاس: ${foundVariant.size}`,
    ]
      .filter(Boolean)
      .join(" | ");

    setPurchaseItems((prev) => {
      const existing = prev.find((item) => item.variantId === variantId);
      if (existing) {
        return prev.map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: foundVariant.id,
          templateId: foundTemplate!.id,
          variantId: foundVariant.id,
          productName: foundTemplate!.name,
          sku: foundVariant.sku,
          variantAttributes: attributesStr,
          costPrice: foundVariant.purchasePrice || 0,
          quantity: 1,
        },
      ];
    });

    setSearchQuery("");
    setIsDropdownOpen(false);
  };

  const handleUpdate = async (data: UpdatePurchaseOrderInput) => {
    try {
      await updatePurchaseOrder(initialOrder.id, {
        supplierId: data.supplierId || null,
        orderDate: data.orderDate,
        expectedDate: data.expectedDate || null,
        notes: data.notes || null,
        deliveryCost: data.deliveryCost,
        discountAmount: data.discountAmount,
        items: data.items,
      });

      toast.success("تم تحديث أمر الشراء بنجاح");
      router.push("/dashboard/orders");
      router.refresh();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "حدث خطأ أثناء تعديل الطلب",
      );
    }
  };

  const onError = (errors: FieldErrors<UpdatePurchaseOrderInput>) => {
    if (errors.items) {
      toast.error("يرجى إضافة متغير منتج واحد على الأقل للطلب");
    } else {
      toast.error("يرجى التأكد من ملء الحقول المطلوبة بشكل صحيح");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-300 p-6">
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Side: Inputs */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              المورد
            </label>
            <select
              {...register("supplierId")}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
            >
              <option value="">بدون مورد (اختياري)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                تاريخ الشراء
              </label>
              <input
                type="date"
                disabled={isSubmitting}
                {...register("orderDate")}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
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
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
              />
            </div>
          </div>

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
                  setValueAs: (v) => (v === "" ? 0 : Number(v)),
                })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
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
                  setValueAs: (v) => (v === "" ? 0 : Number(v)),
                })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
              />
            </div>
          </div>

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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none transition"
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
                      className="w-full text-right rounded-lg px-3 py-2 text-xs transition hover:bg-red-50 focus:bg-red-50 focus:outline-none flex flex-col gap-0.5 border-b border-gray-50 last:border-none"
                    >
                      <div className="flex items-center justify-between font-medium text-gray-900">
                        <span>{item.productName}</span>
                        <span className="text-emerald-600 font-semibold">
                          {item.price} ر.س
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        {item.attributesStr && (
                          <span>{item.attributesStr}</span>
                        )}
                        {item.sku && (
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
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

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              ملاحظات
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting}
              {...register("notes")}
              className="w-full h-24 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red)/80 focus:bg-white focus:outline-none resize-none transition"
            />
          </div>
        </div>

        {/* Right Side: Cart */}
        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-r border-gray-100 pt-6 lg:pt-0 lg:pr-6">
          <PurchaseCart
            purchaseItems={purchaseItems}
            setPurchaseItems={setPurchaseItems}
            deliveryCost={deliveryCost}
            discountAmount={discountAmount}
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-6 mt-6">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => router.back()}
          className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
        >
          إلغاء
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSubmit(handleUpdate, onError)}
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white hover:bg-(--primary-red)/80 disabled:opacity-60 transition"
        >
          {isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
        </button>
      </div>
    </div>
  );
}

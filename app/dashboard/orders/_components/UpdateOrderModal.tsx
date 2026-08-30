"use client";

import { useEffect, useState } from "react";
import { FieldErrors, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { useModalStore } from "@/store/useModalStore";
import PurchaseCart from "./Cart";
import {
  CreatePurchaseOrderInput,
  createPurchaseOrderSchema,
  PurchaseOrder,
} from "../schemas/orders.schemas";
import { getSuppliers } from "../../suppliers/service/supplier.services";
import { getProducts } from "../../products/services/products.services";
import { updatePurchaseOrder } from "../services/order.services";

export interface Option {
  id: string;
  name: string;
  purchasePrice?: number;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  name: string;
  costPrice: number;
  quantity: number;
}

interface Props {
  initialOrder?: PurchaseOrder;
}

export default function UpdateOrderModalContent({ initialOrder }: Props) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);

  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>(
    initialOrder?.items?.map((item) => ({
      id: item.productId,
      productId: item.productId,
      name: item.productName || "منتج",
      costPrice: item.unitCost,
      quantity: item.quantity || 1,
    })) || [],
  );

  const defaultToday = new Date().toISOString().split("T")[0];

  // ✅ 1. إعداد النموذج وتضمين الحقول
  const form = useForm<CreatePurchaseOrderInput>({
    resolver: zodResolver(createPurchaseOrderSchema),
    defaultValues: {
      supplierId: initialOrder?.supplierId || "",
      orderNumber: initialOrder?.orderNumber || "",
      expectedDate: initialOrder?.expectedDate
        ? new Date(initialOrder.expectedDate).toISOString().split("T")[0]
        : defaultToday,
      notes: initialOrder?.notes || "",
      items: purchaseItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.costPrice,
      })),
    },
  });

  const {
    register,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  // ✅ 2. مزامنة عناصر السلة مع React Hook Form
  useEffect(() => {
    const formattedItems = purchaseItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.costPrice,
    }));
    setValue("items", formattedItems, { shouldValidate: true });
  }, [purchaseItems, setValue]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getSuppliers().then((res) => res?.data || []),
      getProducts({ limit: 100 }).then((res) => res?.data || []),
    ])
      .then(([suppliersData, productsData]) => {
        if (isMounted) {
          setSuppliers(suppliersData);
          setProducts(productsData);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addToOrder = (productId: string) => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setPurchaseItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          productId: product.id,
          name: product.name,
          costPrice: product.purchasePrice || 0,
          quantity: 1,
        },
      ];
    });
  };

  const onSubmit = async (data: CreatePurchaseOrderInput) => {
    try {
      const updatePayload = {
        supplierId: data.supplierId === "" ? null : data.supplierId,
        expectedDate: data.expectedDate,
        notes: data.notes,
        items: data.items,
      };

      await updatePurchaseOrder(
        initialOrder?.id || "",
        updatePayload,
      );

      toast.success("تم تحديث طلب الشراء بنجاح");
      closeModal();
      router.refresh();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "حدث خطأ غير متوقع أثناء التحديث",
      );
    }
  };

  const onError = (errors: FieldErrors<CreatePurchaseOrderInput>) => {
    if (errors.items) {
      toast.error(
        errors.items.message || "يرجى إضافة منتج واحد على الأقل للطلب",
      );
    } else {
      toast.error("يرجى التأكد من ملء جميع الحقول المطلوبة بشكل صحيح");
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, onError)}
      className="space-y-6"
      noValidate
    >
      <div>
        <p className="text-sm text-gray-500">
          يرجى تحديد تفاصيل الطلب واختيار العناصر المطلوبة بعناية قبل الحفظ.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 max-h-[65vh] overflow-y-auto p-1">
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              المورد <span className="text-xs text-gray-400">(اختياري)</span>
            </label>
            <select
              {...register("supplierId")}
              disabled={isSubmitting || loadingData}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60 cursor-pointer"
            >
              <option value="">بدون مورد (اختياري)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.supplierId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.supplierId.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              إضافة منتج <span className="text-red-500">*</span>
            </label>
            <select
              disabled={isSubmitting || loadingData}
              onChange={(e) => {
                addToOrder(e.target.value);
                e.target.value = "";
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60 cursor-pointer"
            >
              <option value="">
                {loadingData
                  ? "جاري تحميل المنتجات..."
                  : "اضغط لاختيار منتج وتضمينه..."}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.items && (
              <p className="mt-1 text-xs text-red-500">
                {errors.items.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              التاريخ المتوقع للاستلام <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              disabled={isSubmitting}
              {...register("expectedDate")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60"
            />
            {errors.expectedDate && (
              <p className="mt-1 text-xs text-red-500">
                {errors.expectedDate.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              ملاحظات
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting}
              {...register("notes")}
              placeholder="أي ملاحظات إضافية..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none disabled:opacity-60 resize-none"
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-red-500">
                {errors.notes.message}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-r border-gray-100 pt-6 lg:pt-0 lg:pr-6">
          <PurchaseCart
            purchaseItems={purchaseItems}
            setPurchaseItems={setPurchaseItems}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={closeModal}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "جاري الحفظ..." : "تحديث طلب الشراء"}
        </button>
      </div>
    </form>
  );
}

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
import { createPurchaseOrder } from "../services/order.services";
import { Supplier } from "../../suppliers/schemas/supplier.schemas";
import { Product } from "../../products/schemas/product.schemas";

export interface PurchaseItem {
  id: string;
  productId: string;
  name: string;
  costPrice: number;
  quantity: number;
}

interface Props {
  initialOrder?: PurchaseOrder;
  suppliers: Supplier[];
  products: Product[];
}

export default function OrderModalContent({
  initialOrder,
  suppliers,
  products,
}: Props) {
  const router = useRouter();
  const closeModal = useModalStore((state) => state.closeModal);

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

  const form = useForm<CreatePurchaseOrderInput>({
    resolver: zodResolver(createPurchaseOrderSchema),
    defaultValues: {
      supplierId: initialOrder?.supplierId || "",
      orderNumber: initialOrder?.orderNumber || "",
      orderDate: initialOrder?.orderDate
        ? new Date(initialOrder.orderDate).toISOString().split("T")[0]
        : defaultToday,
      expectedDate: initialOrder?.expectedDate
        ? new Date(initialOrder.expectedDate).toISOString().split("T")[0]
        : "",
      notes: initialOrder?.notes || "",
      status: "DRAFT",
      deliveryCost: initialOrder?.deliveryCost || 0,
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
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const deliveryCost = Number(watch("deliveryCost") || 0);

  useEffect(() => {
    setValue(
      "items",
      purchaseItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.costPrice,
      })),
      { shouldValidate: true },
    );
  }, [purchaseItems, setValue]);

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

  const submitWithStatus = (targetStatus: "DRAFT" | "DIRECT") => {
    setValue("status", targetStatus);
    handleSubmit(onSubmit, onError)();
  };

  const onSubmit = async (data: CreatePurchaseOrderInput) => {
    const payload = {
      ...data,
      supplierId: data.supplierId === "" ? null : data.supplierId,
      expectedDate: data.expectedDate === "" ? null : data.expectedDate,
    };

    try {
      await createPurchaseOrder(payload);
      toast.success(
        data.status === "DIRECT"
          ? "تم الشراء المباشر وزيادة المخزون وتسجيل القيد"
          : "تم حفظ المسودة وإخطار المالك للموافقة",
      );
      closeModal();
      router.refresh();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "حدث خطأ غير متوقع أثناء حفظ الطلب",
      );
    }
  };

  const onError = (errors: FieldErrors<CreatePurchaseOrderInput>) => {
    if (errors.items) {
      toast.error(
        typeof errors.items.message === "string"
          ? errors.items.message
          : "يرجى إضافة منتج واحد على الأقل لحفظ الطلب",
      );
    } else if (errors.orderDate) {
      toast.error(errors.orderDate.message || "يرجى تحديد تاريخ الشراء");
    } else {
      toast.error("يرجى التأكد من ملء جميع الحقول المطلوبة بشكل صحيح");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-12 max-h-[65vh] overflow-y-auto p-1">
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="mb-0.5 block text-sm font-semibold text-gray-700">
              المورد
            </label>
            <select
              {...register("supplierId")}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-red-500 focus:bg-white focus:outline-none disabled:opacity-60 cursor-pointer"
            >
              <option value="">بدون مورد (اختياري)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-0.5 block text-sm font-semibold text-gray-700">
              تاريخ الشراء
            </label>
            <input
              type="date"
              disabled={isSubmitting}
              {...register("orderDate")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-red-500 focus:bg-white focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-sm font-semibold text-gray-700">
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
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-red-500 focus:bg-white focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="mb-0.5 block text-sm font-semibold text-gray-700">
              إضافة منتج
            </label>
            <select
              disabled={isSubmitting}
              onChange={(e) => {
                addToOrder(e.target.value);
                e.target.value = "";
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-red-500 focus:bg-white focus:outline-none disabled:opacity-60 cursor-pointer"
            >
              <option value="">{"اضغط لاختيار منتج وتضمينه..."}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              ملاحظات
            </label>
            <textarea
              rows={3}
              disabled={isSubmitting}
              {...register("notes")}
              className="w-full h-24 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-red-500 focus:bg-white focus:outline-none disabled:opacity-60 resize-none"
            />
          </div>
        </div>

        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-r border-gray-100 pt-6 lg:pt-0 lg:pr-6">
          <PurchaseCart
            purchaseItems={purchaseItems}
            setPurchaseItems={setPurchaseItems}
            deliveryCost={deliveryCost}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => submitWithStatus("DRAFT")}
          className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {isSubmitting ? "جاري الحفظ..." : "حفظ كمسودة (دورة كاملة)"}
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => submitWithStatus("DIRECT")}
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-(--primary-red)/80 disabled:opacity-60"
        >
          شراء مباشر (مستلم)
        </button>
      </div>
    </div>
  );
}

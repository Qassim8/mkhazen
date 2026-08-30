"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { ProductFormInputType } from "../schemas/product.schemas";
import SelectOrAddModal from "../_components/SelectOrAddModal";
import ModalContent from "../../categories/_components/ModalContent";
import { useModalStore } from "@/store/useModalStore";
import { Category } from "../../categories/schemas/category.schemas";
import CreateSupplierModalContent from "../../suppliers/_components/SupplierModalContent";

interface BasicInfoFormProps {
  register: UseFormRegister<ProductFormInputType>;
  errors: FieldErrors<ProductFormInputType>;
  categories: Category[];
  suppliers: { id: string; name: string }[];
  loadingOptions: boolean;
  onAddSupplierModal?: () => void;
}

export default function BasicInfoForm({
  register,
  errors,
  categories,
  suppliers,
  loadingOptions,
}: BasicInfoFormProps) {
  const { openModal } = useModalStore();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
        البيانات الأساسية والتصنيف
      </h3>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          اسم المنتج *
        </label>
        <input
          {...register("name")}
          placeholder="مثال: جلابية كتان كويتي أبيض فاخر"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
        />
        {errors.name && (
          <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
        )}
      </div>

      {/* قسم الباركودات و الـ SKU */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            باركود التجزئة (الحبة)
          </label>
          <input
            {...register("barcode")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
            placeholder="امسح باركود الحبة"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            باركود الجملة (الكرتونة)
          </label>
          <input
            {...register("packBarcode")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
            placeholder="امسح باركود الكرتونة"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            رمز الـ SKU (اختياري)
          </label>
          <input
            {...register("sku")}
            placeholder="توليد تلقائي إن ترك فارغاً"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectOrAddModal
          label="الفئة"
          name="categoryId"
          required
          options={categories}
          isLoading={loadingOptions}
          placeholder="اختر الفئة..."
          emptyText="عذراً، لم يتم تسجيل فئة بعد"
          onOpenModal={() =>
            openModal("CREATE", {
              title: "انشاء فئة جديدة",
              content: <ModalContent />,
            })
          }
          register={register}
          error={errors.categoryId?.message}
        />

        <SelectOrAddModal
          label="المورد"
          name="supplierId"
          options={suppliers}
          isLoading={loadingOptions}
          placeholder="اختر المورد (اختياري)..."
          emptyText="عذراً، لم يتم تسجيل مورد بعد"
          onOpenModal={() =>
            openModal("CREATE", {
              title: "انشاء مورد جديد",
              content: <CreateSupplierModalContent />,
            })
          }
          register={register}
          error={errors.supplierId?.message}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          وصف المنتج
        </label>
        <textarea
          {...register("description")}
          rows={3}
          placeholder="تفاصيل المنتج، نوع القماش، بلد التصنيع، إلخ..."
          className="w-full h-36 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium resize-none"
        />
      </div>
    </div>
  );
}

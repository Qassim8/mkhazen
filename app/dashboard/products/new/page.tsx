"use client";

import { useState } from "react";
import { LuSave, LuArrowRight } from "react-icons/lu";
import Link from "next/link";
import ProductMediaAndSizes from "../components/ProductMediaAndSizes";

export default function AddProductPage() {
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    sku: "",
    costPrice: "",
    salePrice: "",
    unitType: "قطعة",
    quantity: "",
    reorderLevel: "5",
    description: "",
    sizes: [] as string[],
    images: [] as string[],
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleSize = (size: string) => {
    setFormData((prev) => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size],
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).map((file) =>
        URL.createObjectURL(file),
      );
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...filesArray].slice(0, 4),
      }));
    }
  };

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.sizes.length === 0) {
      alert("الرجاء اختيار مقاس واحد على الأقل للجلابية!");
      return;
    }
    console.log("البيانات الكاملة المرسلة للباكيند وبريسما:", formData);
    alert("تم حفظ بيانات منتج الجلابية بنجاح!");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* شريط العنوان والعودة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-red-600 mb-1 transition"
          >
            <LuArrowRight className="h-4 w-4" /> العودة لقائمة المنتجات
          </Link>
          <h1 className="text-2xl font-black text-gray-950">
            إضافة منتج جديد للمخزن
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            أدخل تفاصيل البضاعة، المقاسات، والأسعار لتحديث الجرد الحي للمتجر.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        {/* التفاصيل الأساسية والمالية */}
        <div className="lg:col-span-2 space-y-6">
          <div className="frame space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
              البيانات الأساسية
            </h3>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                اسم المنتج
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="مثال: جلابية كتان كويتي أبيض فاخر"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  تصنيف المنتج
                </label>
                <select
                  name="category"
                  required
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium cursor-pointer"
                >
                  <option value="">اختر الصنف</option>
                  <option value="jalabiya-lux">جلاليب فاخرة</option>
                  <option value="jalabiya-casual">جلاليب يومية</option>
                  <option value="fabrics">طاقات قماش</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  الباركود / رمز SKU
                </label>
                <input
                  type="text"
                  name="sku"
                  required
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="مثال: JAL-KTN-WHT"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
            </div>
          </div>

          <div className="frame space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">
              التسعير والمخزون
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  وحدة الحساب
                </label>
                <select
                  name="unitType"
                  value={formData.unitType}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium cursor-pointer"
                >
                  <option value="قطعة">قطعة </option>
                  <option value="طاقة">طاقة </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  سعر التكلفة (للوحدة)
                </label>
                <input
                  type="number"
                  name="costPrice"
                  required
                  min="0"
                  step="0.01"
                  value={formData.costPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  سعر البيع (للوحدة)
                </label>
                <input
                  type="number"
                  name="salePrice"
                  required
                  min="0"
                  step="0.01"
                  value={formData.salePrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-50 pt-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  الكمية الابتدائية المتاحة
                </label>
                <input
                  type="number"
                  name="quantity"
                  required
                  min="0"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  حد إعادة الطلب (تنبيه النقص)
                </label>
                <input
                  type="number"
                  name="reorderLevel"
                  required
                  min="0"
                  value={formData.reorderLevel}
                  onChange={handleChange}
                  placeholder="5"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
            </div>
          </div>

          <div className="frame space-y-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              تفاصيل وملاحظات إضافية (اختياري)
            </label>
            <textarea
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="اكتب تفاصيل خامة القماش، نوع التطريز..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-red-500 focus:bg-white focus:outline-none transition resize-none font-medium"
            />
          </div>
        </div>

        {/* المكون الجانبي للصور والمقاسات + زر الحفظ النهائي */}
        <div className="space-y-6">
          <ProductMediaAndSizes
            sizes={formData.sizes}
            images={formData.images}
            onToggleSize={toggleSize}
            onImageChange={handleImageChange}
            onRemoveImage={removeImage}
          />

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-(--primary-red) py-3.5 text-sm font-bold text-white shadow-md hover:bg-(--primary-red-hover) active:scale-[0.99] transition cursor-pointer"
          >
            <LuSave className="h-5 w-5" /> حفظ المنتج
          </button>
        </div>
      </form>
    </div>
  );
}

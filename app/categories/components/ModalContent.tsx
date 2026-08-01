"use client";
import { useState } from "react";
// استيراد الأيقونات التي تريد إتاحتها للمستخدم كمقترحات
import {
  LuLaptop,
  LuShirt,
  LuFootprints,
  LuWatch,
  LuGamepad2,
  LuPackage,
} from "react-icons/lu";

// مصفوفة الأيقونات المتاحة للاختيار
const availableIcons = [
  { name: "Laptop", component: LuLaptop },
  { name: "Shirt", component: LuShirt },
  { name: "Footprints", component: LuFootprints },
  { name: "Watch", component: LuWatch },
  { name: "Gamepad", component: LuGamepad2 },
  { name: "Package", component: LuPackage },
];

// مصفوفة الألوان المقترحة (التاجر يختار بضغطة زر)
const availableColors = [
  { name: "Red", value: "#EF4444" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Pink", value: "#EC4899" },
];

export default function ModalContent() {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    iconName: "Package", // الأيقونة الافتراضية
    color: "#10B981", // اللون الافتراضي
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(formData); // ستُرسل النصوص والألوان هنا للباكيند مباشرة
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-950">Add New Category</h3>
        <p className="text-sm text-gray-500 mt-1">
          Create a new product group to organize your inventory effectively.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Category Name
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Electronics, Clothing"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        {/* قسم اختيار الأيقونة */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select Icon
          </label>
          <div className="grid grid-cols-6 gap-2">
            {availableIcons.map((icon) => {
              const IconComponent = icon.component;
              const isSelected = formData.iconName === icon.name;
              return (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, iconName: icon.name }))
                  }
                  className={`flex h-11 items-center justify-center rounded-xl border transition ${
                    isSelected
                      ? "border-(--primary-red) bg-(--primary-red)/10 text-(--primary-red)"
                      : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <IconComponent className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* قسم اختيار اللون */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select Color Theme
          </label>
          <div className="flex flex-wrap gap-3">
            {availableColors.map((color) => {
              const isSelected = formData.color === color.value;
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, color: color.value }))
                  }
                  style={{ backgroundColor: color.value }}
                  className={`h-8 w-8 rounded-full transition transform hover:scale-110 ${
                    isSelected ? "ring-4 ring-offset-2 ring-gray-900" : ""
                  }`}
                  title={color.name}
                />
              );
            })}
            {/* خيار إضافي: للمدراء الذين يفضلون اختيار لون مخصص بدقة */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-400">Custom:</span>
              <input
                type="color"
                name="color"
                value={formData.color}
                onChange={handleChange}
                className="h-8 w-8 cursor-pointer rounded-lg border border-gray-200 p-0"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Description (Optional)
          </label>
          <textarea
            name="description"
            rows={3}
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe what kind of products belong to this category..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-none transition resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
        <button
          type="submit"
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
        >
          Save Category
        </button>
      </div>
    </form>
  );
}

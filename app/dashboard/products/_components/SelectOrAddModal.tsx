// @/components/SelectOrAddModal.tsx
"use client";

import { LuPlus, LuLoader, LuCircleAlert } from "react-icons/lu";

interface Option {
  id: string;
  name: string;
}

interface SelectOrAddProps {
  label: string;
  name: string;
  options: Option[];
  isLoading?: boolean;
  placeholder: string;
  emptyText: string;
  onOpenModal: () => void;
  register: any;
  error?: string;
  required?: boolean;
}

export default function SelectOrAddModal({
  label,
  options,
  isLoading,
  placeholder,
  emptyText,
  onOpenModal,
  register,
  name,
  error,
  required,
}: SelectOrAddProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-semibold text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {options.length > 0 && (
          <button
            type="button"
            onClick={onOpenModal}
            className="text-xs font-bold text-(--primary-red) hover:underline flex items-center gap-1 cursor-pointer"
          >
            <LuPlus className="h-3.5 w-3.5" /> إضافة جديد
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500">
          <LuLoader className="animate-spin h-4 w-4" /> جاري تحميل البيانات...
        </div>
      ) : options.length > 0 ? (
        <select
          {...register(name)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-(--primary-red) focus:bg-white focus:outline-hidden transition font-medium"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="p-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <LuCircleAlert className="h-4 w-4 shrink-0" />
            <span>{emptyText}</span>
          </div>
          <button
            type="button"
            onClick={onOpenModal}
            className="w-full sm:w-auto p-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition shadow-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <LuPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

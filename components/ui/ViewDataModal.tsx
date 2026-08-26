"use client";

import { useModalStore } from "@/store/useModalStore";
import { IoClose } from "react-icons/io5";

export default function ViewDataModal() {
  const { data, closeModal } = useModalStore();

  return (
    <div
      dir="rtl"
      className="relative w-full max-w-xl space-y-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-lg font-bold text-gray-900">
          {data.title || "تفاصيل البيانات"}
        </h3>
        <button
          type="button"
          onClick={closeModal}
          className="rounded-xl p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <IoClose className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2">
        {data.content || (
          <pre className="text-xs bg-gray-50 p-3 rounded-xl overflow-x-auto">
            {JSON.stringify(data.selectedRow, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={closeModal}
          className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

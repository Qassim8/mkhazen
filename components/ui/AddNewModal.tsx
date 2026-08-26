"use client";

import { useModalStore } from "@/store/useModalStore";
import { IoClose } from "react-icons/io5";

export default function AddNewModal() {
  const { data, closeModal } = useModalStore();

  return (
    <div
      dir="rtl"
      className="relative w-full max-w-xl space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-lg font-bold text-gray-900">
          {data.title || "إضافة جديد"}
        </h3>
        <button
          type="button"
          onClick={closeModal}
          className="rounded-xl p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <IoClose className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2">{data.content}</div>
    </div>
  );
}

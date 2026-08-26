"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IoClose } from "react-icons/io5";
import { useModalStore } from "@/store/useModalStore";
import toast from "react-hot-toast";

export default function UpdateModal() {
  const { data, closeModal } = useModalStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();

  const handleUpdate = async () => {
    if (!data.rowId || !data.actionFunction) return;

    try {
      setIsUpdating(true);
      await data.actionFunction(data.rowId);
      toast.success(`تم تحديث بيانات بنجاح`);
      closeModal();
      router.refresh();
    } catch (error) {
      console.error("خطأ أثناء التحديث:", error);
      toast.error("حدث خطأ أثناء التحديث");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="relative w-full max-w-xl space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h3 className="text-lg font-bold text-gray-900">
          {data.title || "تعديل البيانات"}
        </h3>
        <button
          type="button"
          onClick={closeModal}
          disabled={isUpdating}
          className="rounded-xl p-1.5 text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <IoClose className="h-5 w-5" />
        </button>
      </div>

      <div>{data.content}</div>

      {data.actionFunction && (
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={closeModal}
            disabled={isUpdating}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isUpdating ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      )}
    </div>
  );
}

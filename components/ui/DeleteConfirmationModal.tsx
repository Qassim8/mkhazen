"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useModalStore } from "@/store/useModalStore";
import { LuTriangleAlert } from "react-icons/lu";
import toast from "react-hot-toast";

export default function DeleteConfirmationModal() {
  const { data, closeModal } = useModalStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!data.rowId || !data.actionFunction) return;

    try {
      setIsDeleting(true);
      await data.actionFunction(data.rowId);
      toast.success(`تم حذف ${data.itemName} بنجاح`);
      closeModal();
      router.refresh();
    } catch (error) {
      console.error("خطأ أثناء الحذف:", error);
      toast.error("حدث خطأ أثناء الحذف");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="relative w-full max-w-md space-y-6 rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
        <LuTriangleAlert className="h-6 w-6" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-gray-950">
          هل أنت متأكد من الحذف؟
        </h3>
        <p className="mx-auto max-w-sm text-sm text-gray-500">
          سيتم حذف{" "}
          {data.itemName ? (
            <span className="font-semibold text-gray-900">
              «{data.itemName}»
            </span>
          ) : (
            "هذا الصف"
          )}
          . لا يمكن التراجع عن هذا الإجراء.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-gray-100 pt-5">
        <button
          type="button"
          onClick={closeModal}
          disabled={isDeleting}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 cursor-pointer"
        >
          {isDeleting ? "جارٍ الحذف..." : "نعم، احذف"}
        </button>
      </div>
    </div>
  );
}

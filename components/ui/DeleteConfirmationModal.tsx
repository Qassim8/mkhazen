"use client";

import { useState } from "react";
import { useTable } from "@/store/useTable";
import { LuTriangleAlert } from "react-icons/lu";
import { useRouter } from "next/navigation";

export default function DeleteConfirmationModal() {
  const deleteConfirmation = useTable((state) => state.deleteConfirmation);
  const hideDeleteConfirmation = useTable(
    (state) => state.hideDeleteConfirmation,
  );
  const rowId = useTable((state) => state.deleteRowId);
  const itemName = useTable((state) => state.deleteItemName);
  const deleteFunction = useTable((state) => state.deleteFunction); // 👈 استخراج دالة الحذف

  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  if (!deleteConfirmation) return null;

  const handleDelete = async () => {
    if (!rowId || !deleteFunction) return;

    try {
      setIsDeleting(true);
      await deleteFunction(rowId); // 👈 تنفيذ دالة الحذف الممررة

      hideDeleteConfirmation();
      router.refresh(); // تحديث الصفحة بعد الحذف
    } catch (error) {
      console.error("خطأ أثناء الحذف:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="إغلاق نافذة تأكيد الحذف"
        onClick={hideDeleteConfirmation}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
      />

      <div
        dir="rtl"
        className="relative w-full max-w-md space-y-6 rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-2xl"
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
            {itemName ? (
              <span className="font-semibold text-gray-900">«{itemName}»</span>
            ) : (
              "هذا الصف"
            )}
            . لا يمكن التراجع عن هذا الإجراء.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-gray-100 pt-5">
          <button
            type="button"
            onClick={hideDeleteConfirmation}
            disabled={isDeleting}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            {isDeleting ? "جارٍ الحذف..." : "نعم، احذف"}
          </button>
        </div>
      </div>
    </div>
  );
}

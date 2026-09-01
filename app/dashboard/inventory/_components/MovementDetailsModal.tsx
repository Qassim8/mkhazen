"use client";

import { InventoryMovement } from "../services/inventory.services";
import {
  LuX,
  LuCalendar,
  LuPackage,
  LuHash,
  LuFileText,
  LuArrowDownLeft,
  LuArrowUpRight,
  LuRefreshCcw,
} from "react-icons/lu";

interface MovementDetailsModalProps {
  movement: InventoryMovement | null;
  onClose: () => void;
}

export default function MovementDetailsModal({
  movement,
  onClose,
}: MovementDetailsModalProps) {
  if (!movement) return null;

  const isStockIn = movement.movement_type === "STOCK_IN";
  const isStockOut = movement.movement_type === "STOCK_OUT";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-950">تفاصيل الحركة</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 pt-4 text-sm">
          {/* نوع الحركة والحالة */}
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
            <span className="text-gray-500">نوع العملية:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                isStockIn
                  ? "bg-emerald-100 text-emerald-800"
                  : isStockOut
                    ? "bg-rose-100 text-rose-800"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {isStockIn ? (
                <LuArrowDownLeft />
              ) : isStockOut ? (
                <LuArrowUpRight />
              ) : (
                <LuRefreshCcw />
              )}
              {isStockIn
                ? "إدخال مخزني"
                : isStockOut
                  ? "إخراج مخزني"
                  : "تسوية يدوية"}
            </span>
          </div>

          {/* تفاصيل المنتج */}
          <div className="flex items-start gap-3">
            <LuPackage className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">المنتج</p>
              <p className="font-semibold text-gray-900">
                {movement.products?.name || "منتج غير محدد"}
              </p>
              {movement.products?.barcode && (
                <p className="text-xs text-gray-500 font-mono">
                  باركود: {movement.products.barcode}
                </p>
              )}
            </div>
          </div>

          {/* الكمية */}
          <div className="flex items-center justify-between border-y border-gray-100 py-3">
            <span className="text-gray-500">الكمية المسجلة:</span>
            <span
              className={`font-mono text-base font-bold ${
                movement.quantity < 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {movement.quantity > 0
                ? `+${movement.quantity}`
                : movement.quantity}
            </span>
          </div>

          {/* التاريخ */}
          <div className="flex items-center gap-3">
            <LuCalendar className="h-5 w-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">التاريخ والوقت</p>
              <p className="text-gray-800">
                {new Date(movement.created_at).toLocaleString("ar-EG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>

          {/* الرقم المرجعي */}
          <div className="flex items-center gap-3">
            <LuHash className="h-5 w-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">الرقم المرجعي</p>
              <p className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 w-fit mt-0.5">
                {movement.reference || "لا يوجد مرجع"}
              </p>
            </div>
          </div>

          {/* ملاحظات / السبب */}
          <div className="flex items-start gap-3 pt-1">
            <LuFileText className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">الملاحظات / السبب</p>
              <p className="text-gray-700 text-xs mt-0.5 leading-relaxed bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {movement.notes || "لم يتم تسجيل أي ملاحظات مع هذه الحركة."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { InventoryMovement } from "../services/inventory.services";
import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuBarcode,
  LuCalendar,
  LuDollarSign,
  LuFileText,
  LuHash,
  LuPackage,
  LuUserRound,
  LuX,
} from "react-icons/lu";

interface MovementDetailsModalProps {
  movement: InventoryMovement | null;
  onClose: () => void;
}

const MOVEMENT_LABELS: Record<InventoryMovement["movement_type"], string> = {
  PURCHASE: "شراء",
  SALE: "بيع",
  PURCHASE_RETURN: "مرتجع شراء",
  SALE_RETURN: "مرتجع بيع",
  ADJUSTMENT_IN: "تسوية إدخال",
  ADJUSTMENT_OUT: "تسوية إخراج",
  PRODUCTION_ISSUE: "صرف للإنتاج",
  PRODUCTION_RECEIPT: "استلام من الإنتاج",
  GIFT: "إهداء",
  OPENING_STOCK: "مخزون افتتاحي",
};

const STOCK_IN_TYPES: InventoryMovement["movement_type"][] = [
  "PURCHASE",
  "SALE_RETURN",
  "ADJUSTMENT_IN",
  "PRODUCTION_RECEIPT",
  "OPENING_STOCK",
];

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

export default function MovementDetailsModal({
  movement,
  onClose,
}: MovementDetailsModalProps) {
  if (!movement) return null;

  const isStockIn = STOCK_IN_TYPES.includes(movement.movement_type);
  const variant = movement.product_variants;
  const template = variant?.product_templates;
  const quantity = Math.abs(Number(movement.quantity));
  const linkedOrder =
    movement.purchase_orders?.order_number ||
    movement.sales_orders?.order_number;
  const unit = template?.sellingUnit || template?.purchaseUnit || "وحدة";
  const movementDate = new Date(movement.created_at);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-details-title"
        dir="rtl"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3
            id="movement-details-title"
            className="text-lg font-bold text-gray-950"
          >
            تفاصيل الحركة المخزنية
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 pt-4 text-sm">
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
            <span className="text-gray-500">نوع الحركة</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                isStockIn
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isStockIn ? (
                <LuArrowDownLeft className="h-4 w-4" />
              ) : (
                <LuArrowUpRight className="h-4 w-4" />
              )}
              {MOVEMENT_LABELS[movement.movement_type]}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <LuPackage className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-400">المنتج</p>
              <p className="font-semibold text-gray-900">
                {template?.name || "منتج غير محدد"}
              </p>
              {(variant?.colorName || variant?.size) && (
                <p className="mt-1 text-xs text-gray-600">
                  {[variant.colorName, variant.size]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}
              <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-2">
                <span>
                  رمز الصنف:{" "}
                  <b className="font-mono text-gray-700">{variant?.sku || "—"}</b>
                </span>
                <span>
                  وحدة المخزون: <b className="text-gray-700">{unit}</b>
                </span>
              </div>
            </div>
          </div>

          {(variant?.barcode || variant?.packBarcode) && (
            <div className="grid gap-2 rounded-xl border border-gray-100 p-3 text-xs sm:grid-cols-2">
              {variant.barcode && (
                <p className="flex items-center gap-2 text-gray-600">
                  <LuBarcode className="h-4 w-4 shrink-0 text-gray-400" />
                  باركود القطعة:{" "}
                  <span className="font-mono text-gray-800">
                    {variant.barcode}
                  </span>
                </p>
              )}
              {variant.packBarcode && (
                <p className="flex items-center gap-2 text-gray-600">
                  <LuBarcode className="h-4 w-4 shrink-0 text-gray-400" />
                  باركود العبوة:{" "}
                  <span className="font-mono text-gray-800">
                    {variant.packBarcode}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-y border-gray-100 py-3">
            <div>
              <p className="text-xs text-gray-400">الكمية</p>
              <p
                className={`mt-1 font-mono text-base font-bold ${
                  isStockIn ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {isStockIn ? "+" : "−"}
                {formatNumber(quantity)} {unit}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">تكلفة الوحدة</p>
              <p className="mt-1 flex items-center gap-1 font-mono font-semibold text-gray-800">
                <LuDollarSign className="h-4 w-4 text-gray-400" />
                {formatNumber(Number(movement.unit_cost))}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <LuCalendar className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">التاريخ والوقت</p>
                <p className="text-gray-800">
                  {Number.isNaN(movementDate.getTime())
                    ? "غير متوفر"
                    : movementDate.toLocaleString("ar-EG-u-nu-latn", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <LuUserRound className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">سجّلها</p>
                <p className="text-gray-800">
                  {movement.users?.name || "النظام"}
                </p>
              </div>
            </div>
          </div>

          {(linkedOrder || movement.reference) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {linkedOrder && (
                <div className="flex items-start gap-3">
                  <LuHash className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">رقم المستند المرتبط</p>
                    <p className="mt-0.5 w-fit rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                      {linkedOrder}
                    </p>
                  </div>
                </div>
              )}
              {movement.reference && (
                <div className="flex items-start gap-3">
                  <LuHash className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">المرجع</p>
                    <p className="mt-0.5 w-fit rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                      {movement.reference}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-3">
            <LuFileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-400">الملاحظات / السبب</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-700">
                {movement.notes || "لم يتم تسجيل ملاحظات لهذه الحركة."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            إغلاق
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { createPortal } from "react-dom";
import { LuCheck, LuLoader, LuPackageCheck } from "react-icons/lu";

import { formatUSD } from "@/lib/currency";
import {
  formatUnitNumber,
  purchaseUnitInfo,
  stockQuantity,
} from "@/lib/purchase-units";

export interface PurchaseConfirmRow {
  key: string;
  name: string;
  /** تفاصيل الصنف (لون/مقاس) */
  details?: string;
  quantity: number;
  unitCost: number;
  purchaseUnit?: string | null;
  sellingUnit?: string | null;
  conversionFactor?: number | null;
}

interface Props {
  title: string;
  description?: string;
  confirmLabel: string;
  rows: PurchaseConfirmRow[];
  /** إجمالي الطلب (يشمل الشحن والخصم) */
  total: number;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** ملخص قبل الحفظ أو الاستلام: الكمية بوحدة الشراء وما سيُضاف للمخزون بوحدة البيع والتكلفة */
export default function PurchaseConfirmModal({
  title,
  description,
  confirmLabel,
  rows,
  total,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-5">
          <h3 className="flex items-center gap-2 text-lg font-black text-gray-950">
            <LuPackageCheck className="h-5 w-5 text-(--primary-red)" />
            {title}
          </h3>
          {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
        </div>

        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-150 text-right text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">الصنف</th>
                <th className="px-3 py-2 font-medium">الكمية (وحدة الشراء)</th>
                <th className="px-3 py-2 font-medium">ما سيُضاف للمخزون (وحدة البيع)</th>
                <th className="px-3 py-2 font-medium">التكلفة</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const info = purchaseUnitInfo(row);

                return (
                  <tr key={row.key} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-900">{row.name}</p>
                      {row.details && <p className="mt-0.5 text-xs text-gray-500">{row.details}</p>}
                    </td>

                    <td className="px-3 py-3 text-gray-800">
                      {formatUnitNumber(row.quantity)} {info.purchaseUnit}
                    </td>

                    <td className="px-3 py-3 text-base font-black text-emerald-700">
                      {formatUnitNumber(stockQuantity(row.quantity, info))} {info.sellingUnit}
                    </td>

                    <td className="px-3 py-3 font-mono text-gray-800">
                      {formatUSD(row.quantity * row.unitCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900">
            <span>إجمالي الطلب (بعد الشحن والخصم)</span>
            <span className="font-mono">{formatUSD(total)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
          >
            رجوع للتعديل
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuCheck className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

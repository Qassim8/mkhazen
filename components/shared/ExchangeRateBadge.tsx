"use client";

import { LuBadgeDollarSign, LuRefreshCw } from "react-icons/lu";

import { formatRate } from "@/lib/currency";
import { useExchangeRate } from "./useExchangeRate";

interface Props {
  showRefresh?: boolean;
}

export default function ExchangeRateBadge({ showRefresh = false }: Props) {
  const { rate, isLoading, refresh } = useExchangeRate();

  if (isLoading && !rate) return null;

  if (!rate) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700">
        لا يوجد سعر صرف مسجّل
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700"
      title="سعر الصرف الحالي"
    >
      <LuBadgeDollarSign className="h-3.5 w-3.5" />
      {formatRate(rate)}
      {showRefresh && (
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-1 rounded p-0.5 hover:bg-emerald-100"
          aria-label="تحديث سعر الصرف"
        >
          <LuRefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

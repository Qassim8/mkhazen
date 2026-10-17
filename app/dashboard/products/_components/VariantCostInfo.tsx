"use client";

/**
 * التكلفة الحقيقية للمتغير (عرض فقط — للمالك والمدير؛ صفحات المنتجات صلاحيتها catalog.manage):
 *   • التكلفة الفعلية = averageCost (متوسط مرجّح شامل الشحن) بالدولار وبالجنيه
 *   • آخر سعر شراء = purchasePrice (مرجعي يُكتب يدويًا)
 *   • هامش الربح = sellingPrice − averageCost، مبلغًا ونسبة
 */

import { formatSDG, formatUSD, usdToSdg } from "@/lib/currency";
import { useExchangeRate } from "@/components/shared/useExchangeRate";

const COST_TOOLTIP = "محسوبة تلقائيًا من المشتريات الفعلية شاملة الشحن";

export default function VariantCostInfo({
  sellingPrice,
  averageCost,
  purchasePrice,
  compact = false,
}: {
  sellingPrice: number;
  averageCost: number | null | undefined;
  purchasePrice: number | null | undefined;
  compact?: boolean;
}) {
  const { rate } = useExchangeRate();
  const cost = Number(averageCost ?? 0);
  const selling = Number(sellingPrice ?? 0);
  const margin = selling - cost;
  const marginPercent = selling > 0 ? (margin / selling) * 100 : 0;
  const negative = margin < 0;

  return (
    <div className={compact ? "space-y-0.5 text-[11px]" : "space-y-1.5 text-xs"}>
      {cost > 0 ? (
        <>
          <p title={COST_TOOLTIP} className="cursor-help">
            <span className="text-gray-400">التكلفة الفعلية: </span>
            <strong className="text-gray-900" dir="ltr">{formatUSD(cost)}</strong>
            {rate ? (
              <span className="mr-1 text-gray-400" dir="ltr">
                ≈ {formatSDG(usdToSdg(cost, rate))}
              </span>
            ) : null}
          </p>
          <p className={negative ? "font-bold text-red-600" : "text-emerald-700"}>
            <span className={negative ? "" : "text-gray-400"}>هامش الربح: </span>
            <span dir="ltr">
              {formatUSD(margin)} ({marginPercent.toFixed(1)}%)
            </span>
          </p>
        </>
      ) : (
        <p className="text-amber-700" title={COST_TOOLTIP}>
          لا توجد تكلفة محسوبة بعد
        </p>
      )}
      <p className="text-[10px] text-gray-400">
        آخر سعر شراء: <span dir="ltr">{formatUSD(Number(purchasePrice ?? 0))}</span>
      </p>
    </div>
  );
}

import { creditValuation } from "@/lib/credit";
import { formatSDG, formatUSD } from "@/lib/currency";

const shortRate = (value: number | null) =>
  value ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

/**
 * كتلة تقييم المتبقي في إيصالات الذمم (80mm / PDF) — للعميل.
 * بدون أي تكلفة أو ربح: سعر الصرف يوم الشراء ← اليوم، قيمة المتبقي بالدولار، نسبة الانخفاض،
 * والمبلغ المعادل لقيمته الأصلية اليوم.
 */
export default function CreditValuationBlock({
  remainingSdg,
  saleRate,
  currentRate,
}: {
  remainingSdg: number;
  saleRate: number | null;
  currentRate: number | null;
}) {
  const valuation = creditValuation({ remainingSdg, saleRate, currentRate });

  if (remainingSdg <= 0 || valuation.usdAtSale == null || valuation.usdNow == null) {
    return null;
  }

  return (
    <div className="space-y-1 border-t border-dashed border-black pt-3 text-[11px]">
      <p className="text-[10px] font-bold">تقييم المتبقي</p>

      <div className="flex justify-between gap-2">
        <span>سعر الصرف ج.س/$ (يوم الشراء ← اليوم)</span>
        <span dir="ltr" className="text-left">
          {shortRate(valuation.saleRate)} ← {shortRate(valuation.currentRate)}
        </span>
      </div>

      <div className="flex justify-between gap-2">
        <span>قيمة المتبقي بالدولار (يوم الشراء ← اليوم)</span>
        <span dir="ltr" className="text-left">
          {formatUSD(valuation.usdAtSale)} ← {formatUSD(valuation.usdNow)}
        </span>
      </div>

      {valuation.lossPct != null && (
        <>
          <div className="flex justify-between gap-2">
            <span>نسبة الانخفاض</span>
            <span dir="ltr" className="text-left font-bold">
              {valuation.lossPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
            </span>
          </div>

          {valuation.equivalentSdgToday != null && (
            <div className="mt-1 rounded border border-black p-1.5 text-center text-[11px] font-black">
              <p className="text-[9px] font-semibold">المبلغ المعادل لقيمته الأصلية اليوم</p>
              <p>{formatSDG(valuation.equivalentSdgToday)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

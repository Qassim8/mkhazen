import { IconType } from "react-icons";
import {
  LuArrowDownRight,
  LuArrowUpRight,
  LuChartNoAxesCombined,
  LuCircleDollarSign,
  LuMinus,
  LuScissors,
  LuShoppingBag,
  LuWalletCards,
} from "react-icons/lu";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  statType?: "increase" | "decrease" | "stable";
  statNumber?: number | null;
  comparisonLabel?: string;
  /** Controls colour only; an increase in expenses is not a positive outcome. */
  isFavorable?: boolean;
}

const ICONS: Record<string, IconType> = {
  الإيرادات: LuChartNoAxesCombined,
  المصروفات: LuWalletCards,
  "صافي الربح": LuCircleDollarSign,
  "عمليات البيع المكتملة": LuShoppingBag,
  "طلبات التفصيل النشطة": LuScissors,
};

const ICON_BACKGROUNDS: Record<string, string> = {
  الإيرادات: "var(--primary-red)",
  المصروفات: "var(--primary-pink)",
  "صافي الربح": "#16a34a",
  "عمليات البيع المكتملة": "#8b5cf6",
  "طلبات التفصيل النشطة": "#333",
};

const StatsCard = ({
  title,
  value,
  description,
  statType = "stable",
  statNumber,
  comparisonLabel,
  isFavorable,
}: StatsCardProps) => {
  const Icon = ICONS[title] ?? LuChartNoAxesCombined;
  const iconBg = ICON_BACKGROUNDS[title] ?? "var(--primary-red)";
  const hasComparison = statNumber !== undefined;
  const calculatedType =
    statNumber === undefined || statNumber === null || statNumber === 0
      ? "stable"
      : statNumber > 0
        ? "increase"
        : "decrease";
  const displayType = hasComparison ? calculatedType : statType;
  const favorable =
    displayType === "stable"
      ? null
      : (isFavorable ?? displayType === "increase");
  const TrendIcon =
    displayType === "increase"
      ? LuArrowUpRight
      : displayType === "decrease"
        ? LuArrowDownRight
        : LuMinus;
  const changeText =
    statNumber === null || statNumber === undefined
      ? "لا توجد بيانات سابقة للمقارنة"
      : `${statNumber > 0 ? "+" : ""}${statNumber.toLocaleString(
          "ar-SA-u-nu-latn",
          {
            maximumFractionDigits: 1,
          },
        )}% ${comparisonLabel ?? "مقارنة بالفترة السابقة"}`;

  return (
    <div className="frame h-full flex flex-col justify-between p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <h3 className="text-xs sm:text-sm font-medium text-gray-500 truncate">
            {title}
          </h3>
          {/* تحسين حجم العرض ليتناسب مع الأرقام التي تتجاوز 10,000 دون تكسير للتصميم */}
          <div className="my-2 overflow-hidden">
            <p
              className="text-xl sm:text-2xl 2xl:text-3xl font-bold tracking-tight text-gray-900 leading-tight wrap-break-word tabular-nums"
              title={String(value)}
            >
              {value}
            </p>
          </div>
        </div>

        <div
          style={{
            backgroundColor: iconBg,
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-white md:h-11 md:w-11 md:rounded-xl md:text-xl"
        >
          <Icon />
        </div>
      </div>

      <div>
        {hasComparison ? (
          <p
            className={`flex items-center gap-1 text-[11px] sm:text-xs font-medium ${
              favorable === true
                ? "text-emerald-600"
                : favorable === false
                  ? "text-rose-600"
                  : "text-gray-500"
            }`}
          >
            <TrendIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{changeText}</span>
          </p>
        ) : (
          <p className="text-[11px] sm:text-xs text-gray-500 truncate">
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatsCard;

import { IconType } from "react-icons";
import {
  LuChartNoAxesCombined,
  LuCircleDollarSign,
  LuScissors,
  LuWalletCards,
} from "react-icons/lu";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  statType?: "increase" | "decrease" | "stable";
  statNumber?: number;
}

const ICONS: Record<string, IconType> = {
  الإيرادات: LuChartNoAxesCombined,
  المصروفات: LuWalletCards,
  "صافي الربح": LuCircleDollarSign,
  "طلبات التفصيل النشطة": LuScissors,
};

const ICON_BACKGROUNDS: Record<string, string> = {
  الإيرادات: "var(--primary-red)",
  المصروفات: "var(--primary-pink)",
  "صافي الربح": "#16a34a",
  "طلبات التفصيل النشطة": "#8b5cf6",
};

const StatsCard = ({ title, value, description }: StatsCardProps) => {
  const Icon = ICONS[title] ?? LuChartNoAxesCombined;

  const iconBg = ICON_BACKGROUNDS[title] ?? "var(--primary-red)";

  return (
    <div className="frame">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>

          <p className="my-2 text-2xl font-semibold text-gray-900 md:text-4xl">
            {value}
          </p>
        </div>

        <div
          style={{
            backgroundColor: iconBg,
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-white shadow-md md:h-11 md:w-11 md:rounded-xl md:text-xl"
        >
          <Icon />
        </div>
      </div>

      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
};

export default StatsCard;

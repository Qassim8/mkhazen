import { StatsCardProps } from "@/types/types";
import { LuArrowDownLeft, LuArrowUpRight } from "react-icons/lu";

const StatsCard = ({
  title,
  value,
  icon: Icon,
  iconBg,
  statNumber,
  statType,
}: StatsCardProps) => {
  return (
    <div className="frame hover:scale-[1.05]">
      <div className="flex justify-between mb-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="text-4xl font-semibold text-gray-900 my-3">{value}</p>
        </div>
        <div
          style={{ backgroundColor: `${iconBg}` }}
          className={`text-xl flex h-11 w-11 items-center justify-center rounded-xl text-white bg-[${iconBg}] shadow-md`}
        >
          <Icon />
        </div>
      </div>
      <div className="mt-4">
        <p className="flex items-center gap-2">
          {statType === "increase" ? (
            <span className="text-green-600 flex items-center gap-1 text-xs py-0.5 px-2 font-semibold rounded-full bg-green-100/70">
              <LuArrowUpRight /> <span>{statNumber}%</span>
            </span>
          ) : statType === "decrease" ? (
            <span className="text-red-600 flex items-center gap-1 text-xs py-0.5 px-2 font-semibold rounded-full bg-red-100/70">
              <LuArrowDownLeft /> <span>{statNumber}%</span>
            </span>
          ) : (
            <span className="text-amber-500 text-xs py-0.5 px-2 font-semibold rounded-full bg-amber-100/70">
              stable
            </span>
          )}
          <span className="text-gray-500 text-xs">منذ اخر اسبوع</span>
        </p>
      </div>
    </div>
  );
};

export default StatsCard;

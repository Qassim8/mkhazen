import { ReactNode } from "react";

export type CardVariant =
  | "default"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "purple"
  | "emerald"
  | "amber"
  | "slate";

export interface OverviewCardProps {
  title: string;
  value: string | number;
  valueClass?: string;
  icon?: ReactNode;
  variant?: CardVariant;
}

const variantStyles: Record<
  CardVariant,
  { bg: string; text: string; border: string }
> = {
  default: {
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
  },
  danger: {
    bg: "bg-rose-50",
    text: "text-rose-600",
    border: "border-rose-100",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-600",
    border: "border-amber-100",
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-100",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-600",
    border: "border-purple-100",
  },
  emerald: {
    bg: "bg-teal-50",
    text: "text-teal-600",
    border: "border-teal-100",
  },
  amber: {
    bg: "bg-orange-50",
    text: "text-orange-600",
    border: "border-orange-100",
  },
  slate: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  },
};

const OverviewCard = ({
  title,
  value,
  valueClass,
  icon,
  variant = "default",
}: OverviewCardProps) => {
  const styles = variantStyles[variant] ?? variantStyles.default;

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">{title}</p>
        <p className={`text-2xl font-black text-gray-950 ${valueClass ?? ""}`}>
          {value}
        </p>
      </div>

      {icon && (
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl border ${styles.bg} ${styles.text} ${styles.border}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
};

export default OverviewCard;

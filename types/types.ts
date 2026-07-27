export type StatsCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg?: string;
  statNumber: number;
  statType: "increase" | "decrease" | "neutral";
};

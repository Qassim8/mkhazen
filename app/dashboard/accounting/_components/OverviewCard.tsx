export interface OverviewCardProps {
  title: string;
  value: string | number;
  valueClass?: string;
}

const OverviewCard = ({ title, value, valueClass }: OverviewCardProps) => {
  return (
    <div className="rounded-xl border border-gray-300 bg-card p-5">
      <p className="text-sm text-muted-foreground">{title}</p>

      <p className={`mt-3 text-2xl font-bold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
};

export default OverviewCard;

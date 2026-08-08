"use client";
import { Pie, PieChart } from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

const PieChartComponent = ({
  isAnimationActive = true,
}: {
  isAnimationActive?: boolean;
}) => {
  const data = [
    {
      name: "احذية",
      value: 250,
      fill: "var(--primary-red)",
    },
    { name: "جلاليب", value: 200, fill: "var(--primary-pink)" },
    { name: "على الله", value: 160, fill: "#f5a50f" },
    { name: "اخرى", value: 400, fill: "var(--primary-red-hover)" },
  ];

  return (
    <div className="frame h-[60vh]">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-gray-500">الاعلى مبيعاً</p>
        <h2 className="font-semibold text-gray-900">الاصناف</h2>
      </div>
      <div className="pt-3">
        <PieChart
          style={{
            width: "100%",
            maxWidth: "200px",
            maxHeight: "100%",
            margin: "0 auto",
            aspectRatio: 1,
          }}
          responsive
        >
          <Pie
            data={data}
            innerRadius="70%"
            outerRadius="100%"
            // Corner radius is the rounded edge of each pie slice
            cornerRadius="2%"
            fill="#8884d8"
            // padding angle is the gap between each pie slice
            paddingAngle={3}
            dataKey="value"
            isAnimationActive={isAnimationActive}
          />
          <RechartsDevtools />
        </PieChart>
      </div>
      <div className="pt-3 flex flex-wrap justify-between items-center">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: entry.fill }}
            />
            <span className="text-sm font-medium">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PieChartComponent;

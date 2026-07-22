import { Pie, PieChart } from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

// #region Sample data
const data = [
  { name: "Electronics", value: 350, fill: "#b91c1c" },
  { name: "Clothing", value: 180, fill: "#df346a" },
  { name: "Home & Garden", value: 150, fill: "#FFBB28" },
  { name: "Sports", value: 200, fill: "#FF8042" },
];

// #endregion
export default function CategoriesPieChart({
  isAnimationActive = true,
}: {
  isAnimationActive?: boolean;
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Top Categories</p>
          <h2 className="text-lg font-semibold text-gray-900">Distribution</h2>
        </div>
      </div>
      <PieChart
        style={{
          width: "100%",
          maxWidth: "200px",
          maxHeight: "50vh",
          aspectRatio: 1,
          margin: "0 auto",
        }}
        responsive
      >
        <Pie
          data={data}
          innerRadius="70%"
          outerRadius="100%"
          // Corner radius is the rounded edge of each pie slice

          fill="#8884d8"
          // padding angle is the gap between each pie slice
          paddingAngle={2}
          dataKey="value"
          isAnimationActive={isAnimationActive}
        />
        <RechartsDevtools />
      </PieChart>
      <div className="flex items-center gap-3 flex-wrap mt-8">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-sm text-gray-600">{item.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

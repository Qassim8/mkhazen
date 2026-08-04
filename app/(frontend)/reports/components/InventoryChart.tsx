"use client";
import { Bar, BarChart, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

const data = [
  { name: "Jan", in: 320, out: 240 },
  { name: "Feb", in: 410, out: 300 },
  { name: "Mar", in: 380, out: 350 },
  { name: "Apr", in: 520, out: 410 },
  { name: "May", in: 470, out: 460 },
  { name: "Jun", in: 610, out: 490 },
];

const InventoryChart = () => {
  return (
    <div className="frame">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500">Inventory Overview</p>
          <h2 className="font-semibold text-gray-900">
            Stock in vs. Stock out
          </h2>
        </div>
      </div>
      <div className="pt-5">
        <BarChart
          style={{
            width: "100%",
            maxHeight: "45vh",
            aspectRatio: 1.618,
          }}
          responsive
          data={data}
          margin={{
            top: 5,
            right: 0,
            left: 0,
            bottom: 5,
          }}
        >
          <XAxis
            dataKey="name"
            style={{ border: "none !important", fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width="auto"
            style={{ border: "none !important", fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="in"
            fill="var(--primary-red)"
            activeBar={{ fill: "var(--primary-red)" }}
            radius={[5, 5, 0, 0]}
          />
          <Bar
            dataKey="out"
            fill="var(--primary-pink)"
            activeBar={{ fill: "var(--primary-pink)" }}
            radius={[5, 5, 0, 0]}
          />
          <RechartsDevtools />
        </BarChart>
      </div>
    </div>
  );
};

export default InventoryChart;

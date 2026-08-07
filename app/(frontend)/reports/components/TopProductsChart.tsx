"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const data = [
  { name: "Page A", uv: 4000, pv: 2400, amt: 2400 },
  { name: "Page B", uv: 3000, pv: 1398, amt: 2210 },
  { name: "Page C", uv: 2000, pv: 9800, amt: 2290 },
  { name: "Page D", uv: 2780, pv: 3908, amt: 2000 },
  { name: "Page E", uv: 1890, pv: 4800, amt: 2181 },
  { name: "Page F", uv: 2390, pv: 3800, amt: 2500 },
  { name: "Page G", uv: 3490, pv: 4300, amt: 2100 },
];

const TopProductsChart = () => {
  return (
    <section className="frame max-h-[60vh]">
      <div className="flex flex-col gap-1 pb-3">
        <p className="text-sm text-gray-500">المباع حسب الوحدة</p>
        <h2 className="font-semibold text-gray-900">المنتجات الاعلى</h2>
      </div>
      <div>
        <BarChart
          style={{
            width: "100%",
            maxWidth: "100%",
            maxHeight: "45vh",
            aspectRatio: 1,
          }}
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 30, left: -30, bottom: 5 }}
        >
          <XAxis
            type="number"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="auto"
            dataKey="name"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <CartesianGrid strokeDasharray="4 4" horizontal={false} />
          <Tooltip />
          <Bar dataKey="pv" fill="var(--primary-pink)" />
        </BarChart>
      </div>
    </section>
  );
};

export default TopProductsChart;

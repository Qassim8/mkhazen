"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

const data = [
  {
    name: "A",
    uv: 400,
    pv: 240,
    amt: 2400,
  },
  {
    name: "B",
    uv: 300,
    pv: 456,
    amt: 2400,
  },
  {
    name: "C",
    uv: 300,
    pv: 139,
    amt: 2400,
  },
  {
    name: "D",
    uv: 200,
    pv: 980,
    amt: 2400,
  },
  {
    name: "E",
    uv: 278,
    pv: 390,
    amt: 2400,
  },
  {
    name: "F",
    uv: 189,
    pv: 480,
    amt: 2400,
  },
];

const RevenueChart = () => {
  return (
    <section className="frame max-h-[85vh] mt-10">
      <div className="flex flex-col gap-2 mb-5">
        <p className="text-sm text-gray-500">Sales Overview</p>
        <h2 className="font-semibold text-gray-900">Revenue vs. Profit</h2>
      </div>
      <div>
        <ComposedChart
          style={{
            width: "100%",
            maxHeight: "70vh",
            aspectRatio: 1.618,
          }}
          responsive
          data={data}
          margin={{
            top: 20,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <CartesianGrid strokeDasharray="5 5" vertical={false} />
          <XAxis
            dataKey="name"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width="auto"
            style={{ fontSize: "12px" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Bar dataKey="uv" barSize={30} fill="var(--primary-red)" />
          <Line type="monotone" dataKey="uv" stroke="var(--primary-pink)" />
          <RechartsDevtools />
        </ComposedChart>
      </div>
    </section>
  );
};

export default RevenueChart;

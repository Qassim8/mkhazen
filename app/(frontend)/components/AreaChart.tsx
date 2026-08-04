"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

const AreaChartComponent = ({ isAnimationActive = true }) => {
  const data = [
    { name: "Jan", ايراد: 13.325, ربح: 3.325 },
    { name: "Feb", ايراد: 20.125, ربح: 5.825 },
    { name: "Mar", ايراد: 23.875, ربح: 3.525 },
    { name: "Apr", ايراد: 35.235, ربح: 15.235 },
    { name: "May", ايراد: 40.575, ربح: 7.625 },
    { name: "Jun", ايراد: 41.115, ربح: 20.953 },
  ];

  return (
    <div className="frame h-[60vh]">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500">نظرة عامة على المبيعات</p>
          <h2 className="font-semibold text-gray-900">الارباح x الايرادات</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-(--primary-red)" />
            <span className="text-sm font-medium">الايرادات</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-(--primary-pink)" />
            <span className="text-sm font-medium">الارباح</span>
          </div>
        </div>
      </div>
      <div className="pt-10 h-[55vh] max-h-[55vh]">
        <AreaChart
          style={{
            direction: "rtl",
            width: "100%",
            maxWidth: "100%",
            maxHeight: "40vh",
            aspectRatio: 1.618,
          }}
          responsive
          data={data}
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--primary-red)"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="var(--primary-red)"
                stopOpacity={0}
              />
            </linearGradient>
            <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--primary-pink)"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="var(--primary-pink)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} />
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
          <Area
            type="monotone"
            dataKey="ايراد"
            stroke="var(--primary-red)"
            fillOpacity={1}
            fill="url(#colorUv)"
            isAnimationActive={isAnimationActive}
            animationBegin={200}
            animationDuration={1300}
          />
          <Area
            type="monotone"
            dataKey="ربح"
            stroke="var(--primary-pink)"
            fillOpacity={1}
            fill="url(#colorPv)"
            isAnimationActive={isAnimationActive}
          />
          <RechartsDevtools />
        </AreaChart>
      </div>
    </div>
  );
};

export default AreaChartComponent;

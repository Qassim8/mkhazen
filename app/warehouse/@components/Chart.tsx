import { RechartsDevtools } from "@recharts/devtools";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const WHChart = () => {
  const data = [
    { month: "Jan", in: 320, out: 280 },
    { month: "Feb", in: 410, out: 300 },
    { month: "Mar", in: 380, out: 350 },
    { month: "Apr", in: 520, out: 400 },
    { month: "May", in: 460, out: 440 },
    { month: "Jun", in: 620, out: 490 },
    { month: "Jul", in: 630, out: 450 },
  ];

  return (
    <div className="">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Inventory Movement</p>
          <h2 className="text-lg font-semibold text-gray-900">
            Stock In vs Out
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full bg-[#b91c1c]"></div>
            <span className="text-sm text-gray-600">Stock In</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full bg-[#d8382c]"></div>
            <span className="text-sm text-gray-600">Stock Out</span>
          </div>
        </div>
      </div>
      <div className="h-70">
        <AreaChart
          style={{
            width: "100%",
            height: "100%",
            aspectRatio: 1.618,
          }}
          responsive
          data={data}
        >
          <defs>
            <linearGradient id="InGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.15} />

              <stop offset="95%" stopColor="#b91c1c" stopOpacity={0} />
            </linearGradient>
          </defs>

          <defs>
            <linearGradient id="OutGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%" stopColor="#d8382c" stopOpacity={0.15} />

              <stop offset="95%" stopColor="#d8382c" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* خطوط أفقية فقط */}

          <CartesianGrid
            vertical={false}
            stroke="#e2e8f0"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            interval={0}
          />

          <YAxis width={45} tickMargin={15} axisLine={false} tickLine={false} />

          <Tooltip />

          <Area
            type="monotone"
            dataKey="in"
            stroke="#b91c1c"
            strokeWidth={3}
            fill="url(#InGradient)"
            name="in"
            animationBegin={200}
            animationDuration={1500}
            activeDot={{
              r: 6,
            }}
          />

          <Area
            type="monotone"
            dataKey="out"
            stroke="#d8382c"
            strokeWidth={3}
            fill="url(#OutGradient)"
            name="out"
            animationBegin={200}
            animationDuration={1500}
            activeDot={{
              r: 6,
            }}
          />

          <RechartsDevtools />
        </AreaChart>
      </div>
    </div>
  );
};

export default WHChart;

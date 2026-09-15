"use client";

import { useMemo } from "react";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LuPackageX } from "react-icons/lu";

import { InventoryMovement } from "../services/inventory.services";

interface Props {
  movements: InventoryMovement[];
}

const isIncoming = (type: InventoryMovement["movement_type"]) =>
  type === "PURCHASE" || type === "SALE_RETURN" || type === "ADJUSTMENT_IN";

export default function BarChartComponent({ movements }: Props) {
  const data = useMemo(() => {
    const months: Record<
      string,
      {
        name: string;
        in: number;
        out: number;
      }
    > = {};

    [...movements].reverse().forEach((movement) => {
      const date = new Date(movement.created_at);

      const key = `${date.getFullYear()}-${date.getMonth()}`;

      if (!months[key]) {
        months[key] = {
          name: date.toLocaleDateString("en-US", {
            month: "short",
          }),
          in: 0,
          out: 0,
        };
      }

      const quantity = Math.abs(Number(movement.quantity || 0));

      if (isIncoming(movement.movement_type)) {
        months[key].in += quantity;
      } else {
        months[key].out += quantity;
      }
    });

    return Object.values(months);
  }, [movements]);

  if (!data.length) {
    return (
      <div className="frame flex h-105 flex-col">
        <div>
          <p className="text-sm text-gray-500">تتبع المخزون</p>

          <h2 className="mt-1 font-semibold text-gray-900">
            إدخال مقابل إخراج
          </h2>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
          <LuPackageX className="mb-2 h-12 w-12 stroke-1 text-gray-300" />

          <p className="text-sm font-medium text-gray-500">
            لا توجد تحركات مخزنية بعد
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="frame h-105">
      <div>
        <p className="text-sm text-gray-500">تتبع المخزون</p>

        <h2 className="mt-1 font-semibold text-gray-900">إدخال مقابل إخراج</h2>
      </div>

      <div className="mt-6 h-82.5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              style={{
                fontSize: "12px",
              }}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              style={{
                fontSize: "12px",
              }}
            />

            <Tooltip />

            <Legend />

            <Bar
              dataKey="in"
              name="إدخال"
              fill="var(--primary-red, #ef4444)"
              radius={[5, 5, 0, 0]}
            />

            <Bar
              dataKey="out"
              name="إخراج"
              fill="var(--primary-pink, #f43f5e)"
              radius={[5, 5, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

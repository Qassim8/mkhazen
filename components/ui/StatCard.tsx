import React from "react";
import { IconType } from "react-icons";
import { FiArrowUpRight, FiArrowDownRight } from "react-icons/fi";

interface StatCardProps {
  icon?: IconType | React.ReactNode;
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
}

export function StatCard({ icon, label, value, change, trend }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm">
      <div className="h-5 w-5 rounded-xl flex justify-center items-center">
        {icon}
      </div>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-3 flex items-end justify-between">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm ${trend === "up" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {trend === "up" ? (
            <FiArrowUpRight className="h-4 w-4" />
          ) : (
            <FiArrowDownRight className="h-4 w-4" />
          )}
          {change}
        </div>
      </div>
    </div>
  );
}

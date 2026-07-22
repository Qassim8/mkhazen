"use client";

import { StatCard } from '@/components/ui/StatCard';
import { financeMetrics } from '@/data/mock-data';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Financial Reports</h1>
        <p className="mt-2 text-sm text-gray-600">Monitor revenue, expenses, margin and outstanding balances.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {financeMetrics.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} change={item.change} trend={item.trend} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Inflow vs Outflow</h2>
          <div className="mt-4 flex h-52 items-end justify-between gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
            {[30, 52, 44, 68, 62, 76].map((height, index) => (
              <div key={index} className="flex-1 rounded-t-2xl bg-red-500/80" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Top Selling Products</h2>
          <div className="mt-4 space-y-3">
            {['Wireless Headset', 'Smart Lamp', 'Ergo Chair'].map((product, index) => (
              <div key={product} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="font-medium text-gray-900">{product}</div>
                <div className="text-sm text-gray-600">{index + 1}st</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Threshold vs Current</h2>
        <div className="mt-4 h-40 rounded-2xl border border-dashed border-gray-300 bg-[linear-gradient(90deg,#fef2f2,#ffffff,#f9fafb)] p-4">
          <div className="flex h-full items-center justify-between">
            <div className="h-20 w-20 rounded-full border-[10px] border-red-200" />
            <div className="h-28 w-28 rounded-full border-[12px] border-red-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

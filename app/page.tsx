"use client";

import { useState } from "react";
import {
  FiBox,
  FiPlus,
  FiRefreshCw,
  FiBarChart2,
  FiAlertTriangle,
} from "react-icons/fi";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import { events, financeMetrics, products } from "@/data/mock-data";
import WHChart from "./warehouse/@components/Chart";
import CategoriesPieChart from "./categories/@components/Chart";
import Link from "next/link";

export default function DashboardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Your store is healthy and ready for the next move."
        actionLabel="Quick Action"
        onAction={() => setIsModalOpen(true)}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {financeMetrics.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            change={item.change}
            trend={item.trend}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <WHChart />
        </div>

        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <CategoriesPieChart />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Add Product",
            icon: FiBox,
            color: "bg-red-600",
            link: "/products/new",
          },
          {
            label: "Add Supplier",
            icon: FiBox,
            color: "bg-gray-800",
            link: "/suppliers/new",
          },
          {
            label: "New Movement",
            icon: FiRefreshCw,
            color: "bg-orange-500",
            link: "/movements/new",
          },
          {
            label: "Generate Report",
            icon: FiBarChart2,
            color: "bg-emerald-600",
            link: "/reports/new",
          },
        ].map((action) => (
          <Link
            href={action.link}
            key={action.label}
            className="flex items-center justify-between rounded-2xl border border-gray-300 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5"
          >
            <div>
              <div
                className={`mb-2 inline-flex rounded-xl p-2 text-white ${action.color}`}
              >
                <action.icon className="h-4 w-4" />
              </div>
              <div className="font-medium text-gray-900">{action.label}</div>
            </div>
            <FiPlus className="h-4 w-4 text-gray-400" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Recent Events</h2>
          <div className="mt-4 space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3"
              >
                <div className="mt-1 rounded-full bg-red-100 p-2 text-red-600">
                  <FiAlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{event.title}</div>
                  <div className="text-sm text-gray-600">{event.detail}</div>
                  <div className="mt-1 text-xs text-gray-500">{event.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Low Stock Watch
          </h2>
          <div className="mt-4 space-y-3">
            {products
              .filter((item) => item.status !== "In Stock")
              .map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 ${item.status === "Out of Stock" ? "border-red-300 bg-red-50" : "border-yellow-300 bg-yellow-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "Out of Stock" ? "bg-red-600 text-white" : "bg-yellow-500 text-white"}`}
                    >
                      {item.status}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    Stock: {item.stock} units
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <Modal
        title="Quick Action"
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <div className="space-y-3 text-sm text-gray-700">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            Create a new product entry
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            Log a warehouse movement
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            Generate a financial report
          </div>
        </div>
      </Modal>
    </div>
  );
}

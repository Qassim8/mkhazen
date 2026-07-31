"use client"; // نحتاج هذا لأننا سنستخدم الـ State للتبديل بين الصفحات

import { useState } from "react";
import { LuBuilding2, LuLock, LuUserRound } from "react-icons/lu";

// 1. تعريف التبويبات (Tabs)
const tabs = [
  { id: "personal", title: "Personal Info", icon: LuUserRound },
  { id: "company", title: "Company Info", icon: LuBuilding2 },
  { id: "password", title: "Password Setting", icon: LuLock },
];

export default function SettingsPage() {
  // الـ State المسؤول عن تحديد التبويب النشط حالياً
  const [activeTab, setActiveTab] = useState("personal");

  return (
    <div className="space-y-6">
      {/* 2. شريط التنقل العلوي البسيط (Sub-Navbar) */}
      <div className="flex border-b border-gray-200 bg-white px-4 py-2 rounded-2xl shadow-sm gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-(--primary-red)/10 text-(--primary-red)"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.title}
            </button>
          );
        })}
      </div>

      {/* 3. منطقة عرض محتوى الصفحة بناءً على التبويب المختارة */}
      <div className="p-6 bg-white rounded-3xl border border-gray-200 custom-shadow min-h-75">
        {activeTab === "personal" && (
          <div className="space-y-6">
            <div className="">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
                  <LuUserRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Profile details
                  </h2>
                  <p className="text-sm text-gray-500">
                    Update your personal information here.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Full Name
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="John Doe"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="john@matjrey.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Phone
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="+20 100 123 4567"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Location
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="Cairo, Egypt"
                  />
                </label>
              </div>

              <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
                Save Personal Info
              </button>
            </div>
          </div>
        )}

        {activeTab === "company" && (
          <div className="space-y-6">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
                  <LuBuilding2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Company details
                  </h2>
                  <p className="text-sm text-gray-500">
                    Update your business information here.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Company Name
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="Matjrey Store"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Address
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="Cairo, Egypt"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Tax Number
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="EG-874521"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Industry
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="Retail"
                  />
                </label>
              </div>

              <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
                Save Company Info
              </button>
            </div>
          </div>
        )}

        {activeTab === "password" && (
          <div className="space-y-6">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--primary-red)/10 text-(--primary-red)">
                  <LuLock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Password update
                  </h2>
                  <p className="text-sm text-gray-500">
                    Change your password securely here.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Current Password
                  </span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="********"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    New Password
                  </span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="********"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Confirm Password
                  </span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-(--primary-red) focus:bg-white"
                    defaultValue="********"
                  />
                </label>
              </div>

              <button className="mt-6 rounded-xl bg-(--primary-red) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--primary-red-hover)">
                Update Password
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

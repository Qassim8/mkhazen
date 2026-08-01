"use client"; // نحتاج هذا لأننا سنستخدم الـ State للتبديل بين الصفحات

import PageHeader from "@/components/shared/PageHeader";
import { useState } from "react";
import { LuBuilding2, LuLock, LuUserRound } from "react-icons/lu";
import PersonalInfo from "./components/PersonalInfo";
import CompanyInfo from "./components/CompanyInfo";
import Password from "./components/Password";

// 1. تعريف التبويبات (Tabs)
const tabs = [
  { id: "personal", title: "Personal Info", icon: LuUserRound },
  { id: "company", title: "Company Info", icon: LuBuilding2 },
  { id: "password", title: "Password Setting", icon: LuLock },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("personal");

  return (
    <main>
      <PageHeader
        title="Settings"
        subtitle="aanage your account, workspace and preferences"
      />
      <div className="space-y-5">
        <div className="flex justify-between border-b border-gray-200 bg-white p-2 rounded-xl custom-shadow gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`grow flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer ${
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

        <div className="p-6 bg-white rounded-3xl border border-gray-200 custom-shadow min-h-75">
          {activeTab === "personal" && <PersonalInfo />}

          {activeTab === "company" && <CompanyInfo />}

          {activeTab === "password" && <Password />}
        </div>
      </div>
    </main>
  );
}

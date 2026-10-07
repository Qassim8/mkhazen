"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { LuBadgeDollarSign, LuLock, LuUserRound } from "react-icons/lu";
import PersonalInfo from "./_components/PersonalInfo";
import Password from "./_components/Password";
import ExchangeRateSettings from "./_components/ExchangeRate";
import { getMe } from "@/app/(login)/services/auth.services";
import { can, homePageFor } from "@/lib/permissions";

const baseTabs = [
  { id: "personal", title: "المعلومات الشخصية", icon: LuUserRound },
  { id: "password", title: "إعدادات كلمة السر", icon: LuLock },
];

const adminTabs = [
  { id: "exchange-rate", title: "سعر الصرف", icon: LuBadgeDollarSign },
];

// useSearchParams محتاج Suspense عشان الصفحة تتبني (next build)
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function tabsFor(role: string | null) {
  return can(role, "exchangeRate.manage") ? [...baseTabs, ...adminTabs] : baseTabs;
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState("personal");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const tabs = tabsFor(role);

  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const user = await getMe();
        const userRole = user?.role ?? null;
        setRole(userRole);

        if (user && !user.isPasswordChanged) {
          setMustChangePassword(true);
          setActiveTab("password");
        } else if (tabParam && tabsFor(userRole).some((t) => t.id === tabParam)) {
          // إذا وُجد بارامتر في الرابط ومتاح لصلاحيات المستخدم، اجعله هو النشط
          setActiveTab(tabParam);
        } else {
          setMustChangePassword(false);
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkUserStatus();
  }, [tabParam]);

  return (
    <main>
      <PageHeader
        title="الإعدادات"
        subtitle="إدارة حسابك ومساحة العمل وتفضيلاتك"
      />

      {mustChangePassword && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm font-medium">
          ⚠️ يرجى تغيير كلمة المرور الافتراضية الخاصة بك للمتابعة واستخدام
          النظام.
        </div>
      )}

      <div className="space-y-5">
        <div className="flex justify-between border-b border-gray-200 bg-white p-2 rounded-lg gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled = mustChangePassword && tab.id !== "password";

            return (
              <button
                key={tab.id}
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    setActiveTab(tab.id);
                    // تحديث الـ URL بسلاسة بدون إعادة تحميل الصفحة
                    router.replace(`/dashboard/settings?tab=${tab.id}`, {
                      scroll: false,
                    });
                  }
                }}
                className={`grow flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isDisabled
                    ? "opacity-40 cursor-not-allowed text-gray-400"
                    : isActive
                      ? "bg-(--primary-red)/10 text-(--primary-red) cursor-pointer"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.title}
              </button>
            );
          })}
        </div>

        <div className="mb-5 p-6 bg-white rounded-3xl border border-gray-200 min-h-75">
          {activeTab === "personal" && <PersonalInfo />}

          {activeTab === "exchange-rate" &&
            can(role, "exchangeRate.manage") && (
              <ExchangeRateSettings />
            )}

          {activeTab === "password" && (
            <Password
              onSuccess={(userRole: string) => {
                setMustChangePassword(false);
                window.location.assign(homePageFor(userRole));
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}

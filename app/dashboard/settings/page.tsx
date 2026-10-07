"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { LuLock, LuUserRound } from "react-icons/lu";
import PersonalInfo from "./components/PersonalInfo";
import Password from "./components/Password";
import { getMe } from "@/app/(login)/services/auth.services";

const tabs = [
  { id: "personal", title: "المعلومات الشخصية", icon: LuUserRound },
  { id: "password", title: "إعدادات كلمة السر", icon: LuLock },
];

export default function SettingsPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("personal");
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const user = await getMe();
        console.log(user);
        console.log(user.isPassowrdChanged);
        if (user && !user.isPasswordChanged) {
          setMustChangePassword(true);
          setActiveTab("password");
        } else {
          setMustChangePassword(false);
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkUserStatus();
  }, []);

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
                onClick={() => !isDisabled && setActiveTab(tab.id)}
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

        <div className="mb-5 p-6 bg-white rounded-3xl border border-gray-200 custom-shadow min-h-75">
          {activeTab === "personal" && <PersonalInfo />}

          {activeTab === "password" && (
            <Password
              onSuccess={(userRole: string) => {
                const roleRoutes: Record<string, string> = {
                  admin: "/dashboard",
                  cashier: "/dashboard/pos",
                  tailor: "/dashboard/orders",
                };

                setMustChangePassword(false);

                router.refresh();
                router.push(roleRoutes[userRole] || "/dashboard");
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}

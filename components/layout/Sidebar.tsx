"use client";

import { useTable } from "@/store/useTable";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuCalculator,
  LuFileChartColumn,
  LuFolderTree,
  LuLayers,
  LuLayoutDashboard,
  LuPackage2,
  LuPackageCheck,
  LuSettings,
  LuStore,
  LuTruck,
  LuUsers,
  LuX,
} from "react-icons/lu";

const links = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LuLayoutDashboard },
  { href: "/dashboard/products", label: "المنتجات", icon: LuPackage2 },
  { href: "/dashboard/categories", label: "الفئات", icon: LuFolderTree },
  { href: "/dashboard/employees", label: "الموظفين", icon: LuUsers },
  { href: "/dashboard/suppliers", label: "الموردين", icon: LuPackageCheck },
  { href: "/dashboard/orders", label: "الطلبيات", icon: LuTruck },
  { href: "/dashboard/pos", label: "نقطة البيع", icon: LuStore },
  { href: "/dashboard/inventory", label: "المخازن", icon: LuLayers },
  { href: "/dashboard/accounting", label: "الحسابات", icon: LuCalculator },
  { href: "/dashboard/reports", label: "التقارير", icon: LuFileChartColumn },
  { href: "/dashboard/settings", label: "الاعدادات", icon: LuSettings },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useTable((state) => state.sidebarOpen);
  const sidebarToggler = useTable((state) => state.sidebarToggler);

  return (
    <div className="">
      {sidebarOpen && (
        <div
          onClick={() => sidebarToggler(false)}
          className="fixed top-0 right-0 inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden transition-opacity duration-300 animate-fadeIn"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 right-0 h-full md:h-screen w-56 flex flex-col border-e border-gray-200 bg-white p-6 z-40 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
      >
        <div className="mb-6 flex items-center justify-between md:hidden">
          <button
            type="button"
            onClick={() => sidebarToggler(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700"
            aria-label="Close sidebar"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <Link
          href="/"
          onClick={() => sidebarToggler(false)}
          className="mb-10 block"
        >
          <div className="flex items-center gap-3">
            <LuStore className="text-(--primary-red) text-2xl" />
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-(--primary-red)">
              متجري
            </p>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">
            نظام ادارة المتاجر
          </h2>
        </Link>

        <nav className="space-y-1.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => sidebarToggler(false)} // يغلق السايد بار في الموبايل تلقائياً بعد الضغط على الرابط
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-(--primary-red)/15 text-(--primary-red)"
                    : "text-gray-700 hover:bg-(--primary-red)/10 hover:text-(--primary-red)"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

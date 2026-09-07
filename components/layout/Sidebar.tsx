"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMe } from "@/app/(login)/services/auth.services";
import {
  LuBoxes,
  LuCalculator,
  LuChevronDown,
  LuFileChartColumn,
  LuFolderTree,
  LuLayers,
  LuLayoutDashboard,
  LuPackage2,
  LuPackageCheck,
  LuSettings,
  LuShoppingCart,
  LuStore,
  LuTruck,
  LuUsers,
  LuX,
} from "react-icons/lu";

interface SubMenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

interface MenuItem {
  href?: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
  subItems?: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  {
    href: "/dashboard",
    label: "لوحة التحكم",
    icon: LuLayoutDashboard,
    roles: ["admin"],
  },
  // القائمة المنسدلة للمنتجات والمشتريات والموردين
  {
    label: "المنتجات والمشتريات",
    icon: LuPackage2,
    roles: ["admin"],
    subItems: [
      {
        href: "/dashboard/categories",
        label: "الفئات",
        icon: LuFolderTree,
        roles: ["admin"],
      },
      {
        href: "/dashboard/suppliers",
        label: "الموردين",
        icon: LuPackageCheck,
        roles: ["admin"],
      },
      {
        href: "/dashboard/products",
        label: "المنتجات",
        icon: LuBoxes,
        roles: ["admin"],
      },
      {
        href: "/dashboard/orders",
        label: "المشتريات والتوريد",
        icon: LuShoppingCart,
        roles: ["admin"],
      },
    ],
  },
  {
    href: "/dashboard/employees",
    label: "الموظفين",
    icon: LuUsers,
    roles: ["admin"],
  },
  {
    href: "/dashboard/pos",
    label: "نقطة البيع",
    icon: LuStore,
    roles: ["admin", "cashier"],
  },
  {
    href: "/dashboard/inventory",
    label: "المخازن",
    icon: LuLayers,
    roles: ["admin"],
  },
  {
    href: "/dashboard/accounting",
    label: "الحسابات",
    icon: LuCalculator,
    roles: ["admin"],
  },
  {
    href: "/dashboard/reports",
    label: "التقارير",
    icon: LuFileChartColumn,
    roles: ["admin"],
  },
  {
    href: "/dashboard/settings",
    label: "الاعدادات",
    icon: LuSettings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const sidebarToggler = useUIStore((state) => state.sidebarToggler);

  const [userRole, setUserRole] = useState<string | null>(null);

  const isProductsChildActive =
    pathname.startsWith("/dashboard/products") ||
    pathname.startsWith("/dashboard/categories") ||
    pathname.startsWith("/dashboard/purchases") ||
    pathname.startsWith("/dashboard/suppliers") ||
    pathname.startsWith("/dashboard/orders");

  const [isProductsDropdownOpen, setIsProductsDropdownOpen] = useState<boolean>(
    isProductsChildActive,
  );

  // تحديث حالة القائمة المنسدلة تلقائياً عند تغيير المسار
  useEffect(() => {
    if (isProductsChildActive) {
      setIsProductsDropdownOpen(true);
    }
  }, [pathname, isProductsChildActive]);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const user = await getMe();
        if (user) {
          const role = user?.role || "cashier";
          setUserRole(role);
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
      }
    };
    fetchRole();
  }, []);

  const filteredMenuItems = menuItems
    .filter((item) => {
      if (!item.roles) return true;
      if (!userRole) return false;
      return item.roles.includes(userRole);
    })
    .map((item) => {
      if (item.subItems) {
        return {
          ...item,
          subItems: item.subItems.filter(
            (sub) => !sub.roles || (userRole && sub.roles.includes(userRole)),
          ),
        };
      }
      return item;
    });

  return (
    <div>
      {sidebarOpen && (
        <div
          onClick={() => sidebarToggler(false)}
          className="fixed inset-0 top-0 right-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn md:hidden"
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-40 flex h-full w-60 flex-col overflow-y-auto border-e border-gray-200 bg-white p-5 transition-transform duration-300 ease-in-out md:sticky md:h-screen ${
          sidebarOpen ? "translate-x-5" : "translate-x-70 md:translate-x-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between md:hidden">
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
          className="mb-8 block"
        >
          <div className="flex items-center gap-2.5">
            <LuStore className="text-2xl text-(--primary-red)" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-(--primary-red)">
              متجري
            </p>
          </div>
          <h2 className="mt-1.5 text-lg font-bold text-gray-900">
            نظام إدارة المتاجر
          </h2>
        </Link>

        <nav className="space-y-1">
          {filteredMenuItems.map((item, index) => {
            // حالة القوائم المنسدلة
            if (item.subItems && item.subItems.length > 0) {
              const isGroupActive = isProductsChildActive;

              return (
                <div key={index} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setIsProductsDropdownOpen((prev) => !prev)}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                      isGroupActive
                        ? "bg-(--primary-red)/10 text-(--primary-red)"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    <LuChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isProductsDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* الروابط الفرعية داخل القائمة المنسدلة */}
                  {isProductsDropdownOpen && (
                    <div className="mr-3 space-y-1 border-r-2 border-gray-100 pr-2 pt-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        const SubIcon = sub.icon;

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => sidebarToggler(false)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                              isSubActive
                                ? "bg-(--primary-red)/70 text-white"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            <SubIcon className="h-3.5 w-3.5" />
                            <span>{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // الروابط العادية المباشرة
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => sidebarToggler(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-(--primary-red)/15 font-semibold text-(--primary-red)"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

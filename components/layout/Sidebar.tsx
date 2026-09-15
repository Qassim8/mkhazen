"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getMe } from "@/app/(login)/services/auth.services";
import { useUIStore } from "@/store/useUIStore";

import {
  LuBoxes,
  LuCalculator,
  LuChevronDown,
  LuClipboardList,
  LuFileChartColumn,
  LuFolderTree,
  LuHouse,
  LuLayers,
  LuPackageCheck,
  LuPackageOpen,
  LuSettings,
  LuShoppingCart,
  LuStore,
  LuUsers,
  LuWalletCards,
  LuX,
  LuLandmark,
} from "react-icons/lu";

interface SubMenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
  exact?: boolean;
}

interface MenuItem {
  href?: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
  subItems?: SubMenuItem[];
  exact?: boolean;
}

const menuItems: MenuItem[] = [
  /* =========================================================
     DASHBOARD
  ========================================================= */

  {
    href: "/dashboard",
    label: "لوحة التحكم",
    icon: LuHouse,
    roles: ["admin"],
    exact: true,
  },

  /* =========================================================
     PRODUCTS
  ========================================================= */

  {
    label: "إدارة المنتجات",
    icon: LuPackageOpen,
    roles: ["admin"],
    subItems: [
      {
        href: "/dashboard/categories",
        label: "الفئات",
        icon: LuFolderTree,
        roles: ["admin"],
      },
      {
        href: "/dashboard/products",
        label: "المنتجات",
        icon: LuBoxes,
        roles: ["admin"],
      },
    ],
  },

  /* =========================================================
     PURCHASES
  ========================================================= */

  {
    label: "المشتريات والتوريد",
    icon: LuShoppingCart,
    roles: ["admin"],
    subItems: [
      {
        href: "/dashboard/suppliers",
        label: "الموردون",
        icon: LuUsers,
        roles: ["admin"],
      },
      {
        href: "/dashboard/orders",
        label: "المشتريات",
        icon: LuClipboardList,
        roles: ["admin"],
      },
    ],
  },

  /* =========================================================
     POS
  ========================================================= */

  {
    href: "/dashboard/pos",
    label: "نقطة البيع",
    icon: LuStore,
    roles: ["admin", "cashier"],
  },

  /* =========================================================
     INVENTORY
  ========================================================= */

  {
    href: "/dashboard/inventory",
    label: "المخزون",
    icon: LuLayers,
    roles: ["admin"],
  },

  /* =========================================================
     EMPLOYEES
  ========================================================= */

  {
    href: "/dashboard/employees",
    label: "الموظفون",
    icon: LuUsers,
    roles: ["admin"],
  },

  /* =========================================================
     ACCOUNTING
  ========================================================= */

  {
    label: "المحاسبة",
    icon: LuCalculator,
    roles: ["admin"],
    subItems: [
      {
        href: "/dashboard/accounting",
        label: "نظرة عامة",
        icon: LuWalletCards,
        roles: ["admin"],
        exact: true,
      },
      {
        href: "/dashboard/accounting/journals",
        label: "القيود اليومية",
        icon: LuLandmark,
        roles: ["admin"],
        exact: true,
      },
      {
        href: "/dashboard/accounting/assets",
        label: "الأصول",
        icon: LuPackageCheck,
        roles: ["admin"],
      },
    ],
  },

  /* =========================================================
     REPORTS
  ========================================================= */

  {
    href: "/dashboard/reports",
    label: "التقارير",
    icon: LuFileChartColumn,
    roles: ["admin"],
  },

  /* =========================================================
     SETTINGS
  ========================================================= */

  {
    href: "/dashboard/settings",
    label: "الإعدادات",
    icon: LuSettings,
    roles: ["admin"],
  },
];

/* =========================================================
   PATH MATCHING
========================================================= */

function isPathActive(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href;
  }

  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  const sidebarToggler = useUIStore((state) => state.sidebarToggler);

  const [userRole, setUserRole] = useState<string | null>(null);

  /* =======================================================
     OPEN GROUPS

     كل مجموعة مستقلة.
     يمكن فتح أكثر من مجموعة في نفس الوقت.
  ======================================================= */

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  /* =======================================================
     USER ROLE
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    async function fetchRole() {
      try {
        const user = await getMe();

        if (!mounted) {
          return;
        }

        setUserRole(user?.role ?? "cashier");
      } catch (error) {
        console.error("Error fetching user role:", error);
      }
    }

    fetchRole();

    return () => {
      mounted = false;
    };
  }, []);

  /* =======================================================
     FILTER MENU
  ======================================================= */

  const filteredMenuItems = useMemo(() => {
    return menuItems
      .filter((item) => {
        if (!item.roles) {
          return true;
        }

        if (!userRole) {
          return false;
        }

        return item.roles.includes(userRole);
      })
      .map((item) => {
        if (!item.subItems) {
          return item;
        }

        return {
          ...item,

          subItems: item.subItems.filter(
            (sub) => !sub.roles || (userRole && sub.roles.includes(userRole)),
          ),
        };
      })
      .filter((item) => !item.subItems || item.subItems.length > 0);
  }, [userRole]);

  /* =======================================================
     GROUP TOGGLE
  ======================================================= */

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);

      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  };

  return (
    <div>
      {/* ===================================================
          MOBILE BACKDROP
      =================================================== */}

      {sidebarOpen && (
        <div
          onClick={() => sidebarToggler(false)}
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
        />
      )}

      {/* ===================================================
          SIDEBAR
      =================================================== */}

      <aside
        className={`
          fixed right-0 top-0 z-40
          flex h-full w-64 flex-col
          overflow-y-auto
          border-e border-gray-200
          bg-white p-5
          transition-transform duration-300 ease-in-out
          md:sticky md:h-screen
          ${sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
      >
        {/* =================================================
            MOBILE HEADER
        ================================================= */}

        <div className="mb-5 flex items-center justify-between md:hidden">
          <span className="text-sm font-semibold text-gray-500">القائمة</span>

          <button
            type="button"
            onClick={() => sidebarToggler(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200"
            aria-label="إغلاق القائمة"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        {/* =================================================
            LOGO
        ================================================= */}

        <Link
          href="/"
          onClick={() => sidebarToggler(false)}
          className="mb-8 block"
        >
          <div className="flex items-center gap-2.5">
            <LuStore className="h-6 w-6 text-(--primary-red)" />

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-(--primary-red)">
              متجري
            </p>
          </div>

          <h2 className="mt-1.5 text-lg font-bold text-gray-900">
            نظام إدارة المتاجر
          </h2>
        </Link>

        {/* =================================================
            NAVIGATION
        ================================================= */}

        <nav className="space-y-1">
          {filteredMenuItems.map((item) => {
            /* =============================================
                 GROUP
              ============================================= */

            if (item.subItems && item.subItems.length > 0) {
              const groupKey = item.label;

              const isOpen = openGroups.has(groupKey);

              const isChildActive = item.subItems.some((sub) =>
                isPathActive(pathname, sub.href, sub.exact),
              );

              const GroupIcon = item.icon;

              return (
                <div key={groupKey} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className={`
                        flex w-full items-center justify-between
                        rounded-xl px-3.5 py-2.5
                        text-sm font-medium
                        transition
                        ${
                          isChildActive
                            ? "bg-(--primary-red)/10 text-(--primary-red)"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        }
                      `}
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-3">
                      <GroupIcon className="h-4 w-4 shrink-0" />

                      <span>{item.label}</span>
                    </span>

                    <LuChevronDown
                      className={`
                          h-4 w-4
                          transition-transform duration-200
                          ${isOpen ? "rotate-180" : ""}
                        `}
                    />
                  </button>

                  {/* =======================================
                        SUB ITEMS
                    ======================================= */}

                  <div
                    className={`
                        overflow-hidden
                        transition-all duration-200
                        ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
                      `}
                  >
                    <div className="mr-3 space-y-1 border-r-2 border-gray-100 pr-2 pt-1">
                      {item.subItems.map((sub) => {
                        const active = isPathActive(
                          pathname,
                          sub.href,
                          sub.exact,
                        );

                        const SubIcon = sub.icon;

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => sidebarToggler(false)}
                            className={`
                                  flex items-center gap-2.5
                                  rounded-lg px-3 py-2.5
                                  text-xs font-medium
                                  transition
                                  ${
                                    active
                                      ? "bg-(--primary-red)/60 text-white"
                                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                  }
                                `}
                          >
                            <SubIcon className="h-4 w-4 shrink-0" />

                            <span>{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            /* =============================================
                 DIRECT LINK
              ============================================= */

            const Icon = item.icon;

            const active =
              !!item.href && isPathActive(pathname, item.href, item.exact);

            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => sidebarToggler(false)}
                className={`
                    flex items-center gap-3
                    rounded-xl px-3.5 py-2.5
                    text-sm font-medium
                    transition
                    ${
                      active
                        ? "bg-(--primary-red) font-semibold text-white shadow-sm"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }
                  `}
              >
                <Icon className="h-4 w-4 shrink-0" />

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

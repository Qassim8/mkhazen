"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiGrid,
  FiPackage,
  FiLayers,
  FiTruck,
  FiArchive,
  FiBarChart2,
  FiSettings,
  FiUsers,
  FiShoppingCart,
} from "react-icons/fi";

const links = [
  { href: "/", label: "Dashboard", icon: FiGrid },
  { href: "/products", label: "Products", icon: FiPackage },
  { href: "/categories", label: "Categories", icon: FiLayers },
  { href: "/orders", label: "Purchase Orders", icon: FiTruck },
  { href: "/pos", label: "Sale Orders", icon: FiShoppingCart },
  { href: "/suppliers", label: "Suppliers", icon: FiTruck },
  { href: "/warehouse", label: "Warehouse", icon: FiArchive },
  { href: "/reports", label: "Reports", icon: FiBarChart2 },
  { href: "/users", label: "Users", icon: FiUsers },
  { href: "/settings", label: "Settings", icon: FiSettings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-72 flex-col border-r border-gray-200 bg-white/80 p-6 backdrop-blur lg:flex">
      <div className="mb-8">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-(--primary-red)">
          ERP Mini
        </div>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          Store Control Center
        </h2>
      </div>
      <nav className="space-y-1.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? "bg-(--primary-red) text-white shadow-lg" : "text-gray-700 hover:bg-red-50 hover:text-(--primary-red)"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900">Need a quick overview?</p>
        <p className="mt-1">
          Use the dashboard and reports to keep your store in sync.
        </p>
      </div>
    </aside>
  );
}

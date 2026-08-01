"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
} from "react-icons/lu";

const links = [
  { href: "/", label: "Dashboard", icon: LuLayoutDashboard },
  { href: "/products", label: "Products", icon: LuPackage2 },
  { href: "/categories", label: "Categories", icon: LuFolderTree },
  { href: "/orders", label: "Orders", icon: LuTruck },
  { href: "/pos", label: "POS", icon: LuStore },
  { href: "/suppliers", label: "Suppliers", icon: LuPackageCheck },
  { href: "/inventory", label: "Inventory", icon: LuLayers },
  { href: "/reports", label: "Reports", icon: LuFileChartColumn },
  { href: "/employees", label: "Employees", icon: LuUsers },
  { href: "/settings", label: "Settings", icon: LuSettings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-72 flex-col border-r border-gray-200 bg-white/80 p-6 backdrop-blur lg:flex">
      <Link href="/" className="mb-8">
        <div className="flex items-center gap-3">
          <LuStore className="text-(--primary-red) text-2xl" />
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-(--primary-red)">
            Matjarey
          </p>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">
          ERP Store Control
        </h2>
      </Link>
      <nav className="space-y-1.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${active ? "bg-(--primary-red)/15 text-(--primary-red)" : "text-gray-700 hover:bg-red-50 hover:text-(--primary-red)"}`}
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

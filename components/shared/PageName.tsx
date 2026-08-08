"use client";

import { usePathname } from "next/navigation";

const pageNames: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/dashboard/categories": "الفئات",
  "/dashboard/products": "المنتجات",
  "/dashboard/suppliers": "الموردون",
  "/dashboard/orders": "الطلبات",
  "/dashboard/inventory": "المخزون",
  "/dashboard/employees": "الموظفون",
  "/dashboard/reports": "التقارير",
  "/dashboard/settings": "الإعدادات",
  "/dashboard/pos": "نقطة البيع",
  "/dashboard/accounting": "الحسابات",
  "/dashboard/accounting/accounts": ` الحسابات ${`>`} الشجرة المحاسبية`,
};

const PageName = () => {
  const pathname = usePathname();

  if (!pathname) {
    return <div>لوحة التحكم</div>;
  }

  if (pageNames[pathname]) {
    return <div>{pageNames[pathname]}</div>;
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && pageNames[`/${firstSegment}`]) {
    return <div>{pageNames[`/${firstSegment}`]}</div>;
  }

  return <div>{pathname.slice(1).replace(/-/g, " ")}</div>;
};

export default PageName;

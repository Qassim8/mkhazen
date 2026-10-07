"use client";

import { usePathname } from "next/navigation";

const pageNames: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/dashboard/categories": "الفئات",
  "/dashboard/products": "المنتجات",
  "/dashboard/products/new": "إضافة منتج جديد",
  "/dashboard/suppliers": "الموردون",
  "/dashboard/orders": "المشتريات والتوريد",
  "/dashboard/inventory": "المخزون",
  "/dashboard/inventory/opening-stock": "المخزون الافتتاحي",
  "/dashboard/employees": "الموظفين",
  "/dashboard/reports": "التقارير",
  "/dashboard/settings": "الإعدادات",
  "/dashboard/pos": "الكاشير",
  "/dashboard/pos/receipt": "إيصال البيع",
  "/dashboard/tailoring": "طلبات التفصيل",
  "/dashboard/accounting": "المحاسبة",
  "/dashboard/accounting/journals": "المحاسبة > القيود المحاسبية",
  "/dashboard/accounting/assets": "المحاسبة > الأصول",
  "/dashboard/customers": "العملاء",
};

const dynamicPageNames: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^\/dashboard\/products\/new\/?$/, name: "إضافة منتج جديد" },
  { pattern: /^\/dashboard\/products\/[^/]+\/edit\/?$/, name: "تعديل المنتج" },
  { pattern: /^\/dashboard\/products\/[^/]+\/?$/, name: "تفاصيل المنتج" },
  { pattern: /^\/dashboard\/orders\/new\/?$/, name: "إنشاء أمر شراء جديد" },
  { pattern: /^\/dashboard\/orders\/[^/]+\/edit\/?$/, name: "تعديل أمر الشراء" },
  { pattern: /^\/dashboard\/orders\/[^/]+\/?$/, name: "تفاصيل أمر الشراء" },
  { pattern: /^\/dashboard\/tailoring\/new\/?$/, name: "إنشاء طلب تفصيل" },
  { pattern: /^\/dashboard\/tailoring\/[^/]+\/edit\/?$/, name: "تعديل طلب التفصيل" },
  { pattern: /^\/dashboard\/tailoring\/[^/]+\/?$/, name: "تفاصيل طلب التفصيل" },
  { pattern: /^\/dashboard\/sales\/[^/]+\/?$/, name: "فاتورة البيع" },
  { pattern: /^\/dashboard\/pos\/receipt\/[^/]+\/?$/, name: "إيصال البيع" },
];

const PageName = () => {
  const pathname = usePathname();

  if (!pathname) {
    return <div>لوحة التحكم</div>;
  }

  const normalizedPath = pathname.length > 1
    ? pathname.replace(/\/+$/, "")
    : pathname;
  const pageName = pageNames[normalizedPath];
  if (pageName) {
    return <div>{pageName}</div>;
  }

  const dynamicPage = dynamicPageNames.find(({ pattern }) =>
    pattern.test(normalizedPath),
  );
  if (dynamicPage) {
    return <div>{dynamicPage.name}</div>;
  }

  return <div>لوحة التحكم</div>;
};

export default PageName;

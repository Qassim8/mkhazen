import Link from "next/link";
import {
  LuBadgeDollarSign,
  LuCalculator,
  LuClipboardList,
  LuFileChartColumn,
  LuPackage2,
  LuPackagePlus,
  LuScissorsLineDashed,
} from "react-icons/lu";

export default function QuickActions() {
  const actions = [
    // تم توجيه الرابط مباشرة لفتح صفحة الإعدادات وتنشيط تبويب سعر الصرف
    {
      href: "/dashboard/settings?tab=exchange-rate",
      label: "تحديث سعر الصرف",
      icon: LuBadgeDollarSign,
    },
    {
      href: "/dashboard/orders/new",
      label: "انشاء عملية شراء",
      icon: LuClipboardList,
    },
    {
      href: "/dashboard/products/new",
      label: "إضافة منتج",
      icon: LuPackagePlus,
    },
    { href: "/dashboard/inventory", label: "تتبع المخزون", icon: LuPackage2 },
    {
      href: "/dashboard/accounting/journals",
      label: "تسجيل قيد محاسبي",
      icon: LuCalculator,
    },
    {
      href: "/dashboard/tailoring",
      label: "الخياطة والتصنيع",
      icon: LuScissorsLineDashed,
    },
    {
      href: "/dashboard/reports",
      label: "توليد التقارير",
      icon: LuFileChartColumn,
    },
  ];

  return (
    <div className="frame">
      <div className="mb-5">
        <p className="text-sm text-gray-500">اختصارات للمهام اليومية</p>
        <h2 className="mt-1 font-semibold text-gray-900">تنفيذ سريع</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-xl border border-slate-200 p-3 text-center text-sm font-medium text-gray-700 transition hover:border-(--primary-red) hover:text-(--primary-red)"
            >
              <Icon className="mx-auto mb-2 h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

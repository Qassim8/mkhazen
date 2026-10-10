/**
 * =====================================================================
 * lib/permissions.ts — مرجع الصلاحيات الوحيد في النظام
 * =====================================================================
 * آمن للاستخدام في السيرفر والعميل والـ proxy (مفيش أي استيراد سيرفر).
 * أي تعديل في الصلاحيات يتعمل هنا بس.
 *
 * الأدوار بالترتيب: المالك > المدير > الكاشير > الخياط
 *
 * القاعدة: المالك له كل شيء. المدير له كل شيء ما عدا اعتماد طلبات
 * الشراء (DRAFT → APPROVED). حساب المالك نفسه محمي: محدش يعدّله أو
 * يحذفه غير المالك (ده في api/users/[id]).
 */

export type Role = "owner" | "admin" | "cashier" | "tailor";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "المالك",
  admin: "المدير",
  cashier: "الكاشير",
  tailor: "الخياط",
};

export const PERMISSIONS = {
  /** اعتماد طلبات الشراء (تحويل المسودة لمعتمد) */
  "purchases.approve": ["owner"],
  /** إنشاء/تعديل/إلغاء مسودة، الاستلام، الدفع للمورد */
  "purchases.manage": ["owner", "admin"],

  /** قيود رأس المال */
  "accounting.capital": ["owner", "admin"],
  /** صفحة المحاسبة والقيود */
  "accounting.view": ["owner", "admin"],
  /** مصروفات، إيرادات أخرى، أصول، تحويل عملة */
  "accounting.manage": ["owner", "admin"],
  /** الأرصدة الافتتاحية (نقدية، أصول قائمة، ديون موردين) — مرة واحدة عند بدء التشغيل */
  "accounting.openingBalances": ["owner"],
  /** تسجيل سعر الصرف */
  "exchangeRate.manage": ["owner", "admin"],

  "reports.view": ["owner", "admin"],
  "dashboard.view": ["owner", "admin"],

  /** المنتجات والتصنيفات والموردين والمخزون وتسويته */
  "catalog.manage": ["owner", "admin"],
  /** المخزون الافتتاحي (بيولّد قيد رأس مال) */
  "inventory.openingStock": ["owner", "admin"],

  /** إدارة الكاشير والخياطين */
  "users.manageStaff": ["owner", "admin"],
  /** إضافة/تعديل/حذف المديرين */
  "users.manageAdmins": ["owner", "admin"],
  /** إعادة تعيين كلمة السر لأي موظف (عدا المالك) — عملية تشغيلية */
  "users.resetPasswords": ["owner", "admin"],

  "sales.pos": ["owner", "admin", "cashier"],
  /** سجل المبيعات والفواتير */
  "sales.view": ["owner", "admin"],

  /** إنشاء الطلبات وتحصيل الرصيد من العملاء */
  "tailoring.operate": ["owner", "admin", "cashier"],
  /** إدارة طلبات التفصيل وصرف مستحقات الخياطين */
  "tailoring.manage": ["owner", "admin"],
  /** عرض الطلبات (الخياط: طلباته فقط) وتحديث الحالة */
  "tailoring.view": ["owner", "admin", "cashier", "tailor"],

  /** الإشعارات الإدارية والتشغيلية بحسب الدور */
  "notifications.view": ["owner", "admin", "cashier", "tailor"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function normalizeRole(role: unknown): Role | null {
  let value = String(role ?? "").trim().toLowerCase();
  // جلسات قديمة كانت بتحفظ المسمى الوظيفي بدل الدور
  if (value === "system_manager") value = "admin";
  return value === "owner" || value === "admin" || value === "cashier" || value === "tailor"
    ? value
    : null;
}

export function can(role: unknown, permission: Permission): boolean {
  const normalized = normalizeRole(role);
  return normalized !== null && (PERMISSIONS[permission] as readonly Role[]).includes(normalized);
}

/** هل الدور ده من الإدارة (مالك أو مدير)؟ */
export function isManager(role: unknown) {
  const normalized = normalizeRole(role);
  return normalized === "owner" || normalized === "admin";
}

/* =====================================================================
   الصفحات
===================================================================== */

export const ROLE_HOME_PAGES: Record<Role, string> = {
  owner: "/dashboard",
  admin: "/dashboard",
  cashier: "/dashboard/pos",
  tailor: "/dashboard/tailoring",
};

export function homePageFor(role: unknown) {
  const normalized = normalizeRole(role);
  return normalized ? ROLE_HOME_PAGES[normalized] : "/dashboard/settings";
}

/** كل مسار وصلاحيته — الأطول يتطابق الأول */
const ROUTE_PERMISSIONS: { prefix: string; exact?: boolean; permission: Permission }[] = [
  { prefix: "/dashboard", exact: true, permission: "dashboard.view" },
  { prefix: "/dashboard/accounting/opening-balances", permission: "accounting.openingBalances" },
  { prefix: "/dashboard/accounting", permission: "accounting.view" },
  { prefix: "/dashboard/reports", permission: "reports.view" },
  { prefix: "/dashboard/sales", permission: "sales.view" },
  { prefix: "/dashboard/orders", permission: "purchases.manage" },
  { prefix: "/dashboard/products", permission: "catalog.manage" },
  { prefix: "/dashboard/categories", permission: "catalog.manage" },
  { prefix: "/dashboard/suppliers", permission: "catalog.manage" },
  { prefix: "/dashboard/inventory/opening-stock", permission: "inventory.openingStock" },
  { prefix: "/dashboard/inventory", permission: "catalog.manage" },
  { prefix: "/dashboard/employees", permission: "users.manageStaff" },
  { prefix: "/dashboard/admin", permission: "users.manageStaff" },
  { prefix: "/dashboard/pos", permission: "sales.pos" },
  { prefix: "/dashboard/tailoring/new", permission: "tailoring.operate" },
  { prefix: "/dashboard/tailoring", permission: "tailoring.view" },
  { prefix: "/dashboard/customers", permission: "tailoring.operate" },
];

/** هل الدور يقدر يفتح المسار ده؟ (الإعدادات مفتوحة للجميع) */
export function canAccessPath(role: unknown, pathname: string) {
  if (pathname.startsWith("/dashboard/settings")) return true;

  // مسارات تعديل طلب التفصيل
  if (/^\/dashboard\/tailoring\/[^/]+\/edit/.test(pathname)) {
    return can(role, "tailoring.manage");
  }

  const rule = [...ROUTE_PERMISSIONS]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) =>
      r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
    );

  // أي مسار تحت /dashboard مش متعرف → للإدارة فقط (الأكثر أمانًا)
  if (!rule) return pathname.startsWith("/dashboard") ? isManager(role) : true;

  return can(role, rule.permission);
}

"use client";
import {
  LuPlus,
  LuTrendingUp,
  LuTrendingDown,
  LuWallet,
  LuLayers,
} from "react-icons/lu";
import NewMovement from "./components/NewMovement";

import { useTable } from "@/store/useTable";
import AccountingTable from "./components/AccountingTable";

export default function AccountingDashboardPage() {
  const newMovement = useTable((state) => state.newMovement);
  const showNewMovement = useTable((state) => state.showNewMovement);
  const hideNewMovement = useTable((state) => state.hideNewMovement);

  return (
    <div className="space-y-6 p-4 pb-12">
      {/* الترويسة والأزرار */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-950">
            إدارة الحسابات ودفتر اليومية
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            نظام قيد مزدوج مبسط لإدارة الخزينة والمصروفات والديون بدقة
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/dashboard/accounting/accounts"
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition shadow-sm"
          >
            <LuLayers className="h-4 w-4" /> الشجرة المحاسبية
          </a>
          <button
            type="button"
            onClick={() => {
              return newMovement ? hideNewMovement() : showNewMovement();
            }}
            className="flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 cursor-pointer text-xs font-bold text-white hover:bg-gray-900 transition shadow-sm"
          >
            <LuPlus className="h-4 w-4" /> تسجيل سند صرف / قيد جديد
          </button>
        </div>
      </div>

      {/* كروت الأداء المالي */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-sm text-gray-400 font-bold">
              رصيد الخزينة (الكاش)
            </span>
            <p className="text-2xl font-black text-emerald-600">$4,500.00</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <LuWallet />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-sm text-gray-400 font-bold">
              رصيد تطبيق (بنكك)
            </span>
            <p className="text-2xl font-black text-blue-600">$12,500.00</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <LuTrendingUp />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-sm text-gray-400 font-bold">
              ديون للموردين (على المحل)
            </span>
            <p className="text-2xl font-black text-red-600">$1,200.00</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
            <LuTrendingDown />
          </div>
        </div>
      </div>

      {/* نموذج إنشاء القيد */}
      {newMovement && (
        <div className="fixed inset-0 h-screen z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl">
            <NewMovement />
          </div>
        </div>
      )}

      <AccountingTable />
    </div>
  );
}

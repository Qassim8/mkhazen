"use client";
import { useTable } from "@/store/useTable";
import { FormattedTransaction } from "@/types/types";
import React, { useState } from "react";

const NewMovement = () => {
  const hideNewMovement = useTable((state) => state.hideNewMovement);
  // نموذج مبسط للقيد (مدين ودائن تلقائي لسهولة استخدام البائع/المالك)
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    expenseCategory: "5120", // الحساب المدين (المصروف)
    paymentMethod: "1110", // الحساب الدائن (الكاش أو بنكك)
  });

  const handleAddJournalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: FormattedTransaction = {
      id: `tx-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      description: formData.description,
      debitAccount:
        formData.expenseCategory === "5120"
          ? "5120 - مصروف إيجار المحل"
          : "5130 - رواتب الموظفين",
      creditAccount:
        formData.paymentMethod === "1110"
          ? "1110 - الخزينة النقدية (الكاش)"
          : "1120 - حساب تطبيق بنكك",
      amount: parseFloat(formData.amount),
    };

    hideNewMovement();
    setFormData({
      description: "",
      amount: "",
      expenseCategory: "5120",
      paymentMethod: "1110",
    });
  };
  return (
    <div className="bg-white border border-gray-300 shadow-2xl p-5 rounded-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-gray-300">
        <h3 className="text-sm font-bold text-gray-900">
          تسجيل سند صرف / قيد مزدوج جديد
        </h3>
        <button
          type="button"
          onClick={hideNewMovement}
          className="rounded-full bg-red-500/90 px-2.5 py-1.5 text-xs font-bold cursor-pointer text-white transition hover:bg-red-600"
        >
          X
        </button>
      </div>
      <form
        onSubmit={handleAddJournalEntry}
        className="grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            البيان / الشرح
          </label>
          <input
            type="text"
            required
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="مثال: دفع فاتورة الكهرباء لفرع المحل"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            المبلغ ($)
          </label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: e.target.value })
            }
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            حساب المصروف (المدين)
          </label>
          <select
            value={formData.expenseCategory}
            onChange={(e) =>
              setFormData({ ...formData, expenseCategory: e.target.value })
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:border-gray-400 focus:outline-none"
          >
            <option value="5120">5120 - مصروف إيجار المحل</option>
            <option value="5130">5130 - رواتب وأجور الموظفين</option>
            <option value="5140">5140 - فواتير ومرافق</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            طريقة الدفع (الحساب الدائن - الخصم منه)
          </label>
          <select
            value={formData.paymentMethod}
            onChange={(e) =>
              setFormData({ ...formData, paymentMethod: e.target.value })
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:border-gray-400 focus:outline-none"
          >
            <option value="1110">1110 - الخزينة النقدية (الكاش)</option>
            <option value="1120">1120 - حساب تطبيق بنكك</option>
          </select>
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-gray-300">
          <button
            type="button"
            onClick={hideNewMovement}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-900"
          >
            حفظ القيد
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewMovement;

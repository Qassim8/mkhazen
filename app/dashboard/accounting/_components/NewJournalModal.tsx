"use client";

import { useState } from "react";

import { LuLoaderCircle, LuX } from "react-icons/lu";

import { toast } from "react-hot-toast";

import { createManualJournalEntry } from "../services/accounting.services";

import {
  AccountingAccount,
  CreateManualJournalEntryInput,
} from "../schemas/accounting.schema";

interface NewJournalEntryModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const EXPENSE_ACCOUNTS: {
  value: AccountingAccount;
  label: string;
}[] = [
  {
    value: "ELECTRICITY",
    label: "الكهرباء",
  },
  {
    value: "WATER",
    label: "الماء",
  },
  {
    value: "INTERNET",
    label: "الإنترنت",
  },
  {
    value: "SALARIES",
    label: "الرواتب",
  },
  {
    value: "MAINTENANCE",
    label: "الرواتب والصيانة",
  },
  {
    value: "OTHER_EXPENSE",
    label: "مصروفات أخرى",
  },
];

export default function NewJournalEntryModal({
  onClose,
  onCreated,
}: NewJournalEntryModalProps) {
  const [entryType, setEntryType] = useState<"CAPITAL" | "EXPENSE" | "OTHER">(
    "EXPENSE",
  );

  const [amount, setAmount] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">("CASH");

  const [account, setAccount] = useState<AccountingAccount>("ELECTRICITY");

  const [reference, setReference] = useState("");

  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);

  function resetForm() {
    setEntryType("EXPENSE");
    setAmount("");
    setPaymentMethod("CASH");
    setAccount("ELECTRICITY");
    setReference("");
    setDescription("");
    setLoading(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    if (!description.trim()) {
      toast.error("البيان مطلوب");
      return;
    }

    const payload: CreateManualJournalEntryInput = {
      entryType,

      amount: numericAmount,

      paymentMethod,

      account:
        entryType === "EXPENSE"
          ? account
          : entryType === "OTHER"
            ? "OTHER_INCOME"
            : null,

      reference: reference.trim() || null,

      description: description.trim(),
    };

    try {
      setLoading(true);

      const response = await createManualJournalEntry(payload);

      toast.success(response.message ?? "تم تسجيل القيد بنجاح");

      resetForm();

      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل القيد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">قيد جديد</h2>

            <p className="mt-1 text-xs text-gray-500">
              اختر نوع العملية وسيتم إنشاء القيد تلقائيًا
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* =====================================================
              ENTRY TYPE
          ===================================================== */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                نوع العملية
              </label>

              <select
                value={entryType}
                onChange={(event) =>
                  setEntryType(
                    event.target.value as "CAPITAL" | "EXPENSE" | "OTHER",
                  )
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="EXPENSE">مصروف</option>

                <option value="CAPITAL">إضافة رأس مال</option>

                <option value="OTHER">إيراد آخر</option>
              </select>
            </div>

            {/* =====================================================
              AMOUNT
          ===================================================== */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                المبلغ
              </label>

              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 pl-14 text-sm outline-none focus:border-gray-400"
                />

                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  ر.س
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            {/* =====================================================
              PAYMENT METHOD
          ===================================================== */}

            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                {entryType === "CAPITAL"
                  ? "مكان إيداع رأس المال"
                  : entryType === "OTHER"
                    ? "طريقة استلام الإيراد"
                    : "طريقة الدفع"}
              </label>

              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as "CASH" | "BANK")
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="CASH">الخزينة</option>

                <option value="BANK">البنك</option>
              </select>
            </div>

            {/* =====================================================
              EXPENSE ACCOUNT
          ===================================================== */}

            {entryType === "EXPENSE" && (
              <div className="flex-1">
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  نوع المصروف
                </label>

                <select
                  value={account}
                  onChange={(event) =>
                    setAccount(event.target.value as AccountingAccount)
                  }
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
                >
                  {EXPENSE_ACCOUNTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* =====================================================
              REFERENCE
          ===================================================== */}

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              المرجع
              <span className="mr-1 text-xs font-normal text-gray-400">
                اختياري
              </span>
            </label>

            <input
              type="text"
              maxLength={100}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="رقم العملية أو التحويل..."
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
            />
          </div>

          {/* =====================================================
              DESCRIPTION
          ===================================================== */}

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              البيان
            </label>

            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="مثال: دفع فاتورة الكهرباء لشهر سبتمبر"
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

          {/* =====================================================
              ACTIONS
          ===================================================== */}

          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50"
            >
              {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
              حفظ القيد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

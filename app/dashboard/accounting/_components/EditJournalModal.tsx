"use client";

import { useState } from "react";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

import { LuLoaderCircle, LuX } from "react-icons/lu";

import { toast } from "react-hot-toast";

import { correctManualJournalEntry } from "../services/accounting.services";

import {
  AccountingAccount,
  CorrectManualJournalEntryInput,
  JournalEntryType,
} from "../schemas/accounting.schema";

interface EditJournalModalProps {
  entry: {
    id: string;
    entryNumber: string;
    entryType: JournalEntryType;
    amount: number;
    currency: "USD" | "SDG";
    debitAccount: AccountingAccount;
    creditAccount: AccountingAccount;
    description: string | null;
    reference: string | null;
  };
  onClose: () => void;
  onCorrected: () => void;
}

const EXPENSE_ACCOUNTS: { value: AccountingAccount; label: string }[] = [
  { value: "UTILITIES", label: "فواتير وخدمات (كهرباء، ماء، إنترنت)" },
  { value: "RENTS", label: "مصاريف الايجار" },
  { value: "MAINTENANCE", label: "الصيانة والإصلاحات" },
  { value: "OTHER_EXPENSE", label: "مصروفات أخرى" },
];

const MONEY_ACCOUNTS: AccountingAccount[] = ["CASH", "BANK"];

export default function EditJournalModal({
  entry,
  onClose,
  onCorrected,
}: EditJournalModalProps) {
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState(String(entry.amount));
  const [currency, setCurrency] = useState<"USD" | "SDG">(entry.currency);

  // الحساب "النقدي" (خزينة/بنك) هو المدين في رأس المال والإيراد، والدائن في المصروف
  const initialPaymentMethod =
    entry.entryType === "EXPENSE" ? entry.creditAccount : entry.debitAccount;

  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">(
    MONEY_ACCOUNTS.includes(initialPaymentMethod)
      ? (initialPaymentMethod as "CASH" | "BANK")
      : "CASH",
  );

  const [account, setAccount] = useState<AccountingAccount>(
    entry.entryType === "EXPENSE" ? entry.debitAccount : "UTILITIES",
  );

  const [reference, setReference] = useState(entry.reference ?? "");
  const [description, setDescription] = useState(entry.description ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    if (!description.trim()) {
      toast.error("البيان مطلوب");
      return;
    }

    const payload: CorrectManualJournalEntryInput = {
      amount: numericAmount,
      currency,
      paymentMethod,
      account: entry.entryType === "EXPENSE" ? account : null,
      reference: reference.trim() || null,
      description: description.trim(),
      notes: notes.trim() || null,
    };

    try {
      setLoading(true);

      const response = await correctManualJournalEntry(entry.id, payload, {
        idempotencyKey: idempotency.keyFor(payload),
      });
      idempotency.reset();

      toast.success(response.message ?? "تم تصحيح القيد بنجاح");

      onCorrected();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصحيح القيد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">
              تعديل القيد {entry.entryNumber}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              يُسجَّل التعديل كقيد عكسي يلغي القيد الأصل + قيد جديد بالقيمة
              الصحيحة، دون تعديل أو حذف القيد الأصل
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
                  {currency === "USD" ? "$" : "ج.س"}
                </span>
              </div>
            </div>

            <div className="md:w-44">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                العملة
              </label>
              <select
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as "USD" | "SDG")
                }
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
              >
                <option value="USD">دولار $</option>
                <option value="SDG">جنيه سوداني</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:gap-5">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                {entry.entryType === "CAPITAL"
                  ? "مكان إيداع رأس المال"
                  : entry.entryType === "OTHER"
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
                <option value="CASH">نقداً / الخزينة</option>
                <option value="BANK">حوالة / البنك</option>
              </select>
            </div>

            {entry.entryType === "EXPENSE" && (
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

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              البيان
            </label>

            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              سبب التعديل
              <span className="mr-1 text-xs font-normal text-gray-400">
                اختياري
              </span>
            </label>

            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="مثال: المبلغ الصحيح كان 100 دولار وليس 1000"
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

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
              حفظ التصحيح
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { toast } from "react-hot-toast";

import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { createManualJournalEntry } from "@/app/dashboard/accounting/services/accounting.services";
import type {
  AccountingAccount,
  CreateManualJournalEntryInput,
} from "@/app/dashboard/accounting/schemas/accounting.schema";

interface Props {
  allowRent: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function ExpenseModal({ allowRent, onClose, onCreated }: Props) {
  const idempotency = useIdempotencyKey();

  const accounts: { value: AccountingAccount; label: string }[] = [
    { value: "UTILITIES", label: "فواتير وخدمات (كهرباء، ماء، إنترنت)" },
    { value: "MAINTENANCE", label: "الصيانة والإصلاحات" },
    ...(allowRent ? [{ value: "RENTS" as const, label: "مصاريف الإيجار" }] : []),
    { value: "OTHER_EXPENSE", label: "مصروفات أخرى" },
  ];

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "SDG">("SDG");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK">("CASH");
  const [account, setAccount] = useState<AccountingAccount>("UTILITIES");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
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

    const payload: CreateManualJournalEntryInput = {
      entryType: "EXPENSE",
      amount: numericAmount,
      paymentMethod,
      currency,
      account,
      reference: reference.trim() || null,
      description: description.trim(),
    };

    try {
      setLoading(true);
      const response = await createManualJournalEntry(payload, {
        idempotencyKey: idempotency.keyFor(payload),
      });
      idempotency.reset();
      toast.success(response.message ?? "تم تسجيل المصروف بنجاح");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل المصروف");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">مصروف جديد</h2>
            <p className="mt-1 text-xs text-gray-500">يُخصم المبلغ من الخزينة أو البنك</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">المبلغ</label>
              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className={`${fieldClass} pl-14`}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  {currency === "USD" ? "$" : "ج.س"}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">العملة</label>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as "USD" | "SDG")}
                className={fieldClass}
              >
                <option value="SDG">جنيه سوداني</option>
                <option value="USD">دولار $</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">طريقة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "BANK")}
                className={fieldClass}
              >
                <option value="CASH">نقداً / الخزينة</option>
                <option value="BANK">حوالة / البنك</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">نوع المصروف</label>
              <select
                value={account}
                onChange={(event) => setAccount(event.target.value as AccountingAccount)}
                className={fieldClass}
              >
                {accounts.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              المرجع
              <span className="mr-1 text-xs font-normal text-gray-400">اختياري</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="رقم الفاتورة أو التحويل..."
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">البيان</label>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="مثال: دفع فاتورة الكهرباء لشهر سبتمبر"
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
              حفظ المصروف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

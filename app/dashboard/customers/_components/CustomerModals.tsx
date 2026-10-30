"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { LuLoaderCircle, LuTriangleAlert, LuX } from "react-icons/lu";

import { ApiError } from "@/lib/api-client";

import {
  checkPhoneDuplicates,
  createCustomer,
  updateCustomer,
  type CustomerRecord,
  type DuplicateHit,
} from "../services/customers.services";

export const FIELD =
  "min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm";
export const PRIMARY_BUTTON =
  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-(--primary-red) text-sm font-bold text-white transition hover:bg-(--primary-red)/90 disabled:opacity-50";
export const SECONDARY_BUTTON =
  "min-h-11 flex-1 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50";

export function ModalShell({
  title,
  subtitle,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** تنبيه تكرار الهاتف: لا يمنع الحفظ، ويحمل رابطًا للعميل الآخر */
export function DuplicateWarning({ duplicates }: { duplicates: DuplicateHit[] }) {
  if (duplicates.length === 0) return null;

  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <LuTriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-bold">هذا الرقم مستخدم لعميل آخر:</p>
        <ul className="mt-1 space-y-1">
          {duplicates.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/customers/${item.id}`}
                target="_blank"
                className="font-black underline"
              >
                {item.name}
              </Link>{" "}
              <span dir="ltr" className="text-amber-700">
                {item.whatsapp_number}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-amber-700">يمكنك المتابعة والحفظ، أو دمجهما لاحقًا من قسم «عملاء مكررون».</p>
      </div>
    </div>
  );
}

/** نموذج عميل جديد / تعديل عميل (الاسم، الهاتف/واتساب، ملاحظات) */
export function CustomerFormModal({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Pick<CustomerRecord, "id" | "name" | "whatsappNumber" | "notes"> | null;
  onClose: () => void;
  onSaved: (saved?: CustomerRecord) => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.whatsappNumber ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [loading, setLoading] = useState(false);

  // تنبيه تكرار الهاتف أثناء الكتابة (بدون منع)
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) return;

    let active = true;
    const timer = setTimeout(() => {
      checkPhoneDuplicates(phone, customer?.id)
        .then((hits) => {
          if (active) setDuplicates(hits);
        })
        .catch(() => undefined);
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [phone, customer?.id]);

  const shownDuplicates = phone.replace(/\D/g, "").length >= 8 ? duplicates : [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (!name.trim()) {
      toast.error("اسم العميل مطلوب");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      toast.error("رقم الهاتف غير صالح");
      return;
    }

    const payload = { name: name.trim(), whatsappNumber: phone.trim(), notes: notes.trim() || null };

    try {
      setLoading(true);

      if (customer) {
        const result = await updateCustomer(customer.id, payload);
        toast.success(result.message);
        onSaved();
      } else {
        const result = await createCustomer(payload);
        toast.success(result.message);
        onSaved(result.customer);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "DUPLICATE_PHONE") {
        const existing = (error.details as { existing?: DuplicateHit } | undefined)?.existing;
        if (existing) setDuplicates([existing]);
      }
      toast.error(error instanceof Error ? error.message : "تعذر حفظ العميل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={customer ? "تعديل العميل" : "عميل جديد"} onClose={onClose} busy={loading}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">الاسم</label>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} className={FIELD} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">الهاتف / واتساب</label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="09xxxxxxxx أو +2499xxxxxxxx"
            className={`${FIELD} text-right`}
          />
        </div>

        <DuplicateWarning duplicates={shownDuplicates} />

        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">
            ملاحظات <span className="text-xs font-normal text-gray-400">اختياري</span>
          </label>
          <textarea
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-gray-400 md:text-sm"
          />
        </div>

        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className={SECONDARY_BUTTON}>
            إلغاء
          </button>
          <button type="submit" disabled={loading} className={PRIMARY_BUTTON}>
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            حفظ
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** نافذة تأكيد عامة (حذف / دمج) */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  async function confirm() {
    if (loading) return;
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={title} onClose={onClose} busy={loading}>
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{body}</div>
        <div className="flex gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className={SECONDARY_BUTTON}>
            إلغاء
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading}
            className={
              danger
                ? "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                : PRIMARY_BUTTON
            }
          >
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

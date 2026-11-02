"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LuLoader, LuTriangleAlert } from "react-icons/lu";

import {
  getOpeningLocks,
  setOpeningLock,
  type OpeningLockKey,
  type OpeningLockState,
} from "../services/opening-locks.services";

const ITEMS: {
  key: OpeningLockKey;
  title: string;
  openTitle: string;
  description: string;
  risk: string;
}[] = [
  {
    key: "opening_stock_locked",
    title: "قفل المخزون الافتتاحي",
    openTitle: "فتح قفل المخزون الافتتاحي؟",
    description:
      "عند التفعيل لا يمكن إدخال مخزون افتتاحي جديد، وتُضاف البضاعة عبر أوامر الشراء فقط.",
    risk: "فتح القفل يسمح بإدخال بضاعة بتكلفة تكتبها يدويًا خارج أوامر الشراء، وتُسجَّل كمساهمة في رأس المال. إدخال صنف مرتين أو بتكلفة غير حقيقية يفسد قيمة المخزون وربح المبيعات القادمة، ولا يمكن حذف القيود بعد تسجيلها (التصحيح بقيد عكسي فقط).",
  },
  {
    key: "opening_balances_locked",
    title: "قفل الأرصدة الافتتاحية",
    openTitle: "فتح قفل الأرصدة الافتتاحية؟",
    description:
      "عند التفعيل لا يمكن تسجيل نقدية أو أصول أو ديون موردين افتتاحية جديدة.",
    risk: "فتح القفل يسمح بتسجيل نقدية وأصول وديون موردين جديدة مقابل رأس المال، فتتغير أرصدة الخزينة والبنك ورأس المال والتقارير. أي إدخال خاطئ لا يُحذف، وتصحيحه يكون بقيد عكسي.",
  },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OpeningLocksSettings() {
  const router = useRouter();
  const [locks, setLocks] = useState<OpeningLockState[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<OpeningLockKey | null>(null);
  const [confirmKey, setConfirmKey] = useState<OpeningLockKey | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getOpeningLocks();
        if (mounted) setLocks(result.data);
      } catch (error) {
        console.error(error);
        if (mounted) setLoadFailed(true);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function apply(key: OpeningLockKey, locked: boolean) {
    setSaving(key);

    try {
      const result = await setOpeningLock(key, locked);
      setLocks(result.data);
      setConfirmKey(null);
      toast.success(result.message);
      // القائمة الجانبية والصفحات تعتمد على القفل
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير القفل");
    } finally {
      setSaving(null);
    }
  }

  function toggle(key: OpeningLockKey, currentlyLocked: boolean) {
    if (currentlyLocked) {
      // الفتح يحتاج تأكيدًا يوضح المخاطرة
      setConfirmKey(key);
      return;
    }

    void apply(key, true);
  }

  if (loadFailed) {
    return <p className="text-sm text-red-600">تعذر تحميل حالة القفل، حدّث الصفحة وحاول مرة أخرى.</p>;
  }

  if (!locks) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LuLoader className="h-4 w-4 animate-spin" />
        جارٍ التحميل...
      </div>
    );
  }

  const confirmItem = ITEMS.find((item) => item.key === confirmKey) ?? null;

  return (
    <div dir="rtl" className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">قفل الإدخال الافتتاحي</h2>
        <p className="mt-1 text-sm text-gray-500">
          بعد اكتمال الإدخال الافتتاحي يُقفل حتى لا يُسجَّل مرة أخرى بالخطأ. المالك وحده يستطيع فتح القفل.
        </p>
      </div>

      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
        {ITEMS.map((item) => {
          const state = locks.find((lock) => lock.key === item.key);
          const locked = state?.locked ?? false;
          const busy = saving === item.key;

          return (
            <li key={item.key} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-xs leading-6 text-gray-500">{item.description}</p>
                {state?.updatedAt && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    آخر تغيير: {formatDateTime(state.updatedAt)}
                    {state.updatedByName ? ` — ${state.updatedByName}` : ""}
                  </p>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={locked}
                aria-label={item.title}
                disabled={busy}
                onClick={() => toggle(item.key, locked)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  locked ? "bg-emerald-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${
                    locked ? "right-1" : "right-6"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {confirmItem &&
        createPortal(
          <div
            dir="rtl"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="flex items-center gap-2 text-lg font-black text-gray-900">
                <LuTriangleAlert className="h-5 w-5 text-amber-600" />
                {confirmItem.openTitle}
              </h3>
              <p className="mt-3 text-sm leading-7 text-gray-700">{confirmItem.risk}</p>
              <p className="mt-2 text-sm font-bold text-gray-900">أعد القفل بعد الانتهاء من الإدخال.</p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmKey(null)}
                  disabled={saving !== null}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => apply(confirmItem.key, false)}
                  disabled={saving !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-(--primary-red) px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving !== null && <LuLoader className="h-4 w-4 animate-spin" />}
                  فهمت المخاطرة، افتح القفل
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

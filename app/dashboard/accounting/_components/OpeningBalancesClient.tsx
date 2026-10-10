"use client";

import { flushSync } from "react-dom";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  LuBanknote,
  LuCircleCheck,
  LuCircleDashed,
  LuEye,
  LuInfo,
  LuLoader,
  LuPencil,
  LuPlus,
  LuSave,
  LuScale,
  LuTrash2,
  LuTriangleAlert,
  LuTruck,
  LuWarehouse,
} from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import { formatSDG, formatUSD } from "@/lib/currency";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useModalStore } from "@/store/useModalStore";
import SupplierModalContent from "../../suppliers/_components/SupplierModalContent";

import {
  postOpeningBalances,
  previewOpeningBalances,
} from "../services/opening-balances.services";
import type {
  OpeningBalancesResult,
  OpeningBalancesStatus,
} from "../schemas/opening-balances.schema";

/* =========================================================
   Labels
========================================================= */

const CATEGORY_OPTIONS = [
  { value: "MACHINE", label: "ماكينة" },
  { value: "AIR_CONDITIONER", label: "مكيف" },
  { value: "COMPUTER", label: "حاسوب" },
  { value: "PRINTER", label: "طابعة" },
  { value: "FURNITURE", label: "أثاث" },
  { value: "OTHER", label: "أخرى" },
] as const;

const ACCOUNT_LABELS: Record<string, string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  CAPITAL: "رأس المال",
  ASSETS: "الأصول",
  SUPPLIERS: "ديون الموردين",
};

const CASH_SLOTS = [
  { account: "CASH", currency: "SDG", label: "الخزينة — جنيه" },
  { account: "CASH", currency: "USD", label: "الخزينة — دولار" },
  { account: "BANK", currency: "SDG", label: "البنك — جنيه" },
  { account: "BANK", currency: "USD", label: "البنك — دولار" },
] as const;

type Currency = "USD" | "SDG";
type AssetRow = {
  key: string;
  name: string;
  category: string;
  currency: Currency;
  value: string;
  purchaseDate: string;
};
type DebtRow = {
  key: string;
  supplierId: string;
  amount: string;
  reference: string;
};

interface Props {
  status: OpeningBalancesStatus;
  suppliers: { id: string; name: string; isActive: boolean }[];
}

/* =========================================================
   Helpers
========================================================= */

/** رقم موجب من حقل نصي، وإلا صفر */
function positive(value: string) {
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function money(amount: number, currency: Currency) {
  return currency === "SDG" ? formatSDG(amount) : formatUSD(amount);
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none";

function Section({
  step,
  icon: Icon,
  title,
  hint,
  children,
}: {
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
          {step}
        </span>
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-gray-900">
            <Icon className="h-5 w-5 text-(--primary-red)" />
            {title}
          </h2>
          {hint && (
            <div className="mt-1 text-xs leading-6 text-gray-500">{hint}</div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
      <LuCircleCheck className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

/* =========================================================
   Component
========================================================= */

export default function OpeningBalancesClient({ status, suppliers }: Props) {
  const router = useRouter();
  const openModal = useModalStore((state) => state.openModal);
  const idempotency = useIdempotencyKey();

  const dateLocked = status.asOf !== null;
  const [asOf, setAsOf] = useState(status.asOf ?? status.today);
  const [addedSuppliers, setAddedSuppliers] = useState<Props["suppliers"]>([]);
  const [cash, setCash] = useState<Record<string, string>>({});
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<OpeningBalancesResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "post" | null>(null);

  const recordedCash = useMemo(
    () =>
      new Map(
        status.cash.map((line) => [`${line.account}:${line.currency}`, line]),
      ),
    [status.cash],
  );
  const suppliersWithDebt = useMemo(
    () => new Set(status.supplierDebts.map((debt) => debt.supplierId)),
    [status.supplierDebts],
  );
  const allSuppliers = useMemo(
    () => [
      ...addedSuppliers,
      ...suppliers.filter(
        (supplier) =>
          !addedSuppliers.some((added) => added.id === supplier.id),
      ),
    ],
    [addedSuppliers, suppliers],
  );
  const availableSuppliers = allSuppliers.filter(
    (supplier) => !suppliersWithDebt.has(supplier.id),
  );

  /** أي تعديل بعد المعاينة يلغيها (لازم معاينة جديدة قبل الحفظ) */
  function changed<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPreview(null);
      setConfirmed(false);
    };
  }
  const updateCash = changed(setCash);
  const updateAssets = changed(setAssets);
  const updateDebts = changed(setDebts);
  const updateAsOf = changed(setAsOf);

  /* ---------- payload ---------- */

  const payload = useMemo(() => {
    const cashLines = CASH_SLOTS.filter(
      (slot) => !recordedCash.has(`${slot.account}:${slot.currency}`),
    )
      .map((slot) => ({
        account: slot.account,
        currency: slot.currency,
        amount: positive(cash[`${slot.account}:${slot.currency}`] ?? ""),
      }))
      .filter((line) => line.amount > 0);

    const assetLines = assets
      .filter((row) => row.name.trim() || positive(row.value) > 0)
      .map((row) => ({
        name: row.name.trim(),
        category: row.category as (typeof CATEGORY_OPTIONS)[number]["value"],
        currency: row.currency,
        value: positive(row.value),
        purchaseDate: row.purchaseDate || null,
      }));

    const debtLines = debts
      .filter((row) => row.supplierId || positive(row.amount) > 0)
      .map((row) => ({
        supplierId: row.supplierId,
        amount: positive(row.amount),
        reference: row.reference.trim() || null,
      }));

    return {
      asOf,
      cash: cashLines,
      assets: assetLines,
      supplierDebts: debtLines,
      notes: notes.trim() || null,
    };
  }, [asOf, cash, assets, debts, notes, recordedCash]);

  const problems = useMemo(() => {
    const list: string[] = [];
    payload.assets.forEach((asset, index) => {
      if (!asset.name) list.push(`الأصل رقم ${index + 1}: الاسم مطلوب`);
      if (asset.value <= 0) list.push(`الأصل رقم ${index + 1}: القيمة مطلوبة`);
    });
    payload.supplierDebts.forEach((debt, index) => {
      if (!debt.supplierId)
        list.push(`دين المورد رقم ${index + 1}: اختر المورد`);
      if (debt.amount <= 0)
        list.push(`دين المورد رقم ${index + 1}: المبلغ مطلوب`);
    });
    const ids = payload.supplierDebts
      .map((debt) => debt.supplierId)
      .filter(Boolean);
    if (new Set(ids).size !== ids.length)
      list.push("نفس المورد مكرر في ديون الموردين");
    return list;
  }, [payload]);

  const lineCount =
    payload.cash.length + payload.assets.length + payload.supplierDebts.length;

  /* ---------- actions ---------- */

  async function handlePreview() {
    if (lineCount === 0) {
      toast.error("أدخل رصيدًا واحدًا على الأقل");
      return;
    }
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    setBusy("preview");
    try {
      const result = await previewOpeningBalances(payload);
      setPreview(result.data);
      setConfirmed(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر معاينة القيود",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePost() {
    if (!preview || !confirmed) return;
    setBusy("post");
    try {
      const result = await postOpeningBalances(payload, {
        idempotencyKey: idempotency.keyFor(payload),
      });
      idempotency.reset();
      toast.success(result.message);
      setCash({});
      setAssets([]);
      setDebts([]);
      setNotes("");
      setPreview(null);
      setConfirmed(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر تسجيل الأرصدة الافتتاحية",
      );
    } finally {
      setBusy(null);
    }
  }

  /* ---------- derived status ---------- */

  const hasOperations = status.firstOperationAt !== null;
  const recordedAnything =
    status.cash.length + status.assets.length + status.supplierDebts.length > 0;

  return (
    <main dir="rtl" className="space-y-5 pb-36">
      <div className="mb-3">
        <BackLink href="/dashboard/accounting" label="العودة إلى المحاسبة" />
      </div>

      <header className="border-b border-gray-100 pb-5">
        <h1 className="flex items-center gap-2 text-2xl font-black text-gray-950">
          <LuScale className="h-6 w-6 text-(--primary-red)" />
          الأرصدة الافتتاحية
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          وضع المتجر المالي في يوم بدء استخدام النظام: ما تملكه وما عليك.
          تُسجَّل مرة واحدة لكل بند.
        </p>
      </header>

      {/* ===================== شرح ===================== */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-blue-950">
        <LuInfo className="mt-1 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-bold">ما هي الأرصدة الافتتاحية؟</p>
          <p>
            قبل أول عملية بيع في النظام، يكون لديك اموال في الخزينة والحساب
            البنكي، وبضاعة في المحل، وأجهزة وأثاث، وربما ديون لموردين. هذه
            الصفحة تُدخل كل ذلك مرة واحدة حتى تبدأ أرصدة النظام مطابقة للواقع.
          </p>
          <p>
            الطرف المقابل لكل ذلك هو <b>رأس مال المالك</b>: ما تملكه يزيد رأس
            المال، والديون تنقصه. لا يُحسب أي منها كمبيعات أو ربح أو مشتريات.
          </p>
        </div>
      </div>

      {hasOperations && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <LuTriangleAlert className="mt-1 h-5 w-5 shrink-0" />
          <p>
            توجد عمليات يومية مسجّلة في النظام منذ{" "}
            <b>
              {new Date(status.firstOperationAt as string).toLocaleDateString(
                "ar-EG",
              )}
            </b>
            . إذا كانت بيانات تجريبية فالأفضل مسحها قبل إدخال الأرصدة
            الافتتاحية، حتى لا تختلط بأرصدة البداية الحقيقية.
          </p>
        </div>
      )}

      {/* ===================== قائمة الخطوات ===================== */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold text-gray-500">قبل البدء</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span>سعر الصرف الحالي</span>
              {status.currentRate ? (
                <Done>{formatSDG(status.currentRate)} للدولار</Done>
              ) : (
                <Link
                  href="/dashboard/settings"
                  className="text-xs font-bold text-(--primary-red) underline"
                >
                  سجّله من الإعدادات
                </Link>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>المخزون الافتتاحي (البضاعة)</span>
              {status.openingStock.entries > 0 ? (
                <Done>{formatUSD(status.openingStock.totalUsd)}</Done>
              ) : (
                <Link
                  href="/dashboard/inventory/opening-stock"
                  className="text-xs font-bold text-(--primary-red) underline"
                >
                  يُسجَّل من صفحة المخزون
                </Link>
              )}
            </li>
            {status.manualCapitalUsd !== 0 && (
              <li className="flex items-center justify-between gap-2 text-amber-800">
                <span>قيود رأس مال يدوية سابقة</span>
                <span className="text-xs font-bold">
                  {formatUSD(status.manualCapitalUsd)} — لا تُدخلها هنا مرة أخرى
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold text-gray-500">
            ما تم تسجيله في هذه الصفحة
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>تاريخ الافتتاح</span>
              {dateLocked ? (
                <Done>{status.asOf}</Done>
              ) : (
                <span className="text-xs text-gray-400">لم يُحدد بعد</span>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span>النقدية والبنك</span>
              <span className="text-xs font-bold text-gray-700">
                {status.cash.length} / 4
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>الأصول القائمة</span>
              <span className="text-xs font-bold text-gray-700">
                {status.assets.length}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>ديون الموردين</span>
              <span className="text-xs font-bold text-gray-700">
                {status.supplierDebts.length}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ===================== التاريخ ===================== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          تاريخ الافتتاح (يوم بدء التشغيل)
        </label>
        <input
          type="date"
          value={asOf}
          max={status.today}
          disabled={dateLocked}
          onChange={(event) => updateAsOf(event.target.value)}
          className={`${inputClass} max-w-xs disabled:cursor-not-allowed disabled:opacity-70`}
        />
        <p className="mt-1.5 text-xs text-gray-500">
          {dateLocked
            ? "التاريخ ثابت بعد أول تسجيل، وأي بند تضيفه لاحقًا يُسجَّل بنفس التاريخ."
            : "الأرصدة بالجنيه تتحول للدولار بسعر الصرف المسجّل في هذا التاريخ."}
        </p>
      </div>

      {/* ===================== 1. النقدية ===================== */}
      <Section
        step={1}
        icon={LuBanknote}
        title="النقدية في الخزينة والبنك"
        hint={
          <>
            اكتب المبلغ الموجود فعلًا يوم الافتتاح، كل عملة لوحدها. اترك الحقل
            فارغًا إذا لم يكن هناك رصيد.
            <br />
            <b>مهم:</b> إذا كانت الخزينة تحتوي على عرابين لطلبات تفصيل لم
            تُسلَّم، اطرحها من المبلغ هنا، ثم بعد الحفظ أدخل هذه الطلبات
            بعرابينها من{" "}
            <Link
              href="/dashboard/tailoring"
              className="font-bold text-(--primary-red) underline"
            >
              صفحة التفصيل
            </Link>{" "}
            (النظام يضيف العربون للخزينة ويربطه بالطلب).
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CASH_SLOTS.map((slot) => {
            const key = `${slot.account}:${slot.currency}`;
            const recorded = recordedCash.get(key);
            return (
              <div
                key={key}
                className="rounded-xl border border-gray-100 bg-gray-50/60 p-3"
              >
                <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-gray-700">
                  {slot.label}
                  {recorded && <Done>مسجّل</Done>}
                </label>
                {recorded ? (
                  <p className="font-mono text-lg font-bold text-gray-900">
                    {money(recorded.amount, recorded.currency)}
                    {recorded.currency === "SDG" && (
                      <span className="mr-2 text-xs font-normal text-gray-400">
                        ≈ {formatUSD(recorded.amountUsd)}
                      </span>
                    )}
                  </p>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={cash[key] ?? ""}
                    onChange={(event) =>
                      updateCash({ ...cash, [key]: event.target.value })
                    }
                    className={inputClass}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ===================== 2. الأصول ===================== */}
      <Section
        step={2}
        icon={LuWarehouse}
        title="الأصول القائمة (أجهزة، أثاث، ماكينات)"
        hint="أشياء يملكها المتجر ويستخدمها ولا يبيعها. اكتب قيمتها الحالية التقريبية. لا تُخصم من الخزينة لأنها اشتُريت قبل النظام."
      >
        {status.assets.length > 0 && (
          <ul className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {status.assets.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-gray-800">
                  {asset.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono">
                    {money(asset.value, asset.currency)}
                  </span>
                  <Done>مسجّل</Done>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          {assets.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 md:grid-cols-12"
            >
              <input
                className={`${inputClass} md:col-span-4`}
                placeholder="اسم الأصل، مثال: ماكينة خياطة جوكي"
                value={row.name}
                maxLength={255}
                onChange={(event) =>
                  updateAssets(
                    assets.map((item, i) =>
                      i === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <select
                className={`${inputClass} md:col-span-2`}
                value={row.category}
                onChange={(event) =>
                  updateAssets(
                    assets.map((item, i) =>
                      i === index
                        ? { ...item, category: event.target.value }
                        : item,
                    ),
                  )
                }
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="القيمة"
                className={`${inputClass} md:col-span-2`}
                value={row.value}
                onChange={(event) =>
                  updateAssets(
                    assets.map((item, i) =>
                      i === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <select
                className={`${inputClass} md:col-span-1`}
                value={row.currency}
                onChange={(event) =>
                  updateAssets(
                    assets.map((item, i) =>
                      i === index
                        ? { ...item, currency: event.target.value as Currency }
                        : item,
                    ),
                  )
                }
              >
                <option value="USD">$</option>
                <option value="SDG">ج.س</option>
              </select>
              <input
                type="date"
                title="تاريخ الشراء (اختياري)"
                max={asOf}
                className={`${inputClass} md:col-span-2`}
                value={row.purchaseDate}
                onChange={(event) =>
                  updateAssets(
                    assets.map((item, i) =>
                      i === index
                        ? { ...item, purchaseDate: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  updateAssets(assets.filter((_, i) => i !== index))
                }
                className="flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-rose-600 md:col-span-1"
                aria-label="حذف الأصل"
              >
                <LuTrash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            updateAssets([
              ...assets,
              {
                key: newKey(),
                name: "",
                category: "MACHINE",
                currency: "USD",
                value: "",
                purchaseDate: "",
              },
            ])
          }
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <LuPlus className="h-4 w-4" />
          إضافة أصل
        </button>
      </Section>

      {/* ===================== 3. ديون الموردين ===================== */}
      <Section
        step={3}
        icon={LuTruck}
        title="ديون الموردين (فواتير لم تُدفع)"
        hint="المبلغ المتبقي عليك لكل مورد يوم الافتتاح، بالدولار. يظهر الدين في صفحة المشتريات كأمر «دين افتتاحي»، وتسدّده من هناك بالدفعات العادية."
      >
        {status.supplierDebts.length > 0 && (
          <ul className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {status.supplierDebts.map((debt) => (
              <li
                key={debt.orderId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <Link
                  href={`/dashboard/orders/${debt.orderId}`}
                  className="font-semibold text-gray-800 underline-offset-2 hover:underline"
                >
                  {debt.supplierName}
                </Link>
                <span className="flex items-center gap-3 text-xs">
                  <span>
                    الدين: <b className="font-mono">{formatUSD(debt.amount)}</b>
                  </span>
                  <span>
                    المدفوع: <b className="font-mono">{formatUSD(debt.paid)}</b>
                  </span>
                  <span>
                    المتبقي:{" "}
                    <b className="font-mono">
                      {formatUSD(Math.max(0, debt.amount - debt.paid))}
                    </b>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          {debts.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 md:grid-cols-12"
            >
              <select
                className={`${inputClass} md:col-span-5`}
                value={row.supplierId}
                onChange={(event) =>
                  updateDebts(
                    debts.map((item, i) =>
                      i === index
                        ? { ...item, supplierId: event.target.value }
                        : item,
                    ),
                  )
                }
              >
                <option value="">اختر المورد…</option>
                {availableSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.isActive ? "" : " (غير نشط)"}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="المبلغ ($)"
                className={`${inputClass} md:col-span-3`}
                value={row.amount}
                onChange={(event) =>
                  updateDebts(
                    debts.map((item, i) =>
                      i === index
                        ? { ...item, amount: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                placeholder="مرجع (رقم فاتورة) — اختياري"
                maxLength={100}
                className={`${inputClass} md:col-span-3`}
                value={row.reference}
                onChange={(event) =>
                  updateDebts(
                    debts.map((item, i) =>
                      i === index
                        ? { ...item, reference: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => updateDebts(debts.filter((_, i) => i !== index))}
                className="flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-rose-600 md:col-span-1"
                aria-label="حذف الدين"
              >
                <LuTrash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {allSuppliers.length === 0 && (
          <p className="mt-3 text-xs text-gray-500">
            لا يوجد موردون مسجلون بعد.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              openModal("CREATE", {
                title: "إضافة مورد جديد",
                content: (
                  <SupplierModalContent
                    refreshOnSave={false}
                    onSaved={(supplier) =>
                      flushSync(() =>
                        setAddedSuppliers((current) => [
                          {
                            id: supplier.id,
                            name: supplier.name,
                            isActive: supplier.isActive,
                          },
                          ...current.filter((item) => item.id !== supplier.id),
                        ]),
                      )
                    }
                  />
                ),
              })
            }
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            <LuPlus className="h-4 w-4" />
            إضافة مورد جديد
          </button>
          {allSuppliers.length > 0 && (
            <button
              type="button"
              disabled={availableSuppliers.length <= debts.length}
              onClick={() =>
                updateDebts([
                  ...debts,
                  { key: newKey(), supplierId: "", amount: "", reference: "" },
                ])
              }
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <LuPlus className="h-4 w-4" />
              إضافة دين مورد
            </button>
          )}
        </div>
      </Section>

      {/* ===================== ملاحظة ===================== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          ملاحظة (اختياري)
        </label>
        <input
          value={notes}
          maxLength={500}
          onChange={(event) => changed(setNotes)(event.target.value)}
          placeholder="مثال: جرد الافتتاح بحضور المحاسب"
          className={inputClass}
        />
      </div>

      {/* ===================== المعاينة ===================== */}
      {preview && (
        <section className="rounded-2xl border-2 border-gray-900 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-black text-gray-900">
            <LuEye className="h-5 w-5" />
            القيود التي ستُسجَّل (لم يُحفظ شيء بعد)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            بتاريخ {preview.asOf}
            {preview.exchangeRate
              ? ` — سعر الصرف ${formatSDG(preview.exchangeRate)} للدولار`
              : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500">
                  <th className="px-3 py-2 text-start font-medium">البيان</th>
                  <th className="px-3 py-2 text-start font-medium">مدين</th>
                  <th className="px-3 py-2 text-start font-medium">دائن</th>
                  <th className="px-3 py-2 text-start font-medium">المبلغ</th>
                  <th className="px-3 py-2 text-start font-medium">بالدولار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.entries.map((entry, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 font-semibold">{entry.label}</td>
                    <td className="px-3 py-2">
                      {ACCOUNT_LABELS[entry.debit] ?? entry.debit}
                    </td>
                    <td className="px-3 py-2">
                      {ACCOUNT_LABELS[entry.credit] ?? entry.credit}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {money(entry.amount, entry.currency)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {formatUSD(entry.amountUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm">
            أثرها على رأس المال:{" "}
            <b
              className={`font-mono ${preview.capitalChangeUsd >= 0 ? "text-emerald-700" : "text-rose-700"}`}
            >
              {preview.capitalChangeUsd >= 0 ? "+" : "−"}
              {formatUSD(Math.abs(preview.capitalChangeUsd))}
            </b>
            {status.openingStock.entries > 0 && (
              <span className="text-gray-500">
                {" "}
                (بالإضافة إلى {formatUSD(status.openingStock.totalUsd)} قيمة
                المخزون الافتتاحي المسجّل)
              </span>
            )}
          </p>
          <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-gray-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            راجعت الأرقام، وأعرف أن كل بند يُسجَّل مرة واحدة ولا يُعدَّل من هذه
            الصفحة بعد الحفظ.
          </label>
        </section>
      )}

      {/* ===================== شريط الحفظ ===================== */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-4 backdrop-blur md:pr-56">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            {lineCount === 0 ? (
              <span className="flex items-center gap-1.5">
                <LuCircleDashed className="h-4 w-4" />
                {recordedAnything
                  ? "أضف بندًا نسيته، أو اترك الصفحة كما هي."
                  : "لم تُدخل أي رصيد بعد."}
              </span>
            ) : (
              <span>{lineCount} بند جاهز للمعاينة</span>
            )}
            {problems.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 font-bold text-amber-600">
                <LuTriangleAlert className="h-3.5 w-3.5" />
                {problems[0]}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {preview && (
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <LuPencil className="h-4 w-4" />
                تعديل
              </button>
            )}
            {!preview ? (
              <button
                type="button"
                onClick={handlePreview}
                disabled={
                  busy !== null || lineCount === 0 || problems.length > 0
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "preview" ? (
                  <LuLoader className="h-4 w-4 animate-spin" />
                ) : (
                  <LuEye className="h-4 w-4" />
                )}
                معاينة القيود
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePost}
                disabled={busy !== null || !confirmed}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "post" ? (
                  <LuLoader className="h-4 w-4 animate-spin" />
                ) : (
                  <LuSave className="h-4 w-4" />
                )}
                تسجيل الأرصدة الافتتاحية
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

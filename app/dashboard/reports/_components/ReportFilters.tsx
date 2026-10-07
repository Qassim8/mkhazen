"use client";

/**
 * فلاتر التقارير: الفترة (جاهزة أو مخصصة) + التصنيف + المنتج
 * كل الفلاتر محفوظة في الرابط، فالتقرير قابل للمشاركة والطباعة والتصدير بنفس الفلاتر.
 */

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuFilter, LuLoaderCircle, LuRotateCcw } from "react-icons/lu";

import type { ReportData, ReportPreset } from "@/lib/reports/report-filters";

const PRESET_OPTIONS: { value: ReportPreset; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "هذا الأسبوع" },
  { value: "month", label: "هذا الشهر" },
  { value: "last_month", label: "الشهر الماضي" },
  { value: "quarter", label: "هذا الربع" },
  { value: "year", label: "هذه السنة" },
  { value: "custom", label: "فترة مخصصة" },
];

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition focus:border-(--primary-red) focus:bg-white disabled:opacity-50";

interface Props {
  report: ReportData;
}

export default function ReportFilters({ report }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const { filters, options } = report;

  const [preset, setPreset] = useState<ReportPreset>(filters.preset);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [categoryId, setCategoryId] = useState(filters.categoryId ?? "");
  const [productId, setProductId] = useState(filters.productId ?? "");

  const productOptions = useMemo(
    () =>
      categoryId
        ? options.products.filter((product) => product.categoryId === categoryId)
        : options.products,
    [options.products, categoryId],
  );

  function navigate(next: {
    preset: ReportPreset;
    from?: string;
    to?: string;
    categoryId?: string;
    productId?: string;
  }) {
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);

    params.set("preset", next.preset);
    if (next.preset === "custom") {
      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
    }
    if (next.categoryId) params.set("categoryId", next.categoryId);
    if (next.productId) params.set("productId", next.productId);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function applyAll(patch: Partial<{ preset: ReportPreset; categoryId: string; productId: string }>) {
    navigate({
      preset: patch.preset ?? preset,
      from,
      to,
      categoryId: patch.categoryId ?? categoryId,
      productId: patch.productId ?? productId,
    });
  }

  function handlePresetChange(value: ReportPreset) {
    setPreset(value);
    // الفترة المخصصة تنتظر الضغط على "عرض" بعد اختيار التواريخ
    if (value !== "custom") applyAll({ preset: value });
  }

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    // لو المنتج المختار مش تابع للتصنيف الجديد نشيله
    const product = options.products.find((p) => p.id === productId);
    const nextProduct = value && product && product.categoryId !== value ? "" : productId;
    setProductId(nextProduct);
    applyAll({ categoryId: value, productId: nextProduct });
  }

  function handleProductChange(value: string) {
    setProductId(value);
    applyAll({ productId: value });
  }

  function reset() {
    setPreset("month");
    setCategoryId("");
    setProductId("");
    navigate({ preset: "month" });
  }

  const hasFilters = preset !== "month" || Boolean(categoryId) || Boolean(productId);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 print:hidden">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr_1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500">الفترة</span>
          <select
            value={preset}
            disabled={isPending}
            onChange={(event) => handlePresetChange(event.target.value as ReportPreset)}
            className={inputClass}
          >
            {PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500">التصنيف</span>
          <select
            value={categoryId}
            disabled={isPending}
            onChange={(event) => handleCategoryChange(event.target.value)}
            className={inputClass}
          >
            <option value="">كل التصنيفات</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500">المنتج</span>
          <select
            value={productId}
            disabled={isPending}
            onChange={(event) => handleProductChange(event.target.value)}
            className={inputClass}
          >
            <option value="">كل المنتجات</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          {isPending && <LuLoaderCircle className="mb-2.5 h-5 w-5 animate-spin text-gray-400" />}
          {hasFilters && (
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-xs font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              <LuRotateCcw className="h-3.5 w-3.5" />
              إعادة ضبط
            </button>
          )}
        </div>
      </div>

      {preset === "custom" && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">من تاريخ</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">إلى تاريخ</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            disabled={isPending || !from || !to}
            onClick={() => navigate({ preset: "custom", from, to, categoryId, productId })}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-(--primary-red) px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <LuFilter className="h-3.5 w-3.5" />
            عرض
          </button>
        </div>
      )}
    </div>
  );
}

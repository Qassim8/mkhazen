"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  LuInfo,
  LuLoader,
  LuPackagePlus,
  LuSave,
  LuSearch,
  LuTriangleAlert,
} from "react-icons/lu";

import BackLink from "@/components/shared/BackLink";
import { formatSDG, formatUSD } from "@/lib/currency";
import { useExchangeRate } from "@/components/shared/useExchangeRate";
import { recordOpeningStock } from "../services/inventory.services";
import type { OpeningStockCandidate } from "../schema/inventory.schemas";

interface Props {
  candidates: OpeningStockCandidate[];
}

type Draft = { quantity: string; unitCost: string };

function variantLabel(item: OpeningStockCandidate) {
  return [item.colorName, item.size, item.sku].filter(Boolean).join(" · ");
}

/** رقم من حقل نصي: فاضي أو غير صالح = صفر */
function parseNumber(value: string) {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function OpeningStockClient({ candidates }: Props) {
  const router = useRouter();
  const { rate } = useExchangeRate();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return candidates;

    return candidates.filter((item) =>
      [item.productName, item.sku, item.barcode, item.colorName, item.size]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [candidates, search]);

  const filled = useMemo(
    () =>
      candidates
        .map((item) => {
          const draft = drafts[item.id];
          if (!draft) return null;

          const quantity = parseNumber(draft.quantity);
          const unitCost = parseNumber(draft.unitCost);
          if (quantity <= 0 || unitCost <= 0) return null;

          return { item, quantity, unitCost, total: quantity * unitCost };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    [candidates, drafts],
  );

  // صف ناقص: المستخدم كتب كمية بدون تكلفة أو العكس
  const incomplete = useMemo(
    () =>
      candidates.filter((item) => {
        const draft = drafts[item.id];
        if (!draft) return false;

        const quantity = parseNumber(draft.quantity);
        const unitCost = parseNumber(draft.unitCost);

        return (quantity > 0) !== (unitCost > 0);
      }),
    [candidates, drafts],
  );

  const totalUsd = filled.reduce((sum, row) => sum + row.total, 0);

  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        quantity: current[id]?.quantity ?? "",
        unitCost: current[id]?.unitCost ?? "",
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    if (filled.length === 0) {
      toast.error("أدخل كمية وتكلفة لصنف واحد على الأقل");
      return;
    }

    if (incomplete.length > 0) {
      toast.error(
        `${incomplete.length} صنف ناقص: لازم تكتب الكمية والتكلفة مع بعض`,
      );
      return;
    }

    setIsSaving(true);

    try {
      const result = await recordOpeningStock({
        items: filled.map((row) => ({
          variantId: row.item.id,
          quantity: row.quantity,
          unitCost: row.unitCost,
        })),
        notes: notes.trim() || null,
      });

      toast.success(result.message);
      setDrafts({});
      setNotes("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تسجيل المخزون الافتتاحي",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main dir="rtl" className="space-y-5 pb-28">
      <div className="mb-3">
        <BackLink href="/dashboard/inventory" label="العودة إلى المخزون" />
      </div>

      <header className="border-b border-gray-100 pb-5">
        <h1 className="flex items-center gap-2 text-2xl font-black text-gray-950">
          <LuPackagePlus className="h-6 w-6 text-(--primary-red)" />
          المخزون الافتتاحي
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          البضاعة الموجودة في المتجر قبل بدء استخدام النظام. تُسجَّل مرة واحدة
          لكل صنف وبتكلفتها الحقيقية بالدولار.
        </p>
      </header>

      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <LuInfo className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-bold">إزاي بتتسجل محاسبيًا؟</p>
          <p>
            قيمة البضاعة بتزيد المخزون وتتسجل مساهمة من المالك في رأس المال
            (مدين: المخزون / دائن: رأس المال). يعني مش بتتحسب إيراد ولا ربح، ومش
            بتعمل دين على مورد.
          </p>
          <p className="font-medium">
            التكلفة اللي تكتبها هنا هي اللي هيتحسب منها ربح كل بيعة بعد كده،
            فلازم تكون التكلفة الحقيقية.
          </p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="font-bold text-gray-900">مفيش أصناف مؤهلة</p>
          <p className="mt-2 text-sm text-gray-500">
            الصنف بيظهر هنا لو كان نشطًا ورصيده صفر ومعندوش أي حركة مخزون. لو
            الصنف اتباع أو اتشترى قبل كده، استخدم تسوية المخزون بدل المخزون
            الافتتاحي.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم المنتج أو SKU أو الباركود..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-10 pl-4 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100/50 text-start">
                    <th className="px-4 py-3 text-start font-medium text-gray-500">
                      المنتج
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">
                      الكمية
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">
                      تكلفة الوحدة ($)
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-gray-500">
                      الإجمالي
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {visible.map((item) => {
                    const draft = drafts[item.id];
                    const quantity = parseNumber(draft?.quantity ?? "");
                    const unitCost = parseNumber(draft?.unitCost ?? "");
                    const lineTotal = quantity * unitCost;
                    const isIncomplete = (quantity > 0) !== (unitCost > 0);

                    return (
                      <tr
                        key={item.id}
                        className={
                          lineTotal > 0 ? "bg-emerald-50/40" : "hover:bg-gray-50/60"
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-900">
                            {item.productName}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {variantLabel(item) || "—"}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={draft?.quantity ?? ""}
                              onChange={(event) =>
                                updateDraft(item.id, "quantity", event.target.value)
                              }
                              placeholder="0"
                              className={`w-24 rounded-lg border bg-gray-50 px-3 py-2 text-sm transition focus:bg-white focus:outline-none ${
                                isIncomplete && quantity <= 0
                                  ? "border-amber-400"
                                  : "border-gray-200 focus:border-(--primary-red)"
                              }`}
                            />
                            <span className="text-xs text-gray-400">
                              {item.sellingUnit ?? ""}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={draft?.unitCost ?? ""}
                            onChange={(event) =>
                              updateDraft(item.id, "unitCost", event.target.value)
                            }
                            placeholder="0.00"
                            className={`w-28 rounded-lg border bg-gray-50 px-3 py-2 text-sm transition focus:bg-white focus:outline-none ${
                              isIncomplete && unitCost <= 0
                                ? "border-amber-400"
                                : "border-gray-200 focus:border-(--primary-red)"
                            }`}
                          />
                        </td>

                        <td className="px-4 py-3 font-mono font-bold whitespace-nowrap text-gray-900">
                          {lineTotal > 0 ? formatUSD(lineTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {visible.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-sm font-bold text-gray-400"
                      >
                        لا توجد نتائج مطابقة للبحث
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              ملاحظة (اختياري)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              placeholder="مثال: جرد الافتتاح بتاريخ ..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm transition focus:border-(--primary-red) focus:bg-white focus:outline-none"
            />
          </div>

          {/* شريط الحفظ */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-4 backdrop-blur md:pr-56">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  {filled.length} صنف جاهز للتسجيل
                </p>
                <p className="font-mono text-xl font-bold text-gray-900">
                  {formatUSD(totalUsd)}
                </p>
                {rate && totalUsd > 0 && (
                  <p className="text-xs text-gray-400">
                    ≈ {formatSDG(totalUsd * rate)} بسعر اليوم
                  </p>
                )}
                {incomplete.length > 0 && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-600">
                    <LuTriangleAlert className="h-3.5 w-3.5" />
                    {incomplete.length} صنف ناقص الكمية أو التكلفة
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || filled.length === 0 || incomplete.length > 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-7 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <LuLoader className="h-4 w-4 animate-spin" />
                    جارٍ التسجيل...
                  </>
                ) : (
                  <>
                    <LuSave className="h-4 w-4" />
                    تسجيل المخزون الافتتاحي
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";

import { LuPlus, LuSearch } from "react-icons/lu";

import { Asset } from "../schemas/accounting.schema";

import NewAssetModal from "./NewAssetsModal";

interface AssetsClientProps {
  initialData: Asset[];
}

const CATEGORY_LABELS: Record<Asset["category"], string> = {
  MACHINE: "ماكينة",
  AIR_CONDITIONER: "مكيف",
  COMPUTER: "حاسوب",
  PRINTER: "طابعة",
  FURNITURE: "أثاث",
  OTHER: "أخرى",
};

const PAYMENT_LABELS = {
  CASH: "الخزينة",
  BANK: "البنك",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function AssetsClient({ initialData }: AssetsClientProps) {
  const [showModal, setShowModal] = useState(false);

  const [search, setSearch] = useState("");

  const filteredAssets = initialData.filter((asset) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      asset.name.toLowerCase().includes(query) ||
      asset.reference?.toLowerCase().includes(query)
    );
  });

  const totalAssets = initialData.reduce(
    (sum, asset) => sum + asset.purchaseValue,
    0,
  );

  return (
    <div dir="rtl" className="space-y-6 p-4 pb-12">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-950">الأصول</h1>

          <p className="mt-1 text-sm text-gray-500">
            سجل الأصول المملوكة للمتجر وقيمتها
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-gray-900"
        >
          <LuPlus className="h-4 w-4" />
          إضافة أصل
        </button>
      </div>

      {/* =====================================================
          SUMMARY
      ===================================================== */}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold text-gray-500">إجمالي قيمة الأصول</p>

        <p dir="ltr" className="mt-2 text-2xl font-black text-gray-950">
          {formatNumber(totalAssets)} ر.س
        </p>
      </div>

      {/* =====================================================
          SEARCH
      ===================================================== */}

      <div className="relative max-w-xl">
        <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث باسم الأصل أو المرجع..."
          className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 pr-10 text-sm outline-none transition focus:border-gray-400"
        />
      </div>

      {/* =====================================================
          TABLE
      ===================================================== */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50/50 p-4">
          <h2 className="text-xs font-black text-gray-900">سجل الأصول</h2>

          <p className="mt-1 text-xs text-gray-500">
            {filteredAssets.length} أصل
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-212.5 text-right">
            <thead className="border-b border-gray-100 bg-gray-50/70">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  الأصل
                </th>

                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  التصنيف
                </th>

                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  قيمة الشراء
                </th>

                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  تاريخ الشراء
                </th>

                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  طريقة الدفع
                </th>

                <th className="px-4 py-3 text-xs font-bold text-gray-500">
                  المرجع
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredAssets.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    لا توجد أصول
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-gray-900">
                        {asset.name}
                      </span>

                      {asset.notes && (
                        <span className="mt-1 block max-w-62.5 truncate text-xs text-gray-400">
                          {asset.notes}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {CATEGORY_LABELS[asset.category] ?? asset.category}
                      </span>
                    </td>

                    <td
                      dir="ltr"
                      className="px-4 py-3 text-sm font-black text-gray-900"
                    >
                      {formatNumber(asset.purchaseValue)} ر.س
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold text-gray-500">
                      {formatDate(asset.purchaseDate)}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-gray-700">
                        {PAYMENT_LABELS[asset.paymentMethod]}
                      </span>
                    </td>

                    <td
                      dir="ltr"
                      className="max-w-40 truncate px-4 py-3 text-xs text-gray-500"
                      title={asset.reference ?? undefined}
                    >
                      {asset.reference || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================
          MODAL
      ===================================================== */}

      {showModal && <NewAssetModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

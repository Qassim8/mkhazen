"use client";

import { useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { LuPlus, LuRefreshCw, LuSearch } from "react-icons/lu";

import AccountingTable from "./AccountingTable";
import NewJournalEntryModal from "./NewJournalModal";

import {
  JournalEntryInput,
  JournalEntryType,
} from "../schemas/accounting.schema";

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  initialData: JournalEntryInput[];
  initialMeta: Meta;

  initialFilters: {
    year: number;
    entryType: JournalEntryType | "ALL";
    search: string;
  };
}

const ENTRY_TYPES: {
  value: JournalEntryType | "ALL";
  label: string;
}[] = [
  {
    value: "ALL",
    label: "كل القيود",
  },
  {
    value: "CAPITAL",
    label: "رأس مال",
  },
  {
    value: "PURCHASE",
    label: "شراء",
  },
  {
    value: "PURCHASE_PAYMENT",
    label: "دفع للمورد",
  },
  {
    value: "SALE",
    label: "بيع",
  },
  {
    value: "EXPENSE",
    label: "مصروف",
  },
  {
    value: "ASSET",
    label: "أصل",
  },
  {
    value: "OTHER",
    label: "أخرى",
  },
];

export default function AccountingEntriesClient({
  initialData,
  initialMeta,
  initialFilters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [search, setSearch] = useState(initialFilters.search);

  const [showModal, setShowModal] = useState(false);

  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();

  const years = Array.from({ length: 5 }, (_, index) => currentYear - index);

  function updateFilters({
    year = initialFilters.year,
    entryType = initialFilters.entryType,
    searchValue = initialFilters.search,
    page = 1,
  }: {
    year?: number;
    entryType?: JournalEntryType | "ALL";
    searchValue?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();

    params.set("year", String(year));
    params.set("entryType", entryType);

    if (searchValue.trim()) {
      params.set("search", searchValue.trim());
    }

    params.set("page", String(page));

    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearch() {
    setLoading(true);

    updateFilters({
      year: initialFilters.year,
      entryType: initialFilters.entryType,
      searchValue: search,
      page: 1,
    });
  }

  function handleCreated() {
    setShowModal(false);

    router.refresh();
  }

  return (
    <div className="space-y-6 p-4 pb-12">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-950">
            القيود المحاسبية
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            دفتر اليومية لجميع العمليات المالية
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--primary-red) px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-(--primary-red)/90"
        >
          <LuPlus className="h-4 w-4" />
          قيد جديد
        </button>
      </div>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[160px_180px_1fr_auto]">
          <select
            value={initialFilters.year}
            onChange={(event) => {
              setLoading(true);

              updateFilters({
                year: Number(event.target.value),
                entryType: initialFilters.entryType,
                searchValue: initialFilters.search,
                page: 1,
              });
            }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <select
            value={initialFilters.entryType}
            onChange={(event) => {
              setLoading(true);

              updateFilters({
                year: initialFilters.year,
                entryType: event.target.value as JournalEntryType | "ALL",
                searchValue: initialFilters.search,
                page: 1,
              });
            }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
          >
            {ENTRY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <LuSearch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="بحث برقم القيد أو البيان أو المرجع..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pr-9 pl-3 text-sm outline-none focus:border-gray-400"
            />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleSearch}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            <LuRefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            تحديث
          </button>
        </div>
      </div>

      {/* =====================================================
          TABLE
      ===================================================== */}

      <AccountingTable data={initialData} loading={loading} />

      {/* =====================================================
          PAGINATION
      ===================================================== */}

      {initialMeta.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <span className="text-xs font-semibold text-gray-500">
            صفحة {initialMeta.page} من {initialMeta.totalPages}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || initialMeta.page <= 1}
              onClick={() => {
                setLoading(true);

                updateFilters({
                  year: initialFilters.year,
                  entryType: initialFilters.entryType,
                  searchValue: initialFilters.search,
                  page: initialMeta.page - 1,
                });
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              السابق
            </button>

            <button
              type="button"
              disabled={loading || initialMeta.page >= initialMeta.totalPages}
              onClick={() => {
                setLoading(true);

                updateFilters({
                  year: initialFilters.year,
                  entryType: initialFilters.entryType,
                  searchValue: initialFilters.search,
                  page: initialMeta.page + 1,
                });
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          NEW JOURNAL ENTRY
      ===================================================== */}

      {showModal && (
        <NewJournalEntryModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

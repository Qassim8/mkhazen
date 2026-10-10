"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch } from "react-icons/lu";
import { ResetFilters } from "@/components/shared/ResetFilters";

function updateParams(
  searchParams: Pick<URLSearchParams, "toString">,
  key: string,
  value: string,
) {
  const params = new URLSearchParams(searchParams.toString());
  params.set("page", "1");

  if (value) params.set(key, value);
  else params.delete(key);

  return params;
}

export default function SalesFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const handleSelect = (key: string, value: string) => {
    router.replace(
      `${pathname}?${updateParams(searchParams, key, value).toString()}`,
    );
  };

  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";
  const sort = searchParams.get("sort") ?? "date-desc";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3">
        <SalesSearchInput key={searchParams.get("search") ?? ""} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <select
            value={searchParams.get("orderType") ?? ""}
            onChange={(event) => handleSelect("orderType", event.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
          >
            <option value="">كل أنواع البيع</option>
            <option value="POS">الكاشير</option>
            <option value="TAILORING">طلبات التفصيل</option>
          </select>

          <select
            value={searchParams.get("paymentStatus") ?? ""}
            onChange={(event) =>
              handleSelect("paymentStatus", event.target.value)
            }
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
          >
            <option value="">كل حالات الدفع</option>
            <option value="PAID">مدفوع بالكامل</option>
            <option value="PARTIAL">مدفوع جزئيًا</option>
            <option value="UNPAID">غير مدفوع</option>
          </select>

          <select
            value={searchParams.get("paymentMethod") ?? ""}
            onChange={(event) =>
              handleSelect("paymentMethod", event.target.value)
            }
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
          >
            <option value="">كل طرق الدفع</option>
            <option value="CASH">نقداً / الخزينة</option>
            <option value="CARD">بطاقة</option>
            <option value="BANK_TRANSFER">حوالة / البنك</option>
            <option value="MIXED">دفع مختلط</option>
          </select>

          <div>
            <label className="sr-only" htmlFor="sales-from-date">
              من تاريخ
            </label>
            <input
              id="sales-from-date"
              type="date"
              value={fromDate}
              onChange={(event) => handleSelect("fromDate", event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
            />
          </div>

          <div>
            <label className="sr-only" htmlFor="sales-to-date">
              إلى تاريخ
            </label>
            <input
              id="sales-to-date"
              type="date"
              value={toDate}
              onChange={(event) => handleSelect("toDate", event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
            />
          </div>

          <select
            value={sort}
            onChange={(event) => handleSelect("sort", event.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none"
          >
            <option value="date-desc">الأحدث أولاً</option>
            <option value="date-asc">الأقدم أولاً</option>
          </select>
        </div>

        <div className="flex justify-start">
          <ResetFilters />
        </div>
      </div>
    </section>
  );
}

function SalesSearchInput() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleSearch = (value: string) => {
    setSearch(value);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      router.replace(
        `${pathname}?${updateParams(
          searchParams,
          "search",
          value.trim(),
        ).toString()}`,
      );
    }, 350);
  };

  return (
    <div className="relative">
      <LuSearch className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={search}
        onChange={(event) => handleSearch(event.target.value)}
        placeholder="ابحث برقم الفاتورة أو اسم العميل"
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-10 py-2.5 text-sm text-gray-700 outline-none transition focus:border-gray-400 focus:bg-white"
      />
    </div>
  );
}

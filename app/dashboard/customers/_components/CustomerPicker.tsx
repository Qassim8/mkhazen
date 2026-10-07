"use client";

import { useEffect, useState } from "react";
import { LuSearch, LuUserRound, LuX } from "react-icons/lu";

import {
  getCustomers,
  type CustomerRecord,
} from "../services/customers.services";

interface Props {
  initialCustomer?: CustomerRecord | null;
  onSelect: (customer: CustomerRecord | null) => void;
}

export default function CustomerPicker({
  initialCustomer = null,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(initialCustomer);
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = search.trim();
    if (selected || term.length < 2) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getCustomers({ search: term, limit: 8 });
        if (!cancelled) setResults(response.data);
      } catch (fetchError: unknown) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "تعذر البحث عن العميل.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, selected]);

  function choose(customer: CustomerRecord) {
    setSelected(customer);
    setSearch("");
    setResults([]);
    setError("");
    setLoading(false);
    onSelect(customer);
  }

  function clearSelection() {
    setSelected(null);
    setSearch("");
    setResults([]);
    setError("");
    setLoading(false);
    onSelect(null);
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-bold text-gray-600">
        اختيار عميل مسجل لتحميل بياناته ومقاساته
      </label>
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <LuUserRound className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-emerald-900">
              {selected.name}
            </p>
            <p dir="ltr" className="text-xs text-emerald-700">
              {selected.whatsappNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="إلغاء اختيار العميل"
            className="rounded-lg p-2 text-gray-500 hover:bg-white"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <LuSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setResults([]);
                setError("");
              }}
              type="search"
              autoComplete="off"
              placeholder="اكتب اسم العميل أو رقم واتساب..."
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pr-10 pl-3 text-sm outline-none focus:border-(--primary-red)"
            />
          </div>
          {loading && (
            <p className="mt-2 text-xs text-gray-500">جارٍ البحث...</p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}
          {search.trim().length > 0 && search.trim().length < 2 && (
            <p className="mt-2 text-xs text-gray-500">
              أدخل حرفين على الأقل للبحث.
            </p>
          )}
          {results.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => choose(customer)}
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-right hover:bg-gray-50"
                  >
                    <span className="text-sm font-bold text-gray-900">
                      {customer.name}
                    </span>
                    <span dir="ltr" className="text-xs text-gray-500">
                      {customer.whatsappNumber}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading &&
            !error &&
            search.trim().length >= 2 &&
            results.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">
                لا يوجد عميل مطابق؛ أدخل بيانات العميل يدويًا أدناه.
              </p>
            )}
        </>
      )}
    </div>
  );
}

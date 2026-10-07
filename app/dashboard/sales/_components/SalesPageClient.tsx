"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import SalesFilters from "./SalesFilters";
import SalesTable, { type SaleRow } from "./SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";

interface ApiResponse {
  data: SaleRow[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SalesPageClient() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const [result, setResult] = useState<{
    queryString: string;
    data: ApiResponse | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadSales = async () => {
      try {
        const response = await fetch(
          `/api/sales/orders${queryString ? `?${queryString}` : ""}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const body = (await response.json()) as ApiResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error || "تعذر تحميل المبيعات");
        }

        setResult({ queryString, data: body });
      } catch (error) {
        if (controller.signal.aborted) return;

        toast.error(
          error instanceof Error ? error.message : "تعذر تحميل المبيعات",
        );
        setResult({ queryString, data: null });
      }
    };

    void loadSales();
    return () => controller.abort();
  }, [queryString]);

  const data =
    result?.queryString === queryString ? result.data : null;
  const loading = result?.queryString !== queryString;
  const total = data?.pagination.total ?? 0;

  return (
    <div className="space-y-5 p-4 pb-16 md:p-6">
      <PageHeader
        title="المبيعات"
        subtitle="
                المبيعات المكتملة من الكاشير وطلبات التفصيل"
      />

      <SalesFilters />

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-gray-900">سجل المبيعات</h2>
            <p className="mt-1 text-xs text-gray-400">
              {loading
                ? "جارٍ الحساب..."
                : `${total.toLocaleString("ar-SA")} عملية بيع`}
            </p>
          </div>
        </div>

        <SalesTable rows={data?.data ?? []} loading={loading} />

        <Pagination meta={data?.pagination} />
      </section>
    </div>
  );
}

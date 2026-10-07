"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import SalesFilters from "./SalesFilters";
import SalesTable, { type SaleRow } from "./SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import {
  getSalesOrders,
  type SalesOrdersResponse,
} from "@/app/dashboard/pos/services/pos.services";

export default function SalesPageClient() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const [result, setResult] = useState<{
    queryString: string;
    data: SalesOrdersResponse | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(queryString);

    const loadSales = async () => {
      try {
        const body = await getSalesOrders({
          search: params.get("search") || undefined,
          paymentStatus:
            (params.get("paymentStatus") as
              | "UNPAID"
              | "PARTIAL"
              | "PAID"
              | undefined) ?? undefined,
          paymentMethod:
            (params.get("paymentMethod") as
              | "CASH"
              | "CARD"
              | "BANK_TRANSFER"
              | "MIXED"
              | undefined) ?? undefined,
          orderType:
            (params.get("orderType") as "POS" | "TAILORING" | undefined) ??
            undefined,
          fromDate: params.get("fromDate") || undefined,
          toDate: params.get("toDate") || undefined,
          sort:
            params.get("sort") === "date-asc" ? "date-asc" : "date-desc",
          page: Number(params.get("page")) || 1,
          limit: Number(params.get("limit")) || 10,
        });
        if (active) setResult({ queryString, data: body });
      } catch (error) {
        if (!active) return;

        toast.error(
          error instanceof Error ? error.message : "تعذر تحميل المبيعات",
        );
        setResult({ queryString, data: null });
      }
    };

    void loadSales();
    return () => {
      active = false;
    };
  }, [queryString]);

  const response =
    result?.queryString === queryString ? result.data : null;
  const rows: SaleRow[] = response?.data ?? [];
  const loading = result?.queryString !== queryString;
  const total = response?.pagination.total ?? 0;

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
                : `${total.toLocaleString("ar-SA-u-nu-latn")} عملية بيع`}
            </p>
          </div>
        </div>

        <SalesTable rows={rows} loading={loading} />

        <Pagination meta={response?.pagination} />
      </section>
    </div>
  );
}

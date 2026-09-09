"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { useModalStore } from "@/store/useModalStore";

import OrdersTable from "./OrdersTable";
import { PurchaseOrder } from "../schemas/orders.schemas";

interface Props {
  orders: PurchaseOrder[];
  meta: {
    total: number;
    totalPages: number;
    page: number;
    limit: number;
  };
}

export default function OrdersPageClient({ orders, meta }: Props) {
  const openModal = useModalStore((state) => state.openModal);
  const router = useRouter();

  return (
    <main dir="rtl">
      <PageHeader
        title="طلبات الشراء"
        subtitle={`${meta.total} طلب مسجل`}
        buttonTitle="عملية شراء جديدة"
        redirect={() => router.push("/dashboard/orders/new")}
      />

      <div className="frame my-8 overflow-hidden p-0!">
        <Suspense
          fallback={
            <div className="flex h-20 items-center gap-3 border-b border-gray-100 bg-gray-50/50 p-4">
              <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-28 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-28 animate-pulse rounded-lg bg-gray-100" />
            </div>
          }
        >
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/50 p-4 md:flex-row md:items-center">
            <div className="grow">
              <TableSearchbar placeholder="ابحث برقم الطلب أو المورد..." />
            </div>

            <TableFilter
              label="الحالة"
              paramKey="status"
              options={[
                { label: "كل الحالات", value: "ALL" },
                { label: "مسودة", value: "DRAFT" },
                { label: "تمت الموافقة", value: "APPROVED" },
                { label: "مستلم", value: "RECEIVED" },
                { label: "ملغى", value: "CANCELLED" },
              ]}
            />

            <TableFilter
              label="نوع الشراء"
              paramKey="purchaseType"
              options={[
                { label: "كل الأنواع", value: "ALL" },
                { label: "شراء مباشر", value: "DIRECT" },
                { label: "طلب شراء", value: "WORKFLOW" },
              ]}
            />

            <TableFilter
              label="الترتيب"
              paramKey="sort"
              options={[
                { label: "الأحدث", value: "date_desc" },
                { label: "الأقدم", value: "date_asc" },
                { label: "الإجمالي الأعلى", value: "total_desc" },
                { label: "الإجمالي الأقل", value: "total_asc" },
              ]}
            />
          </div>
        </Suspense>

        <OrdersTable orders={orders} />

        <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
          <Pagination
            meta={{
              total: meta.total,
              totalPages: meta.totalPages,
              page: meta.page,
              limit: meta.limit,
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}

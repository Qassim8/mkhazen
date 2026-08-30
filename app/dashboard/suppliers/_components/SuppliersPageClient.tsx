"use client";

import { Suspense } from "react";
import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { useModalStore } from "@/store/useModalStore";
import { Supplier } from "../schemas/supplier.schemas";
import SuppliersTable from "./SuppliersTable";
import SupplierModalContent from "./SupplierModalContent";

interface SuppliersPageClientProps {
  initialData: Supplier[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SuppliersPageClient({
  initialData,
  meta,
}: SuppliersPageClientProps) {
  const openModal = useModalStore((state) => state.openModal);

  return (
    <main>
      <PageHeader
        title="الموردين"
        subtitle={`${meta.total} مورد مسجل في النظام`}
        buttonTitle="اضف مورد"
        redirect={() =>
          openModal("CREATE", {
            title: "إضافة مورد جديد",
            content: <SupplierModalContent />,
          })
        }
      />

      <div className="frame p-0! my-8">
        <Suspense
          fallback={
            <div className="flex h-16 items-center gap-3 px-3 py-5 md:flex-row">
              <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-100" />
            </div>
          }
        >
          <div className="py-5 px-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="grow">
              <TableSearchbar placeholder="ابحث باسم المورد أو الهاتف أو البريد..." />
            </div>
            <div>
              <TableFilter
                label="اختر حالة المورد"
                paramKey="status"
                options={[
                  { label: "نشط", value: "active" },
                  { label: "غير نشط", value: "inactive" },
                ]}
              />
            </div>
          </div>
        </Suspense>

        <SuppliersTable initialData={initialData} />
        <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
          <Pagination meta={meta} />
        </Suspense>
      </div>
    </main>
  );
}

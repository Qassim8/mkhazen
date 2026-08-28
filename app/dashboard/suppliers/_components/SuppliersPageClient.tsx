"use client";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { useModalStore } from "@/store/useModalStore";
import { Supplier } from "../schemas/supplier.schemas";
import SuppliersTable from "./SuppliersTable";
import ModalContent from "./ModalContent";

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
            content: <ModalContent />,
          })
        }
      />

      <div className="frame p-0! my-8">
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

        <SuppliersTable initialData={initialData} />
        <Pagination meta={meta} />
      </div>
    </main>
  );
}

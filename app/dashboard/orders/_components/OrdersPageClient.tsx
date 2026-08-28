"use client";

import PageHeader from "@/components/shared/PageHeader";
import Pagination from "@/components/shared/Pagination";
import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import { useModalStore } from "@/store/useModalStore";
import OrdersTable from "./OrdersTable";
import OrderModalContent from "./OrderModalContent";
import { PurchaseOrder } from "../schemas/orders.schemas";

interface Props {
  orders: PurchaseOrder[];
  meta: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export default function OrdersPageClient({ orders, meta }: Props) {
  const openModal = useModalStore((state) => state.openModal);
  return (
    <main dir="rtl">
      <PageHeader
        title="طلبات الشراء"
        subtitle={`${meta.totalCount} طلب مسجل`}
        buttonTitle="إضافة طلب شراء"
        redirect={() =>
          openModal("CREATE", {
            title: "إضافة طلب شراء",
            content: <OrderModalContent />,
          })
        }
      />
      <div className="frame my-8 overflow-hidden p-0!">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/50 p-4 md:flex-row md:items-center">
          <div className="grow">
            <TableSearchbar placeholder="ابحث برقم الطلب..." />
          </div>
          <TableFilter
            label="الحالة"
            paramKey="status"
            options={[
              { label: "مسودة", value: "DRAFT" },
              { label: "معتمد", value: "APPROVED" },
              { label: "مستلم", value: "RECEIVED" },
              { label: "ملغى", value: "CANCELLED" },
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
        <OrdersTable orders={orders} />
        <Pagination
          meta={{
            total: meta.totalCount,
            totalPages: meta.totalPages,
            page: meta.currentPage,
            limit: meta.limit,
          }}
        />
      </div>
    </main>
  );
}

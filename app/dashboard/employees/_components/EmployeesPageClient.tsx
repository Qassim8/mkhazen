"use client";

import PageHeader from "@/components/shared/PageHeader";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./Filters";
import { ResetFilters } from "@/components/shared/ResetFilters";
import EmployeesTable from "./EmployeesTable";
import Pagination from "@/components/shared/Pagination";
import { Employee } from "@/types/types";
import { useModalStore } from "@/store/useModalStore";
import ModalContent from "./ModalContent";
import Link from "next/link";
import { LuKeyRound, LuX } from "react-icons/lu";

interface PageProps {
  data: Employee[];
  meta: any;
  isResetFilter?: boolean;
}

const EmployeesPageClient = ({ data, meta, isResetFilter }: PageProps) => {
  const openModal = useModalStore((state) => state.openModal);

  return (
    <main>
      <PageHeader
        title="الموظفين"
        subtitle="إدارة جميع الموظفين في النظام"
        buttonTitle="أضف موظف"
        redirect={() =>
          openModal("CREATE", {
            title: "انشاء موظف جديد",
            content: <ModalContent />,
          })
        }
      />
      {isResetFilter && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200/20 rounded-2xl flex items-center justify-between text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-xl">
              <LuKeyRound className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="text-xs font-black">
                طلبات إعادة تعيين كلمة المرور
              </p>
              <p className="text-[11px] font-semibold text-amber-700">
                يتم الآن عرض الموظفين الذين قاموا بطلب إعادة تعيين كلمة المرور
                فقط.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/employees"
            className="flex items-center gap-1 text-xs font-extrabold text-amber-800 bg-amber-100/60 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition"
          >
            <span>عرض كافة الموظفين</span>
            <LuX className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      <div className="frame p-0! h-full mb-8">
        <div className="flex flex-col md:flex-row items-center md:gap-5 px-3 py-1.5 md:px-5">
          <TableSearchbar placeholder="ابحث بالاسم أو الإيميل..." />
          <Filters />
          <ResetFilters />
        </div>

        <EmployeesTable initialData={data} />

        <Pagination meta={meta} />
      </div>
    </main>
  );
};

export default EmployeesPageClient;

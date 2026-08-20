import React from "react";
import EmployeesTable from "./_components/EmployeesTable";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./_components/Filters";
import PageHeader from "@/components/shared/PageHeader";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./_components/ModalContent";
import { getEmployees } from "./services/employees.services";
import { employees } from "@/data/data";
import { ResetFilters } from "@/components/shared/ResetFilters";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

const Employees = async ({ searchParams }: PageProps) => {
  const query = await searchParams;
  const { data, meta } = await getEmployees({
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 10,
    search: query.search || "",
    position: query.position as any,
    shift: query.shift as any,
    status: query.status as any,
  });

  return (
    <main>
      <GenericModal modalContent={<ModalContent />} />
      <PageHeader
        title="الموظفين"
        subtitle="ادر جميع موظفيك"
        buttonTitle="اضف موظف"
      />
      <div className="frame p-0! h-full mb-8">
        <div className="flex flex-col md:flex-row items-center md:gap-5 p-3 md:p-5">
          <TableSearchbar placeholder="ابحث بالاسم او الوظيفة...." />
          <Filters />
          <ResetFilters />
        </div>
        <EmployeesTable initialData={data} />
      </div>
    </main>
  );
};

export default Employees;

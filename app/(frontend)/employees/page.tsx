import React from "react";
import EmployeesTable from "./components/EmployeesTable";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Filters from "./components/Filters";
import PageHeader from "@/components/shared/PageHeader";
import GenericModal from "@/components/ui/AddNewModal";
import ModalContent from "./components/ModalContent";

const Employees = () => {
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
        </div>
        <EmployeesTable />
      </div>
    </main>
  );
};

export default Employees;

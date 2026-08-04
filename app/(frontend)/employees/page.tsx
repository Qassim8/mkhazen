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
        title="Employees"
        subtitle="manage all your employees"
        buttonTitle="Add Employee"
      />
      <div className="frame p-0! h-full mb-8">
        <div className="flex items-center gap-5 px-5">
          <TableSearchbar placeholder="Search by name or job....." />
          <Filters />
        </div>
        <EmployeesTable />
      </div>
    </main>
  );
};

export default Employees;

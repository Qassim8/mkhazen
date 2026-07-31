import React from "react";
import EmployeesTable from "./components/EmployeesTable";
import TableSearchbar from "@/components/layout/TableSearchbar";
import Filters from "./components/Filters";

const Employees = () => {
  return (
    <main>
      <div className="frame p-0! h-full my-10">
        <div className="flex flex-col gap-2 pt-3 px-5">
          <p className="text-sm text-gray-500">Products overview</p>
          <h2 className="font-semibold text-gray-900">Must sold products</h2>
        </div>
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

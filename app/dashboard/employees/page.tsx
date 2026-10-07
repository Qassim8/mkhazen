import { getEmployees } from "./services/employees.services";
import type { EmployeeQueryParams } from "./schemas/employee.schemas";
import EmployeesPageClient from "./_components/EmployeesPageClient";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

const Employees = async ({ searchParams }: PageProps) => {
  const query = await searchParams;
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const isResetFilter =
    query.resetRequested === "true" || query.filter === "resetRequested";

  const { data, meta } = await getEmployees({
    page,
    limit,
    search: query.search || "",
    position: query.position as EmployeeQueryParams["position"],
    shift: query.shift as EmployeeQueryParams["shift"],
    isActive: query.isActive as EmployeeQueryParams["isActive"],
    resetRequested: isResetFilter,
  });

  return (
    <EmployeesPageClient
      data={data}
      meta={meta}
      isResetFilter={isResetFilter}
    />
  );
};

export default Employees;

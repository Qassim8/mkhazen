import { getEmployees } from "./services/employees.services";
import type { EmployeeQueryParams } from "./schemas/employee.schemas";
import EmployeesPageClient from "./_components/EmployeesPageClient";
import { loadPayrollMonth, normalizePeriod } from "@/app/api/payroll/_lib/payroll";

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

  // ملخص الشهر الحالي: الراتب/المأخوذ/المتبقي، وللخياط مستحقات الشهر/المأخوذ/المتبقي
  const month = await loadPayrollMonth(normalizePeriod(null)).catch(() => null);
  const salaryById = new Map(month?.employees.map((row) => [row.userId, row]) ?? []);
  const tailorById = new Map(month?.tailors.map((row) => [row.tailorId, row]) ?? []);

  const withSummary = data.map((employee) => {
    const tailor = tailorById.get(employee.id);
    const salary = salaryById.get(employee.id);
    return {
      ...employee,
      monthSummary: tailor
        ? { kind: "TAILOR" as const, dueSdg: tailor.monthDuesSdg, takenSdg: tailor.monthTakenSdg, remainingSdg: tailor.remainingSdg }
        : salary
          ? { kind: "SALARY" as const, dueSdg: salary.salarySdg, takenSdg: salary.takenSdg, remainingSdg: salary.remainingSdg }
          : undefined,
    };
  });

  return (
    <EmployeesPageClient
      data={withSummary}
      meta={meta}
      isResetFilter={isResetFilter}
    />
  );
};

export default Employees;

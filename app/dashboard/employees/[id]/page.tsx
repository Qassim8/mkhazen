import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  loadEmployeeMovements,
  loadEmployeeProfile,
  loadPayrollMonth,
  normalizePeriod,
} from "@/app/api/payroll/_lib/payroll";

import EmployeePageClient from "../_components/EmployeePageClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** صفحة الموظف: الراتب (لو موجود) ورصيد السلف والأزرار وسجل كامل بالحركات */
export default async function EmployeePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "payroll.manage")) redirect("/dashboard");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const profile = await loadEmployeeProfile(id);
  // الخياط له نظام مستحقاته المنفصل
  if (!profile || profile.role === "tailor") notFound();

  const period = normalizePeriod(null);
  const [month, movements] = await Promise.all([loadPayrollMonth(period), loadEmployeeMovements(id)]);
  const row = month.employees.find((employee) => employee.userId === id);

  return (
    <EmployeePageClient
      profile={profile}
      period={period}
      summary={{
        advanceBalanceSdg: row?.advanceBalanceSdg ?? 0,
        advancesMonthSdg: row?.advancesMonthSdg ?? 0,
        returnedMonthSdg: row?.returnedMonthSdg ?? 0,
        deductedMonthSdg: row?.deductedMonthSdg ?? 0,
        salaryPaidSdg: row?.salaryPaidSdg ?? 0,
        commissionPaidSdg: row?.commissionPaidSdg ?? 0,
      }}
      movements={movements}
    />
  );
}

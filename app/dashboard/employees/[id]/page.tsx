import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import {
  loadEmployeeMovements,
  loadEmployeeProfile,
  loadPayrollMonth,
  loadTailorAdvanceMovements,
  loadTailorDuesPayments,
  loadTailorProfile,
  normalizePeriod,
} from "@/app/api/payroll/_lib/payroll";

import EmployeePageClient from "../_components/EmployeePageClient";
import TailorPageClient from "../_components/TailorPageClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * صفحة الموظف: الراتب (لو موجود) ورصيد السلف والأزرار وسجل كامل بالحركات.
 * للخياط: رصيد المستحقات ورصيد السلف منفصلان، وسجل السلف ومدفوعات المستحقات بروابط القيود.
 */
export default async function EmployeePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "payroll.manage")) redirect("/dashboard");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const profile = await loadEmployeeProfile(id);
  if (!profile) notFound();

  const period = normalizePeriod(null);

  if (profile.role === "tailor") {
    const tailor = await loadTailorProfile(id);
    if (!tailor) notFound();

    const [month, movements, payments] = await Promise.all([
      loadPayrollMonth(period),
      loadTailorAdvanceMovements(id),
      loadTailorDuesPayments(id),
    ]);
    const row = month.tailors.find((item) => item.tailorId === id);

    return (
      <TailorPageClient
        profile={tailor}
        summary={{
          monthDuesSdg: row?.monthDuesSdg ?? 0,
          monthTakenSdg: row?.monthTakenSdg ?? 0,
          remainingSdg: row?.remainingSdg ?? 0,
          advanceBalanceSdg: row?.advanceBalanceSdg ?? 0,
          orderAdvancesSdg: row?.orderAdvancesSdg ?? 0,
          advancesMonthSdg: row?.advancesMonthSdg ?? 0,
          returnedMonthSdg: row?.returnedMonthSdg ?? 0,
          deductedMonthSdg: row?.deductedMonthSdg ?? 0,
        }}
        movements={movements}
        payments={payments}
      />
    );
  }

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

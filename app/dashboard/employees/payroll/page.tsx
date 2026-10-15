import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadPayrollMonth, normalizePeriod } from "@/app/api/payroll/_lib/payroll";

import PayrollClient from "./_components/PayrollClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ period?: string; tab?: string }>;
}

export default async function PayrollPage({ searchParams }: Props) {
  const user = await getSession();
  if (!user || !can(user.role, "payroll.manage")) redirect("/dashboard");

  const params = await searchParams;
  const data = await loadPayrollMonth(normalizePeriod(params.period));

  return <PayrollClient data={data} initialTab={params.tab === "tailors" ? "tailors" : "employees"} />;
}

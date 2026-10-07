import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import {
  buildReport,
  describeFilters,
  resolveReportFilters,
} from "@/lib/reports/build-report";

import ReportsClient from "./_components/ReportsClient";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await getSession();

  if (!user || !can(user.role, "reports.view")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const filters = resolveReportFilters(params);
  const report = await buildReport(filters);

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab =
    tabParam === "products" || tabParam === "categories" || tabParam === "inventory"
      ? tabParam
      : "summary";

  return (
    <ReportsClient
      report={report}
      filterLabels={describeFilters(report)}
      initialTab={initialTab}
    />
  );
}

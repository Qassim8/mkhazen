import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import PayablesClient from "../_components/PayablesClient";
import { getPayables } from "../services/payables.services";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    type?: string;
    overdue?: string;
  }>;
}

export default async function PayablesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "payables.manage")) redirect("/dashboard");

  const params = await searchParams;
  const status = params.status === "PAID" || params.status === "ALL" ? params.status : "OPEN";
  const type = params.type === "ASSET" || params.type === "EXPENSE" ? params.type : "ALL";

  const response = await getPayables({
    page: Math.max(1, Number(params.page ?? 1) || 1),
    search: params.search?.trim().slice(0, 100) || undefined,
    status,
    type,
    overdue: params.overdue === "true",
  });

  return (
    <PayablesClient
      rows={response.data}
      meta={response.meta}
      summary={response.summary}
      canViewAccounting={can(session.role, "accounting.view")}
    />
  );
}

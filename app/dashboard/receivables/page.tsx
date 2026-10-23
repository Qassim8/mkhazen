import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import ReceivablesClient from "./_components/ReceivablesClient";
import { getReceivables } from "./services/receivables.services";

interface Props {
  searchParams: Promise<{ page?: string; search?: string; overdue?: string }>;
}

export default async function ReceivablesPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const response = await getReceivables({
    page: Math.max(1, Number(params.page ?? 1) || 1),
    search: params.search?.trim().slice(0, 100) || undefined,
    overdue: params.overdue === "true",
  });

  return (
    <ReceivablesClient
      rows={response.data}
      meta={response.meta}
      summary={response.summary ?? null}
      isManager={can(session?.role, "sales.creditManage")}
    />
  );
}

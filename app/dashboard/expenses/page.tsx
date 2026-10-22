import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import ExpensesClient from "./_components/ExpensesClient";
import { getMyExpenses } from "./services/expenses.services";

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function ExpensesPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const { data, meta } = await getMyExpenses({ page });

  return (
    <ExpensesClient
      initialData={data}
      meta={meta}
      allowRent={can(session?.role, "accounting.manage")}
    />
  );
}

import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import CustomersClient from "./_components/CustomersClient";
import { getCustomers, getDuplicateGroups } from "./services/customers.services";

interface Props {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: Props) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "customers.view")) redirect("/dashboard/tailoring");

  const params = await searchParams;
  const search = (params.search ?? "").trim().slice(0, 100);
  const pageNumber = Number(params.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const canMerge = can(user.role, "customers.merge");

  const [{ data: customers, meta }, duplicateGroups] = await Promise.all([
    getCustomers({ search, page, limit: 20, includeStats: true }),
    canMerge ? getDuplicateGroups() : Promise.resolve([]),
  ]);

  return (
    <CustomersClient
      customers={customers}
      meta={meta}
      canDelete={can(user.role, "customers.delete")}
      duplicateGroups={duplicateGroups}
    />
  );
}

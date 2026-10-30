import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api-client";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import CustomerDetailClient from "../_components/CustomerDetailClient";
import { getCustomerDetail } from "../services/customers.services";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "customers.view")) redirect("/dashboard/tailoring");

  const { id } = await params;

  let customer;
  try {
    customer = await getCustomerDetail(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  return (
    <CustomerDetailClient
      customer={customer}
      canUpdate={can(user.role, "customers.update")}
      canViewSales={can(user.role, "sales.view")}
    />
  );
}

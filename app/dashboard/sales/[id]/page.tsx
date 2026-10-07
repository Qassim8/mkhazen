import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import SalesInvoiceClient from "./_components/SalesInvoiceClient";
import { can } from "@/lib/permissions";

export default async function SalesDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();

  if (!session || !can(session.role, "sales.view")) {
    redirect("/dashboard");
  }

  const { id } = await params;

  return <SalesInvoiceClient orderId={id} />;
}

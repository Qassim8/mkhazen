import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import SalesInvoiceClient from "./_components/SalesInvoiceClient";

export default async function SalesDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();

  if (!session || String(session.role).toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  const { id } = await params;

  return <SalesInvoiceClient orderId={id} />;
}

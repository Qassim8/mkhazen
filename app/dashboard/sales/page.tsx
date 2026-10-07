import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

import SalesPageClient from "./_components/SalesPageClient";
import { can } from "@/lib/permissions";

export default async function SalesPage() {
  const session = await getSession();

  if (!session || !can(session.role, "sales.view")) {
    redirect("/dashboard");
  }

  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-gray-500">جارٍ تحميل المبيعات...</div>
      }
    >
      <SalesPageClient />
    </Suspense>
  );
}

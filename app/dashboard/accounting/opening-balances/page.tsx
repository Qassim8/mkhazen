import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import BackLink from "@/components/shared/BackLink";
import { getSupplierOptions } from "@/app/dashboard/suppliers/services/supplier.services";

import OpeningBalancesClient from "../_components/OpeningBalancesClient";
import { getOpeningBalancesStatus } from "../services/opening-balances.services";
import type { OpeningBalancesStatus } from "../schemas/opening-balances.schema";

export default async function OpeningBalancesPage() {
  const user = await getSession();

  if (!user || !can(user.role, "accounting.openingBalances")) {
    redirect("/dashboard/accounting");
  }

  let status: OpeningBalancesStatus | null = null;
  let loadError: string | null = null;

  try {
    status = await getOpeningBalancesStatus();
  } catch (error) {
    // أشهر سبب: ملف 20261010_05_opening_balances.sql لسه ما اتشغلش على قاعدة البيانات
    loadError = error instanceof Error ? error.message : "تعذر جلب الأرصدة الافتتاحية.";
  }

  if (!status) {
    return (
      <main dir="rtl" className="space-y-5">
        <div className="mb-3">
          <BackLink href="/dashboard/accounting" label="العودة إلى المحاسبة" />
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-black text-amber-900">الأرصدة الافتتاحية غير مفعّلة بعد</h1>
          <p className="mt-2 text-sm text-amber-900">
            شغّل ملف{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
              database/migrations/20261010_05_opening_balances.sql
            </code>{" "}
            على قاعدة البيانات في Supabase، وبعدها حدّث الصفحة.
          </p>
          <p className="mt-3 font-mono text-xs break-all text-amber-700">{loadError}</p>
        </div>
      </main>
    );
  }

  const suppliers = await getSupplierOptions()
    .then((response) => response.data.map((supplier) => ({ id: supplier.id, name: supplier.name, isActive: supplier.isActive })))
    .catch(() => []);

  return <OpeningBalancesClient status={status} suppliers={suppliers} />;
}

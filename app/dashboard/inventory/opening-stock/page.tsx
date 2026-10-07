import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import BackLink from "@/components/shared/BackLink";

import OpeningStockClient from "../_components/OpeningStockClient";
import { getOpeningStockCandidates } from "../services/inventory.services";
import type { OpeningStockCandidate } from "../schema/inventory.schemas";

export default async function OpeningStockPage() {
  const user = await getSession();

  if (!user || !can(user.role, "inventory.openingStock")) {
    redirect("/dashboard/inventory");
  }

  let candidates: OpeningStockCandidate[] = [];
  let loadError: string | null = null;

  try {
    const { data } = await getOpeningStockCandidates();
    candidates = data;
  } catch (error) {
    // أشهر سبب: ملف SQL الخاص بالمخزون الافتتاحي لسه ما اتشغلش على قاعدة البيانات
    loadError =
      error instanceof Error ? error.message : "تعذر جلب الأصناف المؤهلة.";
  }

  if (loadError) {
    return (
      <main dir="rtl" className="space-y-5">
        <div className="mb-3">
          <BackLink href="/dashboard/inventory" label="العودة إلى المخزون" />
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-black text-amber-900">
            المخزون الافتتاحي غير مفعّل بعد
          </h1>

          <p className="mt-2 text-sm text-amber-900">
            شغّل ملف{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
              database/migrations/20261006_opening_stock.sql
            </code>{" "}
            على قاعدة البيانات في Supabase، وبعدها حدّث الصفحة.
          </p>

          <p className="mt-3 font-mono text-xs break-all text-amber-700">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return <OpeningStockClient candidates={candidates} />;
}

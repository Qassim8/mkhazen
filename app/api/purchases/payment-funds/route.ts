/**
 * /api/purchases/payment-funds — الرصيد المتاح للدفع عند استلام أمر الشراء
 *
 * GET → رصيد الخزينة والبنك بالدولار (عملة المشتريات) وبالجنيه، وسعر الصرف الحالي.
 * الكاشير لا يرى أرصدة الحسابات: يرجع { visible: false } والفحص الفعلي يتم في قاعدة البيانات.
 */

import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAccountBalance } from "@/app/api/accounting/_lib/accounting";

export async function GET() {
  const guard = await requirePermission("purchases.manage");
  if (!guard.ok) return guard.response;

  if (!can(guard.session.role, "accounting.view")) {
    return NextResponse.json(
      { data: { visible: false } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [cashUsd, cashSdg, bankUsd, bankSdg, rateResult] = await Promise.all([
      getAccountBalance("CASH", "USD"),
      getAccountBalance("CASH", "SDG"),
      getAccountBalance("BANK", "USD"),
      getAccountBalance("BANK", "SDG"),
      supabaseAdmin
        .from("exchange_rates")
        .select("rate")
        .eq("branch_id", MAIN_BRANCH_ID)
        .lte("effective_at", new Date().toISOString())
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return NextResponse.json(
      {
        data: {
          visible: true,
          cash: { usd: cashUsd, sdg: cashSdg },
          bank: { usd: bankUsd, sdg: bankSdg },
          rate: rateResult.data ? Number(rateResult.data.rate) : null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/purchases/payment-funds:", error);
    return apiError(503, "SERVICE_UNAVAILABLE", "تعذر تحميل أرصدة الحسابات.");
  }
}

/**
 * GET /api/sales/receivables — ذمم العملاء الموحدة (مصدر واحد: get_unified_receivables)
 *
 * التصنيفات (kind):
 *   POS_CREDIT             ديون فواتير الكاشير بالتقسيط المفتوحة (ديون فعلية)
 *   TAILORING_IN_PROGRESS  متبقي على طلبات تفصيل غير ملغاة ولم تُسلَّم (مبالغ متوقعة، ليست ديونًا)
 * لا يوجد تصنيف "تفصيل مُسلَّم وعليه متبقٍ": التسليم يحصّل كامل المتبقي (complete_tailoring_pickup).
 *
 * • التقييم بالدولار (يوم البيع ← اليوم) للنوعين.
 * • بحث (رقم الفاتورة / اسم العميل / الهاتف بأي صيغة) وفلتر المتأخرة والتصنيف وصفحات.
 * • الكاشير وما فوق. الربح المتوقع وتكلفة المؤجل ونسبة الخسارة من الربح وملخص التكلفة
 *   لمن يملك sales.creditProfit (المالك والمدير) فقط.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiError, dbErrorResponse } from "@/lib/api-response";
import { phoneSearchVariants } from "@/lib/customer-phone";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { receivablesQuerySchema } from "@/app/dashboard/pos/schemas/credit.schemas";

type UnifiedRow = {
  kind: "POS_CREDIT" | "TAILORING_IN_PROGRESS";
  order_id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  due_date: string | null;
  is_overdue: boolean;
  payment_status: string;
  status_code: string | null;
  can_collect: boolean;
  total_amount: number | string;
  paid_amount: number | string;
  remaining_sdg: number | string;
  sale_rate: number | string | null;
  current_rate: number | string | null;
  remaining_usd_at_sale: number | string | null;
  remaining_usd_now: number | string | null;
  loss_usd: number | string | null;
  loss_pct: number | string | null;
  equivalent_sdg_today: number | string | null;
  expected_profit_usd: number | string | null;
  deferred_cost_usd: number | string | null;
  loss_pct_of_profit: number | string | null;
};

const num = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

export async function GET(req: NextRequest) {
  const guard = await requirePermission("sales.pos", "عذراً، ذمم العملاء غير متاحة لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const canProfit = can(guard.session.role, "sales.creditProfit");

  const params = req.nextUrl.searchParams;
  const validation = receivablesQuerySchema.safeParse({
    page: params.get("page") || undefined,
    limit: params.get("limit") || undefined,
    search: params.get("search") || undefined,
    overdue: params.get("overdue") || undefined,
    kind: params.get("kind") || undefined,
    customerId: params.get("customerId") || undefined,
  });

  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "معاملات الطلب غير صحيحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { page, limit, search, overdue, kind, customerId } = validation.data;

  try {
    const [unified, summary] = await Promise.all([
      supabaseAdmin.rpc("get_unified_receivables", { p_customer_id: customerId ?? null }),
      supabaseAdmin.rpc("get_receivables_summary"),
    ]);

    if (unified.error) return dbErrorResponse(unified.error, "get_unified_receivables", "تعذر جلب ذمم العملاء.");
    if (summary.error) return dbErrorResponse(summary.error, "get_receivables_summary", "تعذر جلب ملخص الذمم.");

    let rows = (unified.data ?? []) as UnifiedRow[];

    if (kind !== "ALL") rows = rows.filter((row) => row.kind === kind);

    const needle = (search ?? "").trim().toLowerCase();
    if (needle) {
      const phones = phoneSearchVariants(needle);
      rows = rows.filter((row) => {
        if ([row.order_number, row.customer_name, row.customer_phone].some((value) => value && String(value).toLowerCase().includes(needle))) {
          return true;
        }
        if (phones.length === 0 || !row.customer_phone) return false;
        const stored = String(row.customer_phone).replace(/[^0-9]/g, "");
        const storedNormalized = stored.startsWith("249") ? stored : stored.length === 10 && stored.startsWith("0") ? `249${stored.slice(1)}` : stored;
        return phones.some((variant) => stored.includes(variant) || storedNormalized.includes(variant));
      });
    }

    if (overdue === "true") rows = rows.filter((row) => row.is_overdue);

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, page * limit);

    const rawSummary = (summary.data ?? {}) as Record<string, unknown>;
    const publicSummary = {
      pos_credit: rawSummary.pos_credit ?? null,
      tailoring_in_progress: rawSummary.tailoring_in_progress ?? null,
      total: rawSummary.total ?? null,
      // التكلفة المؤجلة (محاسبية) للمالك والمدير فقط
      ...(canProfit
        ? {
            deferred_cost_usd_open: rawSummary.deferred_cost_usd_open ?? 0,
            deferred_cogs_usd: rawSummary.deferred_cogs_usd ?? 0,
          }
        : {}),
    };

    return NextResponse.json({
      data: pageRows.map((row) => ({
        kind: row.kind,
        order_id: row.order_id,
        order_number: row.order_number,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        created_at: row.created_at,
        due_date: row.due_date,
        is_overdue: row.is_overdue,
        payment_status: row.payment_status,
        status_code: row.status_code,
        can_collect: row.can_collect,
        total_amount: num(row.total_amount),
        paid_amount: num(row.paid_amount),
        remaining_sdg: num(row.remaining_sdg),
        sale_rate: num(row.sale_rate),
        current_rate: num(row.current_rate),
        remaining_usd_at_sale: num(row.remaining_usd_at_sale),
        remaining_usd_now: num(row.remaining_usd_now),
        loss_usd: num(row.loss_usd),
        loss_pct: num(row.loss_pct),
        equivalent_sdg_today: num(row.equivalent_sdg_today),
        // الربح المتوقع والتكلفة للمالك والمدير فقط
        ...(canProfit
          ? {
              expected_profit_usd: num(row.expected_profit_usd),
              loss_pct_of_profit: num(row.loss_pct_of_profit),
              deferred_cost_usd: num(row.deferred_cost_usd),
            }
          : {}),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
      summary: publicSummary,
    });
  } catch (error: unknown) {
    console.error("GET /api/sales/receivables:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء جلب ذمم العملاء.");
  }
}

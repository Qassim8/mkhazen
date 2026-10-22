/**
 * GET /api/sales/receivables — الفواتير الآجلة المفتوحة مع تقييم المتبقي
 *
 * • التقييم من get_credit_valuation (المتبقي بسعر البيع وسعر اليوم والخسارة).
 * • بحث (رقم الفاتورة / اسم العميل / الهاتف) وفلتر المتأخرة وصفحات.
 * • الكاشير وما فوق. expected_profit_usd و loss_pct_of_profit (وتكلفة المؤجل) والملخص
 *   المحاسبي للمالك والمدير فقط.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiError, dbErrorResponse } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { receivablesQuerySchema } from "@/app/dashboard/pos/schemas/credit.schemas";

type ValuationRow = {
  order_id: string;
  order_number: string;
  credit_customer_name: string | null;
  credit_customer_phone: string | null;
  created_at: string;
  due_date: string | null;
  is_overdue: boolean;
  payment_status: string;
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
  const guard = await requirePermission("sales.pos", "عذراً، الفواتير الآجلة غير متاحة لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const isManager = can(guard.session.role, "sales.creditManage");

  const params = req.nextUrl.searchParams;
  const validation = receivablesQuerySchema.safeParse({
    page: params.get("page") || undefined,
    limit: params.get("limit") || undefined,
    search: params.get("search") || undefined,
    overdue: params.get("overdue") || undefined,
  });

  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "معاملات الطلب غير صحيحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { page, limit, search, overdue } = validation.data;

  try {
    const [valuation, summary] = await Promise.all([
      supabaseAdmin.rpc("get_credit_valuation", { p_order_id: null }),
      isManager ? supabaseAdmin.rpc("get_receivables_summary") : Promise.resolve({ data: null, error: null }),
    ]);

    if (valuation.error) return dbErrorResponse(valuation.error, "get_credit_valuation", "تعذر جلب الفواتير الآجلة.");
    if (summary.error) return dbErrorResponse(summary.error, "get_receivables_summary", "تعذر جلب ملخص الديون.");

    let rows = (valuation.data ?? []) as ValuationRow[];

    const needle = (search ?? "").toLowerCase();
    if (needle) {
      rows = rows.filter((row) =>
        [row.order_number, row.credit_customer_name, row.credit_customer_phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
    }

    if (overdue === "true") rows = rows.filter((row) => row.is_overdue);

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      data: pageRows.map((row) => ({
        order_id: row.order_id,
        order_number: row.order_number,
        credit_customer_name: row.credit_customer_name,
        credit_customer_phone: row.credit_customer_phone,
        created_at: row.created_at,
        due_date: row.due_date,
        is_overdue: row.is_overdue,
        payment_status: row.payment_status,
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
        ...(isManager
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
      ...(isManager ? { summary: summary.data } : {}),
    });
  } catch (error: unknown) {
    console.error("GET /api/sales/receivables:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء جلب الفواتير الآجلة.");
  }
}

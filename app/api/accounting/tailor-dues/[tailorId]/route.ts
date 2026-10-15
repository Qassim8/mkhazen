import { NextResponse } from "next/server";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import { apiError, dbErrorResponse, isUuid } from "@/lib/api-response";
import {
  mapTailorDuesOrderRow,
  mapTailorDuesPaymentRow,
  mapTailorDuesRow,
} from "@/app/api/accounting/_lib/tailor-dues";

/** GET — كشف الخياط: طلباته المثبتة، والسداد، والسلف (منفصلة) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tailorId: string }> },
) {
  const guard = await requirePermission("accounting.view");
  if (!guard.ok) return guard.response;

  const { tailorId } = await params;
  if (!isUuid(tailorId)) return apiError(400, "VALIDATION_ERROR", "معرف الخياط غير صالح.");

  const [summaryResult, ordersResult, paymentsResult] = await Promise.all([
    supabaseAdmin.rpc("get_tailor_dues", { p_branch_id: MAIN_BRANCH_ID, p_tailor_id: tailorId }),
    supabaseAdmin.rpc("get_tailor_dues_orders", { p_branch_id: MAIN_BRANCH_ID, p_tailor_id: tailorId }),
    supabaseAdmin
      .from("tailor_commission_payments")
      .select("id, sales_order_id, amount, amount_original, currency, exchange_rate_used, payment_type, payment_method, notes, created_at")
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("tailor_id", tailorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(1000),
  ]);

  if (summaryResult.error) return dbErrorResponse(summaryResult.error, "get_tailor_dues", "تعذر جلب كشف الخياط.");
  if (ordersResult.error) return dbErrorResponse(ordersResult.error, "get_tailor_dues_orders", "تعذر جلب كشف الخياط.");
  if (paymentsResult.error) return dbErrorResponse(paymentsResult.error, "tailor_commission_payments", "تعذر جلب كشف الخياط.");

  const summaryRaw = ((summaryResult.data ?? []) as Record<string, unknown>[])[0];
  if (!summaryRaw) return apiError(404, "NOT_FOUND", "الخياط غير موجود.");

  const orders = ((ordersResult.data ?? []) as Record<string, unknown>[]).map(mapTailorDuesOrderRow);
  const payments = (paymentsResult.data ?? []) as Record<string, unknown>[];

  // أرقام الطلبات للدفعات (بما فيها طلبات لم تُثبت تكلفتها بعد)
  const orderNumbers = new Map(orders.map((order) => [order.salesOrderId, order.orderNumber]));
  const missing = [
    ...new Set(
      payments
        .map((payment) => (payment.sales_order_id != null ? String(payment.sales_order_id) : null))
        .filter((id): id is string => Boolean(id) && !orderNumbers.has(id as string)),
    ),
  ];
  if (missing.length) {
    const { data } = await supabaseAdmin.from("sales_orders").select("id, order_number").in("id", missing);
    for (const row of (data ?? []) as { id: string; order_number: string }[]) {
      orderNumbers.set(row.id, row.order_number);
    }
  }

  return NextResponse.json({
    data: {
      summary: mapTailorDuesRow(summaryRaw),
      orders,
      payments: payments.map((payment) => mapTailorDuesPaymentRow(payment, orderNumbers)),
    },
  });
}

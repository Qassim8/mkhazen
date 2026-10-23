/**
 * GET /api/sales/orders/[id]/credit-history — سجل دفعات وتعديلات فاتورة آجلة
 *
 * الدفعات: الكاشير وما فوق (sales.pos). سجل التعديلات (تفاوض/دين معدوم) للمالك والمدير فقط.
 */

import { NextRequest, NextResponse } from "next/server";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { apiError, isUuid } from "@/lib/api-response";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

type NamedRelation = { name?: string | null } | { name?: string | null }[] | null;

const nameOf = (relation: NamedRelation) =>
  (Array.isArray(relation) ? relation[0]?.name : relation?.name) ?? null;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("sales.pos", "عذراً، الفواتير الآجلة غير متاحة لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const isManager = can(guard.session.role, "sales.creditManage");

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف الفاتورة غير صالح.");

  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_number, is_credit, total_amount")
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order || !order.is_credit) return apiError(404, "NOT_FOUND", "الفاتورة الآجلة غير موجودة.");

    const [payments, adjustments] = await Promise.all([
      supabaseAdmin
        .from("sales_order_payments")
        .select(
          "id, amount, payment_date, payment_method, notes, amount_usd, exchange_rate_sdg_per_usd, creator:users!created_by ( name )",
        )
        .eq("sales_order_id", id)
        .order("payment_date", { ascending: true })
        .order("id", { ascending: true }),
      isManager
        ? supabaseAdmin
            .from("credit_adjustments")
            .select("id, adjustment_type, old_remaining, new_remaining, reason, created_at, creator:users!created_by ( name )")
            .eq("order_id", id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (payments.error) throw payments.error;
    if (adjustments.error) throw adjustments.error;

    return NextResponse.json({
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        payments: (payments.data ?? []).map((row) => ({
          id: row.id,
          amount: Number(row.amount),
          paymentDate: row.payment_date,
          paymentMethod: row.payment_method,
          notes: row.notes,
          amountUsd: row.amount_usd != null ? Number(row.amount_usd) : null,
          exchangeRate: row.exchange_rate_sdg_per_usd != null ? Number(row.exchange_rate_sdg_per_usd) : null,
          createdByName: nameOf(row.creator as NamedRelation),
        })),
        adjustments: (adjustments.data ?? []).map((row) => ({
          id: row.id,
          type: row.adjustment_type,
          oldRemaining: Number(row.old_remaining),
          newRemaining: Number(row.new_remaining),
          reason: row.reason,
          createdAt: row.created_at,
          createdByName: nameOf(row.creator as NamedRelation),
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/sales/orders/[id]/credit-history:", error);
    return apiError(500, "INTERNAL_ERROR", "تعذر جلب سجل الفاتورة.");
  }
}

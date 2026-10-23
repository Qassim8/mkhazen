import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth";
import { remainingAfterPayment } from "@/lib/credit-server";
import { supabaseAdmin } from "@/lib/supabase";

import PaymentReceiptClient from "./PaymentReceiptClient";

interface Props {
  params: Promise<{ id: string; paymentId: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** إيصال دفعة على فاتورة آجلة (80mm / PDF) — للعميل، بدون أي تكلفة أو ربح */
export default async function CreditPaymentReceiptPage({ params }: Props) {
  const session = await getSession();
  if (!session) notFound();

  const { id, paymentId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(paymentId)) notFound();

  const { data: order, error: orderError } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, branch_id, is_credit, status, total_amount, remaining_amount, exchange_rate_used, credit_customer_name, credit_customer_phone, due_date, credit_closed_reason",
    )
    .eq("id", id)
    .maybeSingle();

  if (orderError) throw new Error("تعذر قراءة بيانات الفاتورة.");
  if (!order || !order.is_credit || order.status !== "COMPLETED") notFound();

  const [paymentsResult, adjustmentsResult, branchResult, rateResult] = await Promise.all([
    supabaseAdmin
      .from("sales_order_payments")
      .select("id, amount, payment_date, payment_method, notes, created_at, creator:users!created_by ( name )")
      .eq("sales_order_id", id)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabaseAdmin
      .from("credit_adjustments")
      .select("adjustment_type, new_remaining, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("branches").select("name").eq("id", order.branch_id).maybeSingle(),
    supabaseAdmin.rpc("get_current_exchange_rate", { p_branch_id: order.branch_id }),
  ]);

  if (paymentsResult.error) throw new Error("تعذر قراءة الدفعات.");

  const payments = paymentsResult.data ?? [];
  const payment = payments.find((row) => row.id === paymentId);
  if (!payment) notFound();

  const remainingAfter = remainingAfterPayment({
    totalAmount: Number(order.total_amount),
    payments: payments.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      at: row.payment_date,
    })),
    adjustments: (adjustmentsResult.data ?? []).map((row) => ({
      type: row.adjustment_type as "ADJUST" | "BAD_DEBT",
      newRemaining: Number(row.new_remaining),
      at: row.created_at,
    })),
    paymentId,
  });

  // دفعة أكبر من المتبقي وقتها = تعويض فرق صرف (الزيادة تظهر في الإيصال)
  const remainingBefore = remainingAfterPayment({
    totalAmount: Number(order.total_amount),
    // الدفعات السابقة لهذه الدفعة فقط (نفس ترتيب العرض الزمني)
    payments: payments
      .slice(0, payments.findIndex((row) => row.id === paymentId))
      .map((row) => ({ id: row.id, amount: Number(row.amount), at: row.payment_date })),
    adjustments: (adjustmentsResult.data ?? [])
      .filter((row) => new Date(row.created_at).getTime() <= new Date(payment.payment_date).getTime())
      .map((row) => ({
        type: row.adjustment_type as "ADJUST" | "BAD_DEBT",
        newRemaining: Number(row.new_remaining),
        at: row.created_at,
      })),
    paymentId: "",
  });

  const overpaid = Math.max(0, Math.round((Number(payment.amount) - remainingBefore) * 100) / 100);
  const creator = Array.isArray(payment.creator) ? payment.creator[0] : payment.creator;

  return (
    <PaymentReceiptClient
      receipt={{
        orderNumber: order.order_number,
        branchName: branchResult.data?.name?.trim() || "الفرع الرئيسي",
        customerName: order.credit_customer_name ?? "",
        customerPhone: order.credit_customer_phone ?? "",
        paymentDate: payment.payment_date,
        amount: Number(payment.amount),
        paymentMethod: payment.payment_method,
        notes: payment.notes ?? null,
        receivedBy: creator?.name ?? session.name,
        totalAmount: Number(order.total_amount),
        remainingAfter,
        overpaid,
        dueDate: order.due_date ?? null,
        saleRate: order.exchange_rate_used != null ? Number(order.exchange_rate_used) : null,
        currentRate: rateResult.data != null ? Number(rateResult.data) : null,
        closedReason: remainingAfter === 0 ? (order.credit_closed_reason ?? "PAID") : null,
      }}
    />
  );
}

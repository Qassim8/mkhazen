import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { fetchIn } from "@/lib/supabase-fetch-all";

/**
 * فواتير العميل (كاشير + تفصيل) وإحصاءاته — مصدر واحد لصفحة العملاء وتفاصيل العميل.
 *
 * • فاتورة الكاشير: المكتملة فقط. المدفوع = الإجمالي، إلا الآجلة فمجموع دفعاتها المحفوظ.
 * • طلب التفصيل (للعميل فقط): غير الملغي. المدفوع = دفعات مباشرة + عربون منقول إليه − منقول منه − مسترد
 *   (نفس معادلة /api/tailoring/orders).
 */

export type CustomerOrderKind = "POS" | "TAILORING";

export interface CustomerOrder {
  id: string;
  customerId: string;
  orderNumber: string;
  kind: CustomerOrderKind;
  createdAt: string;
  completedAt: string | null;
  itemName: string | null;
  total: number;
  paid: number;
  remaining: number;
  /** حالة العرض بالعربي */
  statusLabel: string;
  /** لطلبات التفصيل: لم تُسلَّم بعد */
  inProgress: boolean;
  isCredit: boolean;
  /** حالة طلب التفصيل (NEW / UNDER_TAILORING / READY_FOR_PICKUP / RECEIVED) */
  statusCode: string | null;
}

export interface CustomerStats {
  invoiceCount: number;
  totalPurchases: number;
  totalPaid: number;
  lastActivity: string | null;
  /** المتبقي على طلبات تفصيل لم تُسلَّم بعد */
  tailoringInProgressRemaining: number;
  /** المتبقي على طلبات تفصيل سُلِّمت وعليها متبقٍ */
  tailoringDueRemaining: number;
}

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const TAILORING_LABELS: Record<string, string> = {
  NEW: "جديد",
  UNDER_TAILORING: "قيد التفصيل",
  READY_FOR_PICKUP: "جاهز للاستلام",
  RECEIVED: "تم التسليم",
};

type OrderRow = {
  id: string;
  customer_id: string;
  order_number: string;
  order_type: "POS" | "TAILORING";
  status: string;
  total_amount: number | string;
  created_at: string;
  completed_at: string | null;
  tailoring_status: string | null;
  tailoring_purpose: string | null;
  tailoring_item_name: string | null;
  is_credit: boolean | null;
  paid_amount: number | string | null;
  remaining_amount: number | string | null;
  payment_status: string;
  credit_closed_reason: string | null;
};

export async function loadCustomerOrders(customerIds: string[]): Promise<CustomerOrder[]> {
  if (customerIds.length === 0) return [];

  const rows = await fetchIn<OrderRow>(customerIds, (chunk, from, to) =>
    supabaseAdmin
      .from("sales_orders")
      .select(
        "id, customer_id, order_number, order_type, status, total_amount, created_at, completed_at, tailoring_status, tailoring_purpose, tailoring_item_name, is_credit, paid_amount, remaining_amount, payment_status, credit_closed_reason",
      )
      .in("customer_id", chunk)
      .order("id")
      .range(from, to),
  );

  const counted = rows.filter((row) =>
    row.order_type === "POS"
      ? row.status === "COMPLETED"
      : row.tailoring_purpose !== "PRODUCTION" && row.tailoring_status !== "CANCELLED",
  );

  const tailoringIds = counted.filter((row) => row.order_type === "TAILORING").map((row) => row.id);

  const [payments, transfersOut, transfersIn, refunds] = await Promise.all([
    fetchIn<{ id: string; sales_order_id: string; amount: number | string }>(
      tailoringIds,
      (chunk, from, to) =>
        supabaseAdmin
          .from("sales_order_payments")
          .select("id, sales_order_id, amount")
          .in("sales_order_id", chunk)
          .order("id")
          .range(from, to),
    ),
    fetchIn<{ id: string; from_order_id: string; amount: number | string }>(tailoringIds, (chunk, from, to) =>
      supabaseAdmin
        .from("tailoring_customer_advance_transfers")
        .select("id, from_order_id, amount")
        .in("from_order_id", chunk)
        .order("id")
        .range(from, to),
    ),
    fetchIn<{ id: string; to_order_id: string; amount: number | string }>(tailoringIds, (chunk, from, to) =>
      supabaseAdmin
        .from("tailoring_customer_advance_transfers")
        .select("id, to_order_id, amount")
        .in("to_order_id", chunk)
        .order("id")
        .range(from, to),
    ),
    fetchIn<{ id: string; sales_order_id: string; amount: number | string }>(tailoringIds, (chunk, from, to) =>
      supabaseAdmin
        .from("tailoring_customer_advance_refunds")
        .select("id, sales_order_id, amount")
        .in("sales_order_id", chunk)
        .order("id")
        .range(from, to),
    ),
  ]);

  const sumBy = <T,>(items: T[], key: (item: T) => string, amount: (item: T) => number) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(key(item), r2((map.get(key(item)) ?? 0) + amount(item)));
    return map;
  };

  const paidMap = sumBy(payments, (p) => p.sales_order_id, (p) => num(p.amount));
  const outMap = sumBy(transfersOut, (t) => t.from_order_id, (t) => num(t.amount));
  const inMap = sumBy(transfersIn, (t) => t.to_order_id, (t) => num(t.amount));
  const refundMap = sumBy(refunds, (r) => r.sales_order_id, (r) => num(r.amount));

  return counted.map((row): CustomerOrder => {
    const total = num(row.total_amount);

    if (row.order_type === "TAILORING") {
      const paid = r2(
        Math.max((paidMap.get(row.id) ?? 0) + (inMap.get(row.id) ?? 0) - (outMap.get(row.id) ?? 0) - (refundMap.get(row.id) ?? 0), 0),
      );
      return {
        id: row.id,
        customerId: row.customer_id,
        orderNumber: row.order_number,
        kind: "TAILORING",
        createdAt: row.created_at,
        completedAt: row.completed_at,
        itemName: row.tailoring_item_name,
        total,
        paid,
        remaining: r2(Math.max(total - paid, 0)),
        statusLabel: TAILORING_LABELS[row.tailoring_status ?? ""] ?? row.tailoring_status ?? "—",
        inProgress: row.tailoring_status !== "RECEIVED",
        isCredit: false,
        statusCode: row.tailoring_status,
      };
    }

    const isCredit = row.is_credit === true;
    const paid = isCredit ? num(row.paid_amount) : total;
    const remaining = isCredit ? num(row.remaining_amount) : 0;

    return {
      id: row.id,
      customerId: row.customer_id,
      orderNumber: row.order_number,
      kind: "POS",
      createdAt: row.created_at,
      completedAt: row.completed_at,
      itemName: null,
      total,
      paid: r2(paid),
      remaining: r2(remaining),
      statusLabel: isCredit
        ? row.credit_closed_reason === "BAD_DEBT"
          ? "معدوم"
          : row.credit_closed_reason === "PAID"
            ? "مدفوعة"
            : "آجلة"
        : "مدفوعة",
      inProgress: false,
      isCredit,
      statusCode: null,
    };
  });
}

export function summarizeOrders(orders: CustomerOrder[]): CustomerStats {
  let totalPurchases = 0;
  let totalPaid = 0;
  let inProgress = 0;
  let due = 0;
  let last: string | null = null;

  for (const order of orders) {
    totalPurchases += order.total;
    totalPaid += order.paid;

    if (order.kind === "TAILORING" && order.remaining > 0) {
      if (order.inProgress) inProgress += order.remaining;
      else due += order.remaining;
    }

    const at = order.completedAt ?? order.createdAt;
    if (!last || at > last) last = at;
  }

  return {
    invoiceCount: orders.length,
    totalPurchases: r2(totalPurchases),
    totalPaid: r2(totalPaid),
    lastActivity: last,
    tailoringInProgressRemaining: r2(inProgress),
    tailoringDueRemaining: r2(due),
  };
}

export interface CustomerPaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
}

/** سجل دفعات العميل (كل فواتيره) من الأحدث للأقدم */
export async function loadCustomerPayments(orders: CustomerOrder[]): Promise<CustomerPaymentRow[]> {
  const numbers = new Map(orders.map((order) => [order.id, order.orderNumber]));

  const rows = await fetchIn<{
    id: string;
    sales_order_id: string;
    amount: number | string;
    payment_date: string;
    payment_method: string;
    notes: string | null;
  }>([...numbers.keys()], (chunk, from, to) =>
    supabaseAdmin
      .from("sales_order_payments")
      .select("id, sales_order_id, amount, payment_date, payment_method, notes")
      .in("sales_order_id", chunk)
      .order("id")
      .range(from, to),
  );

  return rows
    .map((row) => ({
      id: row.id,
      orderId: row.sales_order_id,
      orderNumber: numbers.get(row.sales_order_id) ?? "",
      amount: num(row.amount),
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      notes: row.notes,
    }))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

/**
 * ذمم العميل من قاعدة البيانات نفسها التي تقرأ منها صفحة الذمم (get_unified_receivables):
 * المتبقي وإمكانية التحصيل لا يُحسبان في مكان ثانٍ.
 */
export interface CustomerReceivable {
  kind: "POS_CREDIT" | "TAILORING_IN_PROGRESS";
  orderId: string;
  paid: number;
  remaining: number;
  canCollect: boolean;
  isOverdue: boolean;
  dueDate: string | null;
}

export async function loadCustomerReceivables(customerId: string): Promise<CustomerReceivable[]> {
  const { data, error } = await supabaseAdmin.rpc("get_unified_receivables", { p_customer_id: customerId });
  if (error) throw new Error(`تعذر جلب ذمم العميل: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    kind: row.kind as CustomerReceivable["kind"],
    orderId: String(row.order_id),
    paid: r2(num(row.paid_amount)),
    remaining: r2(num(row.remaining_sdg)),
    canCollect: row.can_collect === true,
    isOverdue: row.is_overdue === true,
    dueDate: (row.due_date as string | null) ?? null,
  }));
}

import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll } from "@/lib/supabase-fetch-all";

/**
 * ملخص الذمم للمالك والمدير (نظرة المحاسبة، التقارير، لوحة التحكم).
 * • المفتوح والمتأخر لقطة حالية (get_receivables_summary).
 * • الديون المعدومة للفترة المطلوبة فقط (من سجل credit_adjustments).
 */
export interface ReceivablesSnapshot {
  openCount: number;
  overdueCount: number;
  totalRemainingSdg: number;
  totalUsdAtSale: number;
  totalUsdNow: number;
  totalLossUsd: number;
  deferredCogsUsd: number;
  badDebtCount: number;
  badDebtSdg: number;
  badDebtCostUsd: number;
}

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function loadReceivablesSnapshot(range?: {
  startIso: string;
  endIso: string;
}): Promise<ReceivablesSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("get_receivables_summary");
  if (error) throw new Error(`تعذر جلب ملخص الذمم: ${error.message}`);

  const summary = (data ?? {}) as Record<string, unknown>;

  let badDebtCount = 0;
  let badDebtSdg = 0;
  let badDebtCostUsd = 0;

  if (range) {
    const [adjustments, expenses] = await Promise.all([
      fetchAll<{ id: string; old_remaining: number | string }>((from, to) =>
        supabaseAdmin
          .from("credit_adjustments")
          .select("id, old_remaining")
          .eq("adjustment_type", "BAD_DEBT")
          .gte("created_at", range.startIso)
          .lt("created_at", range.endIso)
          .order("id")
          .range(from, to),
      ),
      fetchAll<{ id: string; amount_usd: number | string }>((from, to) =>
        supabaseAdmin
          .from("journal_entries")
          .select("id, amount_usd")
          .eq("debit_account", "OTHER_EXPENSE")
          .eq("credit_account", "DEFERRED_COGS")
          .gte("created_at", range.startIso)
          .lt("created_at", range.endIso)
          .order("id")
          .range(from, to),
      ),
    ]);

    badDebtCount = adjustments.length;
    badDebtSdg = adjustments.reduce((sum, row) => sum + num(row.old_remaining), 0);
    badDebtCostUsd = expenses.reduce((sum, row) => sum + num(row.amount_usd), 0);
  }

  return {
    openCount: num(summary.invoices_count),
    overdueCount: num(summary.overdue_count),
    totalRemainingSdg: r2(num(summary.total_remaining_sdg)),
    totalUsdAtSale: r2(num(summary.total_usd_at_sale)),
    totalUsdNow: r2(num(summary.total_usd_now)),
    totalLossUsd: r2(num(summary.total_loss_usd)),
    deferredCogsUsd: r2(num(summary.deferred_cogs_usd)),
    badDebtCount,
    badDebtSdg: r2(badDebtSdg),
    badDebtCostUsd: r2(badDebtCostUsd),
  };
}

/**
 * المتبقي بعد دفعة معيّنة: نعيد تشغيل أحداث الفاتورة بالترتيب الزمني
 * (دفعة تنقص المتبقي، وتعديل يضبطه، ودين معدوم يصفّره).
 */
export function remainingAfterPayment(params: {
  totalAmount: number;
  payments: { id: string; amount: number; at: string }[];
  adjustments: { type: "ADJUST" | "BAD_DEBT"; newRemaining: number; at: string }[];
  paymentId: string;
}): number {
  type Event =
    | { kind: "payment"; id: string; amount: number; at: number }
    | { kind: "adjust"; newRemaining: number; at: number };

  const events: Event[] = [
    ...params.payments.map((p): Event => ({ kind: "payment", id: p.id, amount: p.amount, at: new Date(p.at).getTime() })),
    ...params.adjustments.map((a): Event => ({ kind: "adjust", newRemaining: a.newRemaining, at: new Date(a.at).getTime() })),
  ].sort((a, b) => a.at - b.at);

  let remaining = params.totalAmount;
  for (const event of events) {
    if (event.kind === "payment") {
      remaining = Math.max(0, r2(remaining - event.amount));
      if (event.id === params.paymentId) return remaining;
    } else {
      remaining = event.newRemaining;
    }
  }
  return remaining;
}

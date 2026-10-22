import "server-only";

import type { TokenPayload } from "@/lib/auth";
import { formatMoney, formatRate, type CurrencyCode } from "@/lib/currency";
import { normalizeRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * رقابة المالك: كل عملية مالية أو مخزنية ينفذها الكاشير تُنشئ إشعارًا للمالك فقط
 * (target_roles = ['owner']) فيه المبلغ واسم الكاشير. لا يحدث شيء لو المنفذ مالك أو مدير.
 * فشل الإشعار لا يوقف العملية (تمت بالفعل في قاعدة البيانات)، ويُسجَّل في اللوج فقط.
 */

export type CashierAuditKind =
  | "INVENTORY_ADJUSTMENT"
  | "EXPENSE"
  | "ASSET"
  | "EXCHANGE_RATE"
  | "PURCHASE_RECEIPT"
  | "SUPPLIER_PAYMENT";

export function money(amount: number, currency: CurrencyCode = "USD") {
  return formatMoney(amount, currency);
}

export function rateChange(oldRate: number | null, newRate: number) {
  return `${oldRate == null ? "—" : formatRate(oldRate)} ← ${formatRate(newRate)}`;
}

export async function notifyOwnerOfCashierAction(params: {
  actor: Pick<TokenPayload, "userId" | "name" | "role">;
  kind: CashierAuditKind;
  title: string;
  /** نص العملية بدون اسم الكاشير (يُضاف تلقائيًا في البداية) */
  details: string;
  link?: string | null;
  amount?: number | null;
  currency?: CurrencyCode;
  metadata?: Record<string, unknown>;
}) {
  if (normalizeRole(params.actor.role) !== "cashier") return;

  try {
    const { error } = await supabaseAdmin.from("notifications").insert({
      title: params.title,
      message: `الكاشير ${params.actor.name}: ${params.details}`,
      type: "CASHIER_ACTION",
      link: params.link ?? null,
      target_roles: ["owner"],
      metadata: {
        ...(params.metadata ?? {}),
        kind: params.kind,
        actor_id: params.actor.userId,
        actor_name: params.actor.name,
        amount: params.amount ?? null,
        currency: params.currency ?? null,
      },
    });

    if (error) console.error("Failed to notify owner of cashier action:", error);
  } catch (error) {
    console.error("Failed to notify owner of cashier action:", error);
  }
}

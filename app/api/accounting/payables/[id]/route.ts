/**
 * GET /api/accounting/payables/[id] — مستحق واحد مع سجل دفعاته وروابط الأصل والقيود
 */

import { NextRequest, NextResponse } from "next/server";

import { apiError, isUuid } from "@/lib/api-response";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

type NamedRelation = { name?: string | null } | { name?: string | null }[] | null;

const nameOf = (relation: NamedRelation) => (Array.isArray(relation) ? relation[0]?.name : relation?.name) ?? null;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("payables.manage", "عذراً، المستحقات على المحل غير متاحة لصلاحياتك.");
  if (!guard.ok) return guard.response;
  // روابط القيود والأصول لمن يملك صلاحية المحاسبة فقط (الكاشير لا يفتح سجل القيود)
  const canLinkEntries = can(guard.session.role, "accounting.view");

  const { id } = await params;
  if (!isUuid(id)) return apiError(400, "VALIDATION_ERROR", "معرف المستحق غير صالح.");

  try {
    const { data: payable, error } = await supabaseAdmin
      .from("payables")
      .select(
        "id, source_type, source_id, expense_account, description, currency, total_amount, owner_paid, paid_amount, remaining_amount, due_date, status, recognition_entry_id, fx_entry_id, created_at, creator:users!created_by ( name )",
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (error) throw error;
    if (!payable) return apiError(404, "NOT_FOUND", "المستحق غير موجود.");

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("payable_payments")
      .select("id, amount, amount_usd, exchange_rate_used, method, journal_entry_id, notes, created_at, creator:users!created_by ( name )")
      .eq("payable_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (paymentsError) throw paymentsError;

    // أرقام القيود للروابط (لمن يملك صلاحية المحاسبة فقط)
    const entryIds = canLinkEntries
      ? [
          payable.recognition_entry_id,
          payable.fx_entry_id,
          ...(payments ?? []).map((row) => row.journal_entry_id),
        ].filter((value): value is string => Boolean(value))
      : [];

    const entryNumbers = new Map<string, string>();
    if (entryIds.length > 0) {
      const { data: entries, error: entriesError } = await supabaseAdmin
        .from("journal_entries")
        .select("id, entry_number")
        .in("id", entryIds);

      if (entriesError) throw entriesError;
      for (const entry of entries ?? []) entryNumbers.set(entry.id as string, entry.entry_number as string);
    }

    return NextResponse.json({
      data: {
        id: payable.id,
        sourceType: payable.source_type,
        sourceId: canLinkEntries ? payable.source_id : null,
        expenseAccount: payable.expense_account,
        description: payable.description,
        currency: payable.currency,
        totalAmount: Number(payable.total_amount),
        ownerPaid: Number(payable.owner_paid),
        paidAmount: Number(payable.paid_amount),
        remainingAmount: Number(payable.remaining_amount),
        dueDate: payable.due_date,
        status: payable.status,
        recognitionEntryId: canLinkEntries ? payable.recognition_entry_id : null,
        recognitionEntryNumber: entryNumbers.get(payable.recognition_entry_id as string) ?? null,
        fxEntryId: canLinkEntries ? payable.fx_entry_id : null,
        fxEntryNumber: entryNumbers.get(payable.fx_entry_id as string) ?? null,
        createdAt: payable.created_at,
        createdByName: nameOf(payable.creator as NamedRelation),
        payments: (payments ?? []).map((row) => ({
          id: row.id,
          amount: Number(row.amount),
          amountUsd: row.amount_usd != null ? Number(row.amount_usd) : null,
          exchangeRate: row.exchange_rate_used != null ? Number(row.exchange_rate_used) : null,
          method: row.method,
          journalEntryId: canLinkEntries ? row.journal_entry_id : null,
          journalEntryNumber: entryNumbers.get(row.journal_entry_id as string) ?? null,
          notes: row.notes,
          createdAt: row.created_at,
          createdByName: nameOf(row.creator as NamedRelation),
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/accounting/payables/[id]:", error);
    return apiError(500, "INTERNAL_ERROR", "تعذر جلب المستحق.");
  }
}

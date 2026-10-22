/**
 * GET /api/accounting/expenses — مصروفات المستخدم الحالي فقط (قيود EXPENSE اليدوية)
 *
 * الكاشير يسجّل مصروفًا بدون صلاحية على سجل القيود الكامل، فهذا الـ route يعرض له
 * مصروفاته هو فقط (created_by = المستخدم) بدون أرصدة ولا حسابات أخرى.
 */

import { NextResponse } from "next/server";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

const EXPENSE_ACCOUNTS = ["UTILITIES", "RENTS", "MAINTENANCE", "OTHER_EXPENSE"];
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const guard = await requirePermission("expenses.record");
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), MAX_LIMIT);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await supabaseAdmin
      .from("journal_entries")
      .select(
        "id, entry_number, amount, currency, amount_usd, description, reference, debit_account, credit_account, created_at",
        { count: "exact" },
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("entry_type", "EXPENSE")
      .eq("created_by", guard.session.userId)
      .eq("is_correction_reversal", false)
      .in("debit_account", EXPENSE_ACCOUNTS)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Expenses GET:", error);
      return NextResponse.json({ message: "حدث خطأ أثناء جلب المصروفات" }, { status: 500 });
    }

    return NextResponse.json({
      data: (data ?? []).map((row) => ({
        id: row.id,
        entryNumber: row.entry_number,
        amount: Number(row.amount),
        currency: row.currency,
        amountUsd: Number(row.amount_usd),
        description: row.description,
        reference: row.reference,
        expenseAccount: row.debit_account,
        paymentMethod: row.credit_account === "BANK" ? "BANK" : "CASH",
        createdAt: row.created_at,
      })),
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("Expenses GET unexpected:", error);
    return NextResponse.json({ message: "خطأ غير متوقع في السيرفر" }, { status: 500 });
  }
}

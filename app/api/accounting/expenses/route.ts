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

const EXPENSE_ACCOUNTS = ["STAFF_DAILY_EXPENSES", "UTILITIES", "RENTS", "MAINTENANCE", "OTHER_EXPENSE"];
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

    // المستحق المرتبط بكل قيد "مستحق على المحل" (الدفع المجزأ)
    const payableEntryIds = (data ?? [])
      .filter((row) => row.credit_account === "OTHER_PAYABLES")
      .map((row) => row.id as string);

    const { data: payableRows, error: payablesError } = payableEntryIds.length
      ? await supabaseAdmin
          .from("payables")
          .select("id, recognition_entry_id, total_amount, owner_paid, paid_amount, remaining_amount, due_date, status")
          .in("recognition_entry_id", payableEntryIds)
      : { data: [], error: null };

    if (payablesError) {
      console.error("Expenses payables:", payablesError);
      return NextResponse.json({ message: "حدث خطأ أثناء جلب المصروفات" }, { status: 500 });
    }

    const payableByEntry = new Map((payableRows ?? []).map((row) => [row.recognition_entry_id as string, row]));

    return NextResponse.json({
      data: (data ?? []).map((row) => {
        const payable = payableByEntry.get(row.id as string);
        return {
        id: row.id,
        entryNumber: row.entry_number,
        amount: Number(row.amount),
        currency: row.currency,
        amountUsd: Number(row.amount_usd),
        description: row.description,
        reference: row.reference,
        expenseAccount: row.debit_account,
        paymentMethod: row.credit_account === "BANK" ? "BANK" : "CASH",
        // مصدر الدفع: خزينة / بنك / رأس مال (دفعه المالك) / مستحق على المحل
        source:
          row.credit_account === "BANK"
            ? "BANK"
            : row.credit_account === "CAPITAL"
              ? "CAPITAL"
              : row.credit_account === "OTHER_PAYABLES"
                ? "PAYABLE"
                : "CASH",
        payable: payable
          ? {
              id: payable.id,
              totalAmount: Number(payable.total_amount),
              ownerPaid: Number(payable.owner_paid),
              paidAmount: Number(payable.paid_amount),
              remainingAmount: Number(payable.remaining_amount),
              dueDate: payable.due_date,
              status: payable.status,
            }
          : null,
        createdAt: row.created_at,
        };
      }),
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

/**
 * GET /api/accounting/payables — المستحقات على المحل (متبقي الأصول والمصروفات)
 *
 * • من يسجّل الأصول والمصروفات (payables.manage: المالك والمدير والكاشير).
 * • status: OPEN (الافتراضي) | PAID | ALL — type: ASSET | EXPENSE — بحث بالوصف — overdue — صفحات.
 * • الملخص (get_payables_summary) يتبع الأرصدة الحالية لكل المستحقات المفتوحة.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, dbErrorResponse } from "@/lib/api-response";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["OPEN", "PAID", "ALL"]).default("OPEN"),
  type: z.enum(["ASSET", "EXPENSE", "ALL"]).default("ALL"),
  search: z.string().trim().max(100).optional(),
  overdue: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  const guard = await requirePermission("payables.manage", "عذراً، المستحقات على المحل غير متاحة لصلاحياتك.");
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const validation = querySchema.safeParse({
    page: params.get("page") || undefined,
    limit: params.get("limit") || undefined,
    status: params.get("status") || undefined,
    type: params.get("type") || undefined,
    search: params.get("search") || undefined,
    overdue: params.get("overdue") || undefined,
  });

  if (!validation.success) {
    return apiError(422, "VALIDATION_ERROR", "معاملات الطلب غير صحيحة.", {
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { page, limit, status, type, search, overdue } = validation.data;
  const from = (page - 1) * limit;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum" }).format(new Date());

  try {
    let query = supabaseAdmin
      .from("payables")
      .select(
        "id, source_type, source_id, expense_account, description, currency, total_amount, owner_paid, paid_amount, remaining_amount, due_date, status, recognition_entry_id, created_at, creator:users!created_by ( name )",
        { count: "exact" },
      )
      .eq("branch_id", MAIN_BRANCH_ID);

    if (status !== "ALL") query = query.eq("status", status);
    if (type !== "ALL") query = query.eq("source_type", type);
    if (overdue === "true") query = query.eq("status", "OPEN").lt("due_date", today);

    const term = sanitizeSearchTerm(search ?? null);
    if (term) query = query.ilike("description", `%${term}%`);

    const [list, summary] = await Promise.all([
      query
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1),
      supabaseAdmin.rpc("get_payables_summary"),
    ]);

    if (list.error) return dbErrorResponse(list.error, "payables list", "تعذر جلب المستحقات.");
    if (summary.error) return dbErrorResponse(summary.error, "get_payables_summary", "تعذر جلب ملخص المستحقات.");

    const rows = (list.data ?? []).map((row) => {
      const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
      return {
        id: row.id,
        sourceType: row.source_type as "ASSET" | "EXPENSE",
        sourceId: row.source_id as string | null,
        expenseAccount: row.expense_account as string | null,
        description: row.description as string,
        currency: row.currency as "USD" | "SDG",
        totalAmount: Number(row.total_amount),
        ownerPaid: Number(row.owner_paid),
        paidAmount: Number(row.paid_amount),
        remainingAmount: Number(row.remaining_amount),
        dueDate: row.due_date as string | null,
        status: row.status as "OPEN" | "PAID",
        recognitionEntryId: row.recognition_entry_id as string | null,
        createdAt: row.created_at as string,
        createdByName: (creator as { name?: string } | null)?.name ?? null,
        isOverdue: row.status === "OPEN" && !!row.due_date && String(row.due_date) < today,
      };
    });

    const total = list.count ?? 0;

    return NextResponse.json({
      data: rows,
      meta: { total, page, limit, totalPages: total ? Math.ceil(total / limit) : 0 },
      summary: summary.data,
    });
  } catch (error: unknown) {
    console.error("GET /api/accounting/payables:", error);
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء جلب المستحقات.");
  }
}

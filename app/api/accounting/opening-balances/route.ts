/**
 * /api/accounting/opening-balances — الأرصدة الافتتاحية (للمالك فقط)
 *
 * GET  → ما تم تسجيله (النقدية، الأصول، ديون الموردين، المخزون الافتتاحي، تاريخ الافتتاح)
 * POST → { dryRun: true }  معاينة القيود من غير أي حفظ
 *        { dryRun: false } التسجيل الفعلي (ذرّي + منع التكرار بـ Idempotency-Key)
 *
 * كل المنطق في record_opening_balances / get_opening_balances_status
 * (database/migrations/20261010_05_opening_balances.sql).
 */

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { requirePermission } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";
import { runIdempotentRpc } from "@/lib/idempotency";
import { dbErrorResponse, invalidJsonResponse, readJson } from "@/lib/api-response";
import { openingBalancesSchema } from "@/app/dashboard/accounting/schemas/opening-balances.schema";

const FORBIDDEN = "الأرصدة الافتتاحية متاحة للمالك فقط.";

type Raw = Record<string, unknown>;

const num = (value: unknown) => (value === null || value === undefined || value === "" ? 0 : Number(value));
const list = (value: unknown) => (Array.isArray(value) ? (value as Raw[]) : []);

function mapEntries(value: unknown) {
  return list(value).map((entry) => ({
    kind: entry.kind,
    label: entry.label,
    debit: entry.debit,
    credit: entry.credit,
    currency: entry.currency,
    amount: num(entry.amount),
    amountUsd: num(entry.amount_usd),
  }));
}

export async function GET() {
  const guard = await requirePermission("accounting.openingBalances", FORBIDDEN);
  if (!guard.ok) return guard.response;

  const { data, error } = await supabaseAdmin.rpc("get_opening_balances_status", {
    p_branch_id: MAIN_BRANCH_ID,
  });

  if (error) return dbErrorResponse(error, "get_opening_balances_status", "تعذر جلب الأرصدة الافتتاحية.");

  const raw = (data ?? {}) as Raw;
  const stock = (raw.opening_stock ?? {}) as Raw;

  return NextResponse.json({
    data: {
      asOf: raw.as_of ?? null,
      today: raw.today,
      currentRate: raw.current_rate === null || raw.current_rate === undefined ? null : Number(raw.current_rate),
      cash: list(raw.cash).map((row) => ({
        account: row.account,
        currency: row.currency,
        amount: num(row.amount),
        amountUsd: num(row.amount_usd),
      })),
      assets: list(raw.assets).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        currency: row.currency,
        value: num(row.value),
        valueUsd: num(row.value_usd),
        purchaseDate: row.purchase_date,
      })),
      supplierDebts: list(raw.supplier_debts).map((row) => ({
        orderId: row.order_id,
        orderNumber: row.order_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name ?? "—",
        amount: num(row.amount),
        paid: num(row.paid),
      })),
      openingStock: { entries: num(stock.entries), totalUsd: num(stock.total_usd) },
      manualCapitalUsd: num(raw.manual_capital_usd),
      firstOperationAt: raw.first_operation_at ?? null,
    },
  });
}

export async function POST(request: Request) {
  const guard = await requirePermission("accounting.openingBalances", FORBIDDEN);
  if (!guard.ok) return guard.response;
  const user = guard.session;

  const body = await readJson(request);
  if (body === null) return invalidJsonResponse();

  const validation = openingBalancesSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات الأرصدة الافتتاحية غير صالحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const input = validation.data;
  const rpc = (dryRun: boolean) =>
    supabaseAdmin.rpc("record_opening_balances", {
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_as_of: input.asOf,
      p_cash: input.cash,
      p_assets: input.assets.map((asset) => ({ ...asset, purchaseDate: asset.purchaseDate ?? null })),
      p_supplier_debts: input.supplierDebts.map((debt) => ({ ...debt, reference: debt.reference ?? null })),
      p_notes: input.notes ?? null,
      p_dry_run: dryRun,
    });

  const toBody = (data: unknown, message: string) => {
    const raw = (data ?? {}) as Raw;
    return {
      message,
      data: {
        dryRun: Boolean(raw.dry_run),
        asOf: raw.as_of,
        exchangeRate: raw.exchange_rate === null || raw.exchange_rate === undefined ? null : Number(raw.exchange_rate),
        entries: mapEntries(raw.entries),
        capitalChangeUsd: num(raw.capital_change_usd),
      },
    };
  };

  // المعاينة لا تكتب شيئًا → لا تحتاج منع تكرار
  if (input.dryRun) {
    const { data, error } = await rpc(true);
    if (error) return dbErrorResponse(error, "record_opening_balances (preview)", "تعذر معاينة الأرصدة الافتتاحية.");
    return NextResponse.json(toBody(data, "معاينة القيود — لم يُحفظ شيء بعد."));
  }

  return runIdempotentRpc<unknown>({
    request,
    scope: "accounting.openingBalances",
    userId: user.userId,
    payload: input,
    context: "record_opening_balances",
    fallbackMessage: "تعذر تسجيل الأرصدة الافتتاحية.",
    rpc: () => rpc(false),
    onSuccess: (data) => {
      for (const tag of ["accounting-assets", "accounting-entries", "accounting-summary", "accounting-overview", "purchases-list", "suppliers-list"]) {
        revalidateTag(tag, "default");
      }
      revalidatePath("/dashboard/accounting");
      revalidatePath("/dashboard/accounting/assets");
      revalidatePath("/dashboard/accounting/opening-balances");
      revalidatePath("/dashboard/orders");
      return { status: 201, body: toBody(data, "تم تسجيل الأرصدة الافتتاحية بنجاح.") };
    },
  });
}

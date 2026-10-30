/**
 * GET /api/accounting/entries/[id] — تفاصيل قيد محاسبي كاملة (عرض فقط)
 *
 * يرجع القيد بحساباته وعملته وسعر صرفه ومن سجّله، والمستند المرتبط به (فاتورة، أمر شراء،
 * أصل، طلب تفصيل، دفعة موظف...) مع رابط صفحته، وباقي القيود المرتبطة (نفس المستند أو نفس المرجع).
 * الصلاحية: نفس صلاحية عرض القيود (accounting.view). لا يكتب أي شيء.
 */

import { NextResponse } from "next/server";

import { isUuid } from "@/lib/api-response";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { requireLogin } from "@/lib/permissions-server";
import { supabaseAdmin } from "@/lib/supabase";

import { ACCOUNT_LABELS } from "../../_lib/accounting";

const ENTRY_COLUMNS = `
  id, entry_number, entry_type, amount, currency, exchange_rate_used, amount_usd,
  description, reference, debit_account, credit_account, created_at, created_by,
  sales_order_id, purchase_order_id, correction_of_id, is_correction_reversal
`;

const RELATED_LIMIT = 50;

type EntryRow = {
  id: string;
  entry_number: string;
  entry_type: string;
  amount: number | string;
  currency: string;
  exchange_rate_used: number | string | null;
  amount_usd: number | string | null;
  description: string | null;
  reference: string | null;
  debit_account: string;
  credit_account: string;
  created_at: string;
  created_by: string | null;
  sales_order_id: string | null;
  purchase_order_id: string | null;
  correction_of_id: string | null;
  is_correction_reversal: boolean | null;
};

interface LinkedDocument {
  kind:
    | "SALES_ORDER"
    | "TAILORING_ORDER"
    | "PURCHASE_ORDER"
    | "ASSET"
    | "EMPLOYEE_PAYMENT"
    | "TAILOR_PAYMENT"
    | "ADVANCE_REFUND";
  title: string;
  number: string | null;
  summary: string;
  href: string | null;
}

const label = (account: string) =>
  (ACCOUNT_LABELS as Record<string, string>)[account] ?? account;

const money = (value: unknown, currency: string) =>
  `${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency === "SDG" ? "ج.س" : "$"}`;

const ORDER_STATUS: Record<string, string> = {
  PENDING: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
  RETURNED: "مرتجعة",
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  RECEIVED: "مستلم",
};

const TAILORING_STATUS: Record<string, string> = {
  NEW: "جديد",
  UNDER_TAILORING: "قيد التفصيل",
  READY_FOR_PICKUP: "جاهز للاستلام",
  RECEIVED: "تم التسليم",
  CANCELLED: "ملغي",
};

function mapEntry(row: EntryRow, userNames: Map<string, string>) {
  return {
    id: row.id,
    entryNumber: row.entry_number,
    entryType: row.entry_type,
    description: row.description,
    reference: row.reference,
    createdAt: row.created_at,
    debitAccount: row.debit_account,
    debitLabel: label(row.debit_account),
    creditAccount: row.credit_account,
    creditLabel: label(row.credit_account),
    amount: Number(row.amount),
    currency: row.currency,
    exchangeRateUsed: row.exchange_rate_used != null ? Number(row.exchange_rate_used) : null,
    amountUsd: row.amount_usd != null ? Number(row.amount_usd) : null,
    createdById: row.created_by,
    createdByName: row.created_by ? (userNames.get(row.created_by) ?? null) : null,
    correctionOfId: row.correction_of_id,
    isCorrectionReversal: row.is_correction_reversal === true,
  };
}

/** استعلام اختياري: أي خطأ (جدول غير موجود في بيئة قديمة مثلًا) يعني "لا مستند" وليس فشل الطلب */
async function safe<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    return error ? null : data;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "accounting.view")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json({ message: "معرف القيد غير صالح" }, { status: 400 });
    }

    const { data: entry, error } = await supabaseAdmin
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (error) {
      console.error("Accounting entry detail:", error);
      return NextResponse.json({ message: "تعذر جلب تفاصيل القيد" }, { status: 500 });
    }

    if (!entry) {
      return NextResponse.json({ message: "القيد غير موجود" }, { status: 404 });
    }

    const row = entry as unknown as EntryRow;

    /* ---------------- الوثائق المرتبطة ---------------- */

    // الربط المباشر من القيد، ثم الجداول التي تشير إلى القيد (دفعات، أوامر...)
    const [paymentLinks, employeeLinks, tailorLinks, refundLinks, purchaseLinks, salesLinks] = await Promise.all([
      safe(() => supabaseAdmin.from("sales_order_payments").select("sales_order_id").eq("journal_entry_id", id)),
      safe(() =>
        supabaseAdmin
          .from("employee_payments")
          .select("type, period, amount, payment_method, user:users!user_id ( name )")
          .eq("journal_entry_id", id),
      ),
      safe(() =>
        supabaseAdmin
          .from("tailor_commission_payments")
          .select("sales_order_id, amount, tailor:users!tailor_id ( name )")
          .eq("journal_entry_id", id),
      ),
      safe(() => supabaseAdmin.from("tailoring_customer_advance_refunds").select("sales_order_id, amount").eq("journal_entry_id", id)),
      safe(() => supabaseAdmin.from("purchase_orders").select("id").eq("journal_entry_id", id)),
      safe(() =>
        supabaseAdmin
          .from("sales_orders")
          .select("id")
          .or(
            [
              "sales_journal_entry_id",
              "cogs_journal_entry_id",
              "tailoring_cogs_journal_entry_id",
              "production_material_journal_entry_id",
              "production_labor_journal_entry_id",
              "production_inventory_journal_entry_id",
              "tailoring_material_journal_entry_id",
              "tailoring_labor_journal_entry_id",
              "customer_advance_journal_entry_id",
              "customer_advance_recognition_journal_entry_id",
            ]
              .map((column) => `${column}.eq.${id}`)
              .join(","),
          ),
      ),
    ]);

    const salesOrderIds = new Set<string>();
    if (row.sales_order_id) salesOrderIds.add(row.sales_order_id);
    for (const link of (paymentLinks ?? []) as { sales_order_id: string | null }[]) {
      if (link.sales_order_id) salesOrderIds.add(link.sales_order_id);
    }
    for (const link of (tailorLinks ?? []) as { sales_order_id: string | null }[]) {
      if (link.sales_order_id) salesOrderIds.add(link.sales_order_id);
    }
    for (const link of (refundLinks ?? []) as { sales_order_id: string | null }[]) {
      if (link.sales_order_id) salesOrderIds.add(link.sales_order_id);
    }
    for (const link of (salesLinks ?? []) as { id: string }[]) salesOrderIds.add(link.id);

    const purchaseOrderIds = new Set<string>();
    if (row.purchase_order_id) purchaseOrderIds.add(row.purchase_order_id);
    for (const link of (purchaseLinks ?? []) as { id: string }[]) purchaseOrderIds.add(link.id);

    const [salesOrders, purchaseOrders, assets] = await Promise.all([
      salesOrderIds.size
        ? safe(() =>
            supabaseAdmin
              .from("sales_orders")
              .select(
                "id, order_number, order_type, status, total_amount, tailoring_status, tailoring_purpose, tailoring_item_name, is_credit",
              )
              .in("id", [...salesOrderIds]),
          )
        : Promise.resolve(null),
      purchaseOrderIds.size
        ? safe(() =>
            supabaseAdmin
              .from("purchase_orders")
              .select("id, order_number, status, total_amount, supplier:suppliers ( name )")
              .in("id", [...purchaseOrderIds]),
          )
        : Promise.resolve(null),
      // لا يوجد عمود ربط للأصل في القيود: الأصل والقيد يُنشآن في نفس المعاملة (نفس created_at) والبيان "شراء أصل: الاسم"
      row.entry_type === "ASSET"
        ? safe(() =>
            supabaseAdmin
              .from("assets")
              .select("id, name, category, purchase_value, currency, purchase_date, created_at")
              .eq("branch_id", MAIN_BRANCH_ID)
              .eq("created_at", row.created_at),
          )
        : Promise.resolve(null),
    ]);

    const documents: LinkedDocument[] = [];

    for (const order of (salesOrders ?? []) as {
      id: string;
      order_number: string;
      order_type: string;
      status: string;
      total_amount: number | string;
      tailoring_status: string | null;
      tailoring_purpose: string | null;
      tailoring_item_name: string | null;
      is_credit: boolean | null;
    }[]) {
      if (order.order_type === "TAILORING") {
        documents.push({
          kind: "TAILORING_ORDER",
          title: order.tailoring_purpose === "PRODUCTION" ? "طلب تصنيع للمخزون" : "طلب تفصيل",
          number: order.order_number,
          summary: [
            order.tailoring_item_name,
            order.tailoring_status ? TAILORING_STATUS[order.tailoring_status] ?? order.tailoring_status : null,
            money(order.total_amount, "SDG"),
          ]
            .filter(Boolean)
            .join(" — "),
          href: `/dashboard/tailoring/${order.id}`,
        });
      } else {
        documents.push({
          kind: "SALES_ORDER",
          title: order.is_credit ? "فاتورة بيع بالتقسيط" : "فاتورة بيع",
          number: order.order_number,
          summary: `${ORDER_STATUS[order.status] ?? order.status} — ${money(order.total_amount, "SDG")}`,
          href: `/dashboard/sales/${order.id}`,
        });
      }
    }

    for (const order of (purchaseOrders ?? []) as {
      id: string;
      order_number: string;
      status: string;
      total_amount: number | string;
      supplier: { name?: string | null } | { name?: string | null }[] | null;
    }[]) {
      const supplier = Array.isArray(order.supplier) ? order.supplier[0] : order.supplier;
      documents.push({
        kind: "PURCHASE_ORDER",
        title: "أمر شراء",
        number: order.order_number,
        summary: [supplier?.name, ORDER_STATUS[order.status] ?? order.status, money(order.total_amount, "USD")]
          .filter(Boolean)
          .join(" — "),
        href: `/dashboard/orders/${order.id}`,
      });
    }

    const assetName = (row.description ?? "").replace(/^شراء أصل:\s*/, "").trim();
    const matchedAssets = ((assets ?? []) as {
      id: string;
      name: string;
      category: string;
      purchase_value: number | string;
      currency: string;
      purchase_date: string;
    }[]).filter((asset) => !assetName || asset.name === assetName);

    for (const asset of matchedAssets) {
      documents.push({
        kind: "ASSET",
        title: "أصل",
        number: null,
        summary: `${asset.name} — ${money(asset.purchase_value, asset.currency)} — ${asset.purchase_date}`,
        href: "/dashboard/accounting/assets",
      });
    }

    for (const payment of (employeeLinks ?? []) as {
      type: string;
      period: string;
      amount: number | string;
      user: { name?: string | null } | { name?: string | null }[] | null;
    }[]) {
      const employee = Array.isArray(payment.user) ? payment.user[0] : payment.user;
      documents.push({
        kind: "EMPLOYEE_PAYMENT",
        title: payment.type === "SALARY" ? "راتب موظف" : "سلفة موظف",
        number: null,
        summary: `${employee?.name ?? "موظف"} — ${payment.period.slice(0, 7)} — ${money(payment.amount, "SDG")}`,
        href: "/dashboard/employees/payroll",
      });
    }

    for (const payment of (tailorLinks ?? []) as {
      amount: number | string;
      tailor: { name?: string | null } | { name?: string | null }[] | null;
    }[]) {
      const tailor = Array.isArray(payment.tailor) ? payment.tailor[0] : payment.tailor;
      documents.push({
        kind: "TAILOR_PAYMENT",
        title: "دفعة خياط",
        number: null,
        summary: `${tailor?.name ?? "خياط"} — ${money(payment.amount, "SDG")}`,
        href: null,
      });
    }

    for (const refund of (refundLinks ?? []) as { amount: number | string }[]) {
      documents.push({
        kind: "ADVANCE_REFUND",
        title: "استرداد عربون",
        number: null,
        summary: money(refund.amount, "SDG"),
        href: null,
      });
    }

    /* ---------------- القيود المرتبطة ---------------- */

    const reference = row.reference?.trim() || null;

    const related = await Promise.all([
      row.sales_order_id
        ? safe(() =>
            supabaseAdmin
              .from("journal_entries")
              .select(ENTRY_COLUMNS)
              .eq("branch_id", MAIN_BRANCH_ID)
              .eq("sales_order_id", row.sales_order_id as string)
              .neq("id", id)
              .limit(RELATED_LIMIT),
          )
        : Promise.resolve(null),
      row.purchase_order_id
        ? safe(() =>
            supabaseAdmin
              .from("journal_entries")
              .select(ENTRY_COLUMNS)
              .eq("branch_id", MAIN_BRANCH_ID)
              .eq("purchase_order_id", row.purchase_order_id as string)
              .neq("id", id)
              .limit(RELATED_LIMIT),
          )
        : Promise.resolve(null),
      reference
        ? safe(() =>
            supabaseAdmin
              .from("journal_entries")
              .select(ENTRY_COLUMNS)
              .eq("branch_id", MAIN_BRANCH_ID)
              .eq("reference", reference)
              .neq("id", id)
              .limit(RELATED_LIMIT),
          )
        : Promise.resolve(null),
      // سلسلة التصحيح: القيد الذي صُحِّح، أو القيود التي صحّحته
      safe(() =>
        supabaseAdmin
          .from("journal_entries")
          .select(ENTRY_COLUMNS)
          .eq("branch_id", MAIN_BRANCH_ID)
          .or(
            row.correction_of_id
              ? `id.eq.${row.correction_of_id},correction_of_id.eq.${row.correction_of_id},correction_of_id.eq.${id}`
              : `correction_of_id.eq.${id}`,
          )
          .neq("id", id)
          .limit(RELATED_LIMIT),
      ),
    ]);

    const relatedMap = new Map<string, EntryRow>();
    for (const group of related) {
      for (const item of (group ?? []) as unknown as EntryRow[]) relatedMap.set(item.id, item);
    }
    const relatedRows = [...relatedMap.values()]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, RELATED_LIMIT);

    /* ---------------- أسماء المستخدمين ---------------- */

    const userIds = [...new Set([row, ...relatedRows].map((item) => item.created_by).filter((v): v is string => Boolean(v)))];
    const users = userIds.length
      ? await safe(() => supabaseAdmin.from("users").select("id, name").in("id", userIds))
      : null;
    const userNames = new Map(((users ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name ?? ""]));

    return NextResponse.json({
      data: {
        entry: mapEntry(row, userNames),
        documents,
        relatedEntries: relatedRows.map((item) => mapEntry(item, userNames)),
      },
    });
  } catch (error: unknown) {
    console.error("Accounting entry detail unexpected:", error);
    return NextResponse.json({ message: "خطأ غير متوقع في السيرفر" }, { status: 500 });
  }
}

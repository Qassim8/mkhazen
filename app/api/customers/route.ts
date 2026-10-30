import { NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { cleanCustomerPhone, normalizeCustomerPhone } from "@/lib/customer-phone";
import { loadCustomerOrders, summarizeOrders } from "@/lib/customers-server";
import { sanitizeSearchTerm } from "@/lib/postgrest";
import { supabaseAdmin } from "@/lib/supabase";

import { customerInputSchema, findExactPhoneOwner, findPhoneDuplicates } from "./_lib/customer-helpers";

function normalizeMeasurements(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const label = String(row.label ?? "").trim();
    const numericValue = Number(row.value);
    if (!label || !Number.isFinite(numericValue) || numericValue <= 0) {
      return [];
    }

    return [{
      label,
      value: numericValue,
      unit: row.unit === "M" ? "M" : "CM",
    }];
  });
}

/**
 * GET /api/customers — قائمة العملاء (customers.view)
 *   search: الاسم أو الهاتف (يشمل الصيغ المختلفة للرقم عبر phone_normalized)
 *   phone + excludeId: عملاء بنفس الرقم الموحَّد (لتنبيه التكرار)
 *   includeStats=true (أو includeOrderCounts): عدد الفواتير وإجمالي المشتريات وآخر تعامل والمتبقي
 */
export async function GET(request: Request) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user || !can(user.role, "customers.view")) {
      return NextResponse.json({ message: "غير مصرح.", code: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const phoneParam = searchParams.get("phone");
    if (phoneParam) {
      const excludeId = searchParams.get("excludeId") ?? undefined;
      const duplicates = await findPhoneDuplicates(phoneParam, excludeId);
      return NextResponse.json({ data: duplicates });
    }

    const search = sanitizeSearchTerm(searchParams.get("search")).replace(/_/g, " ").trim();
    const pageValue = Number(searchParams.get("page") ?? 1);
    const limitValue = Number(searchParams.get("limit") ?? 12);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const limit =
      Number.isInteger(limitValue) && limitValue > 0
        ? Math.min(limitValue, 50)
        : 12;
    const includeStats =
      searchParams.get("includeStats") === "true" || searchParams.get("includeOrderCounts") === "true";

    let query = supabaseAdmin
      .from("customers")
      .select("id, name, whatsapp_number, phone_normalized, notes, created_at, measurements", { count: "exact" })
      .eq("branch_id", MAIN_BRANCH_ID);

    if (search) {
      const conditions = [`name.ilike.%${search}%`, `whatsapp_number.ilike.%${search}%`];
      const digits = search.replace(/\D/g, "");

      if (digits.length >= 3) {
        conditions.push(`phone_normalized.ilike.%${normalizeCustomerPhone(digits) || digits}%`);
        // 0912… (رقم محلي ناقص) يطابق 249912… في الرقم الموحَّد
        if (digits.startsWith("0")) conditions.push(`phone_normalized.ilike.%249${digits.slice(1)}%`);
      }

      query = query.or(conditions.join(","));
    }

    const from = (page - 1) * limit;
    const { data: customers, error, count } = await query
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + limit - 1);

    if (error) {
      throw new Error(`تعذر جلب العملاء: ${error.message}`);
    }

    const rows = customers ?? [];
    const statsByCustomer = new Map<string, ReturnType<typeof summarizeOrders>>();

    if (includeStats && rows.length > 0) {
      const orders = await loadCustomerOrders(rows.map((customer) => customer.id));
      const grouped = new Map<string, typeof orders>();
      for (const order of orders) {
        grouped.set(order.customerId, [...(grouped.get(order.customerId) ?? []), order]);
      }
      for (const [customerId, customerOrders] of grouped) {
        statsByCustomer.set(customerId, summarizeOrders(customerOrders));
      }
    }

    return NextResponse.json({
      data: rows.map((customer) => {
        const stats = statsByCustomer.get(customer.id);
        return {
          id: customer.id,
          name: customer.name,
          whatsapp_number: customer.whatsapp_number,
          phone_normalized: customer.phone_normalized,
          notes: customer.notes,
          created_at: customer.created_at,
          measurements: normalizeMeasurements(customer.measurements),
          order_count: stats?.invoiceCount ?? 0,
          invoice_count: stats?.invoiceCount ?? 0,
          total_purchases: stats?.totalPurchases ?? 0,
          total_paid: stats?.totalPaid ?? 0,
          last_activity: stats?.lastActivity ?? null,
          tailoring_in_progress_remaining: stats?.tailoringInProgressRemaining ?? 0,
          tailoring_due_remaining: stats?.tailoringDueRemaining ?? 0,
        };
      }),
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/customers:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "تعذر جلب بيانات العملاء.",
      },
      { status: 500 },
    );
  }
}

/** POST /api/customers — عميل جديد (customers.create). تكرار الهاتف بصيغة مختلفة = تنبيه لا منع */
export async function POST(request: Request) {
  const guard = await requirePermission("customers.create");
  if (!guard.ok) return guard.response;

  try {
    const validation = customerInputSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات العميل غير صالحة.",
          code: "VALIDATION_ERROR",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { name, whatsappNumber, notes } = validation.data;

    const { data, error } = await supabaseAdmin
      .from("customers")
      .insert({
        branch_id: MAIN_BRANCH_ID,
        name,
        whatsapp_number: cleanCustomerPhone(whatsappNumber),
        notes: notes?.trim() || null,
      })
      .select("id, name, whatsapp_number, phone_normalized, notes, created_at, measurements")
      .single();

    if (error) {
      if (error.code === "23505") {
        const owner = await findExactPhoneOwner(whatsappNumber);
        return NextResponse.json(
          {
            message: `هذا الرقم مسجل بنفس الصيغة للعميل «${owner?.name ?? "آخر"}». افتح العميل الموجود أو ادمجهما.`,
            code: "DUPLICATE_PHONE",
            errors: { existing: owner },
          },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    const duplicates = await findPhoneDuplicates(whatsappNumber, data.id);

    return NextResponse.json(
      {
        message: "تم إنشاء العميل.",
        data: {
          id: data.id,
          name: data.name,
          whatsapp_number: data.whatsapp_number,
          phone_normalized: data.phone_normalized,
          notes: data.notes,
          created_at: data.created_at,
          measurements: normalizeMeasurements(data.measurements),
          order_count: 0,
        },
        duplicates,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/customers:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "تعذر إنشاء العميل." },
      { status: 500 },
    );
  }
}

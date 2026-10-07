import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll } from "@/lib/supabase-fetch-all";

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

export async function GET(request: Request) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const user = await getSession();
    if (!user || !can(user.role, "tailoring.operate")) {
      return NextResponse.json({ message: "غير مصرح." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "")
      .trim()
      .slice(0, 100)
      .replace(/[,%()_]/g, " ");
    const pageValue = Number(searchParams.get("page") ?? 1);
    const limitValue = Number(searchParams.get("limit") ?? 12);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const limit =
      Number.isInteger(limitValue) && limitValue > 0
        ? Math.min(limitValue, 50)
        : 12;
    const includeOrderCounts = searchParams.get("includeOrderCounts") === "true";

    let query = supabaseAdmin
      .from("customers")
      .select("id, name, whatsapp_number, measurements", { count: "exact" })
      .eq("branch_id", MAIN_BRANCH_ID);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,whatsapp_number.ilike.%${search}%`,
      );
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
    const ordersByCustomer = new Map<string, number>();

    if (includeOrderCounts && rows.length > 0) {
      const customerIds = rows.map((customer) => customer.id);
      const orders = await fetchAll<{ customer_id: string | null }>(
        (start, end) =>
          supabaseAdmin
            .from("sales_orders")
            .select("customer_id")
            .eq("branch_id", MAIN_BRANCH_ID)
            .in("customer_id", customerIds)
            .order("id", { ascending: true })
            .range(start, end),
      );

      for (const order of orders) {
        if (order.customer_id) {
          ordersByCustomer.set(
            order.customer_id,
            (ordersByCustomer.get(order.customer_id) ?? 0) + 1,
          );
        }
      }
    }

    return NextResponse.json({
      data: rows.map((customer) => ({
        id: customer.id,
        name: customer.name,
        whatsapp_number: customer.whatsapp_number,
        measurements: normalizeMeasurements(customer.measurements),
        order_count: ordersByCustomer.get(customer.id) ?? 0,
      })),
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

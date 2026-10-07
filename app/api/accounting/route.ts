import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import { accountingQuerySchema } from "@/app/dashboard/accounting/schemas/accounting.schema";
import { MAIN_BRANCH_ID } from "@/lib/constants";

export async function GET(request: Request) {
  try {
    const user = await getSession();

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط",
        },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    const parsed = accountingQuerySchema.safeParse({
      page: searchParams.get("page"),

      limit: searchParams.get("limit"),

      entryType: searchParams.get("entryType") || undefined,

      year: searchParams.get("year") || undefined,

      search: searchParams.get("search") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "معاملات الطلب غير صحيحة",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { page, limit, entryType, year, search } = parsed.data;

    const from = (page - 1) * limit;

    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("journal_entries")
      .select(
        `
          id,
          entry_number,
          purchase_order_id,
          created_by,
          branch_id,
          entry_type,
          amount,
          description,
          reference,
          debit_account,
          credit_account,
          created_at,

          users:created_by (
            id,
            name
          ),

          purchase_orders (
            id,
            order_number
          )
        `,
        {
          count: "exact",
        },
      )
      .eq("branch_id", MAIN_BRANCH_ID);

    if (entryType && entryType !== "ALL") {
      query = query.eq("entry_type", entryType);
    }

    if (year) {
      query = query
        .gte("created_at", `${year}-01-01T00:00:00.000Z`)
        .lt("created_at", `${year + 1}-01-01T00:00:00.000Z`);
    }

    if (search) {
      query = query.or(
        [
          `entry_number.ilike.%${search}%`,
          `description.ilike.%${search}%`,
          `reference.ilike.%${search}%`,
        ].join(","),
      );
    }

    const { data, count, error } = await query
      .order("created_at", {
        ascending: false,
      })
      .range(from, to);

    if (error) {
      console.error("Accounting GET:", error);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب القيود",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: data ?? [],

      meta: {
        total: count ?? 0,

        page,

        limit,

        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("Accounting GET unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

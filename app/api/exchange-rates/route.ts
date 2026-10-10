import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

import {
  createExchangeRateSchema,
  exchangeRatesQuerySchema,
} from "@/lib/validations/exchange-rate.schemas";

export async function GET(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "exchangeRate.manage")) {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    const validation = exchangeRatesQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { message: "معاملات الطلب غير صحيحة" },
        { status: 422 },
      );
    }

    const { page, limit } = validation.data;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {
      data,
      count,
      error,
    } = await supabaseAdmin
      .from("exchange_rates")
      .select(
        `
          id,
          rate,
          effective_at,
          notes,
          created_by,
          created_at,
          users:created_by ( name )
        `,
        { count: "exact" },
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .order("effective_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("GET /api/exchange-rates:", error);
      return NextResponse.json(
        { message: "تعذر جلب سجل أسعار الصرف" },
        { status: 500 },
      );
    }

    type RateRow = {
      id: string;
      rate: number | string;
      effective_at: string;
      notes: string | null;
      created_by: string | null;
      users: { name: string | null } | null;
      created_at: string;
    };

    const mapped = ((data ?? []) as unknown as RateRow[]).map((row) => ({
      id: row.id,
      rate: Number(row.rate),
      effectiveAt: row.effective_at,
      notes: row.notes,
      createdById: row.created_by,
      createdByName: row.users?.name ?? null,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      data: mapped,
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/exchange-rates unexpected:", error);
    return NextResponse.json(
      { message: "خطأ غير متوقع في السيرفر" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "exchangeRate.manage")) {
      return NextResponse.json(
        { message: "عذراً، تعديل سعر الصرف مقتصر على المدير فقط", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const body = await request.json();

    const validation = createExchangeRateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات سعر الصرف غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { rate, notes } = validation.data;

    const { data, error } = await supabaseAdmin
      .from("exchange_rates")
      .insert({
        branch_id: MAIN_BRANCH_ID,
        rate,
        notes: notes || null,
        created_by: user.userId,
      })
      .select("id, rate, effective_at, notes, created_at")
      .single();

    if (error) {
      console.error("POST /api/exchange-rates:", error);
      return NextResponse.json(
        { message: "تعذر تسجيل سعر الصرف الجديد" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: `تم تسجيل سعر الصرف الجديد (1$ = ${rate} ج.س) بنجاح`,
        data: {
          id: data.id,
          rate: Number(data.rate),
          effectiveAt: data.effective_at,
          notes: data.notes,
          createdAt: data.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/exchange-rates unexpected:", error);
    return NextResponse.json(
      { message: "خطأ غير متوقع في السيرفر" },
      { status: 500 },
    );
  }
}

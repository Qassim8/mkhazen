import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const user = await getSession();

    if (!user) {
      return NextResponse.json(
        { message: "يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("exchange_rates")
      .select("rate, effective_at, notes")
      .eq("branch_id", MAIN_BRANCH_ID)
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("GET /api/exchange-rates/current:", error);
      return NextResponse.json(
        { message: "تعذر جلب سعر الصرف الحالي" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        rate: data ? Number(data.rate) : null,
        effectiveAt: data?.effective_at ?? null,
        notes: data?.notes ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/exchange-rates/current unexpected:", error);
    return NextResponse.json(
      { message: "خطأ غير متوقع في السيرفر" },
      { status: 500 },
    );
  }
}

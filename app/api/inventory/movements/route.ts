import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json(
        { message: "غير مصرح بالدخول" },
        { status: 401 },
      );
    }

    // استخراج معلمات الفلترة اختياريًا من URL
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 50);
    const type = searchParams.get("type"); // STOCK_IN, STOCK_OUT, ADJUSTMENT

    let query = supabaseAdmin
      .from("inventory_movements")
      .select(
        `
        id,
        movement_type,
        quantity,
        unit_cost,
        reference,
        notes,
        created_at,
        template_id ,
        purchase_order_id ,
        variant_id,
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("movement_type", type);
    }

    const { data: movements, error } = await query;

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({
      movements: movements || [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

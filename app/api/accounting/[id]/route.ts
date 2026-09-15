import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: Props) {
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

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          message: "معرف القيد مطلوب",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
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
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          message: "القيد غير موجود",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data,
    });
  } catch (error: unknown) {
    console.error("Accounting detail:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

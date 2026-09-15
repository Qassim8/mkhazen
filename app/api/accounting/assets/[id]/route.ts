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

    const { data, error } = await supabaseAdmin
      .from("assets")
      .select(
        `
          id,
          branch_id,
          created_by,
          name,
          category,
          purchase_value,
          purchase_date,
          payment_method,
          reference,
          notes,
          created_at,

          users:created_by (
            id,
            name
          )
        `,
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          message: "الأصل غير موجود",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data,
    });
  } catch (error: unknown) {
    console.error("Asset detail GET:", error);

    return NextResponse.json(
      {
        message: "حدث خطأ أثناء جلب الأصل",
      },
      { status: 500 },
    );
  }
}

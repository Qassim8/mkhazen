import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    if (!user || !can(user.role, "tailoring.operate")) {
      return NextResponse.json({ message: "غير مصرح.", code: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, whatsapp_number, measurements")
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (error) throw new Error(`تعذر جلب بيانات العميل: ${error.message}`);
    if (!data) {
      return NextResponse.json({ message: "العميل غير موجود." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: data.id,
        name: data.name,
        whatsapp_number: data.whatsapp_number,
        measurements: Array.isArray(data.measurements)
          ? data.measurements
          : [],
        order_count: 0,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/customers/[id]:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "تعذر جلب بيانات العميل.",
      },
      { status: 500 },
    );
  }
}

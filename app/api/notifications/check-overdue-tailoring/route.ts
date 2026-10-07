import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST() {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const user = await getSession();

    if (!user) {
      return NextResponse.json(
        { message: "يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    if (!["admin", "owner"].includes(String(user.role).toLowerCase())) {
      return NextResponse.json(
        { message: "إنشاء تنبيهات التأخير متاح للمدير فقط." },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "generate_overdue_tailoring_notifications",
      { p_branch_id: MAIN_BRANCH_ID },
    );

    if (error) {
      console.error("create_tailoring_overdue_notifications RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر إنشاء تنبيهات التأخير." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: `تم إنشاء ${Number(data ?? 0)} تنبيه تأخير.`,
      count: Number(data ?? 0),
    });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/overdue-notifications:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء إنشاء تنبيهات التأخير.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";

import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { cancelTailoringOrderSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });

    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً.", code: "UNAUTHENTICATED" }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (!can(role, "tailoring.manage")) {
      return NextResponse.json({ message: "إلغاء طلبات التفصيل متاح للمدير أو المالك فقط.", code: "FORBIDDEN" }, { status: 403 });
    }

    const parsed = cancelTailoringOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "سبب الإلغاء غير صالح.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const { id } = await params;
    const { data, error } = await supabaseAdmin.rpc("cancel_tailoring_order", {
      p_order_id: id,
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_reason: parsed.data.reason,
    });

    if (error) {
      console.error("cancel_tailoring_order RPC:", error);
      return NextResponse.json({ message: error.message || "تعذر إلغاء الطلب." }, { status: 400 });
    }

    await notifyTailoringUpdate({
      orderId: id,
      event: "CANCELLED",
      actor: user,
      details: parsed.data.reason ? `السبب: ${parsed.data.reason}` : null,
    });

    return NextResponse.json({ message: `تم إلغاء الطلب ${data.order_number}.`, data });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders/[id]/cancel:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء إلغاء الطلب." }, { status: 500 });
  }
}

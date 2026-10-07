import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { refundCustomerAdvanceSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });

    const user = await getSession();
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (!can(role, "tailoring.manage")) {
      return NextResponse.json({ message: "استرداد عربون العميل متاح للمدير أو المالك فقط." }, { status: 403 });
    }

    const parsed = refundCustomerAdvanceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "بيانات الاسترداد غير صالحة.", errors: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const { id } = await params;
    const { data, error } = await supabaseAdmin.rpc("refund_customer_advance", {
      p_order_id: id,
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_amount: parsed.data.amount,
      p_payment_method: parsed.data.paymentMethod,
      p_notes: parsed.data.notes,
    });

    if (error) {
      console.error("refund_customer_advance RPC:", error);
      return NextResponse.json({ message: error.message || "تعذر استرداد العربون." }, { status: 400 });
    }

    await notifyTailoringUpdate({ orderId: id, event: "REFUNDED", actor: user });

    return NextResponse.json({ message: "تم استرداد العربون وتسجيل القيد المحاسبي بنجاح.", data });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders/[id]/refund:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء استرداد العربون." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { completeTailoringPickupSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const role = String(user.role).toLowerCase();

    if (!can(role, "tailoring.operate")) {
      return NextResponse.json(
        { message: "استلام طلب العميل وتحصيل الباقي متاح للكاشير أو الإدارة فقط." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = completeTailoringPickupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات الاستلام غير صالحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { id } = await params;
    const { data: order, error: orderError } = await supabaseAdmin
      .from("sales_orders")
      .select("id")
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("order_type", "TAILORING")
      .eq("tailoring_purpose", "CUSTOMER")
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!order) {
      return NextResponse.json(
        { message: "طلب تفصيل العميل غير موجود." },
        { status: 404 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "complete_tailoring_pickup",
      {
        p_order_id: id,
        p_branch_id: MAIN_BRANCH_ID,
        p_user_id: user.userId,
        p_payment_method: validation.data.paymentMethod,
      },
    );

    if (error) {
      console.error("complete_tailoring_pickup RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر إتمام استلام الطلب." },
        { status: 400 },
      );
    }

    await notifyTailoringUpdate({ orderId: id, event: "RECEIVED", actor: user });

    return NextResponse.json({
      message: `تم استلام الطلب ${data.order_number} وتحصيل المبلغ المتبقي بنجاح.`,
      data: can(role, "tailoring.manage")
        ? data
        : { id, order_number: data.order_number, tailoring_status: "RECEIVED" },
    });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders/[id]/pickup:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء استلام الطلب.",
      },
      { status: 500 },
    );
  }
}

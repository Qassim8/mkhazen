import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { updateTailoringStatusSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";
import { completeTailoringPickupSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function PATCH(
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

    if (!["admin", "cashier", "tailor"].includes(role)) {
      return NextResponse.json(
        { message: "ليس لديك صلاحية تعديل طلبات التفصيل." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = updateTailoringStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "الحالة المطلوبة غير صالحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin.rpc("update_tailoring_status", {
      p_order_id: id,
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_new_status: validation.data.status,
    });

    if (error) {
      console.error("update_tailoring_status RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر تحديث حالة الطلب." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "تم تحديث حالة طلب التفصيل بنجاح.",
      data,
    });
  } catch (error: unknown) {
    console.error("PATCH /api/tailoring/orders/[id]/status:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء تحديث حالة الطلب.",
      },
      { status: 500 },
    );
  }
}

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

    if (!["admin", "cashier", "tailor"].includes(role)) {
      return NextResponse.json(
        { message: "ليس لديك صلاحية تعديل طلبات التفصيل." },
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

    return NextResponse.json({
      message: `تم استلام الطلب ${data.order_number} وتحصيل المبلغ المتبقي بنجاح.`,
      data,
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

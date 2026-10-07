import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { payTailorPaymentSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

export async function POST(request: Request) {
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

    if (role !== "admin" && role !== "cashier") {
      return NextResponse.json(
        { message: "دفع مستحقات الخياط متاح للكاشير أو المدير فقط." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validation = payTailorPaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات دفعة الخياط غير صالحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const value = validation.data;

    const { data, error } = await supabaseAdmin.rpc("pay_tailor_payment", {
      p_branch_id: MAIN_BRANCH_ID,
      p_tailor_id: value.tailorId,
      p_user_id: user.userId,
      p_amount: value.amount,
      p_payment_method: value.paymentMethod,
      p_sales_order_id: value.salesOrderId ?? null,
      p_notes: value.notes ?? null,
    });

    if (error) {
      console.error("pay_tailor_payment RPC:", error);
      return NextResponse.json(
        { message: error.message || "تعذر تسجيل دفعة الخياط." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        message:
          data?.payment_type === "ADVANCE"
            ? "تم تسجيل الدفعة المقدمة للخياط بنجاح."
            : "تم تسجيل سداد مستحقات الخياط بنجاح.",
        data,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/tailoring/commission-payments:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء تسجيل دفعة الخياط.",
      },
      { status: 500 },
    );
  }
}

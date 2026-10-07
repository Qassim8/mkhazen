import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

const cancelSalesOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "سبب الإلغاء يجب ألا يتجاوز 500 حرف")
    .nullable()
    .optional(),
});

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        {
          error: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام",
        },
        { status: 500 },
      );
    }

    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }

    const userId = session.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "تعذر تحديد المستخدم الحالي" },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const validation = cancelSalesOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "بيانات الإلغاء غير صالحة",
          details: validation.error.flatten(),
        },
        { status: 422 },
      );
    }

    const reason = validation.data.reason?.trim() || null;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("sales_orders")
      .select(
        `
          id,
          order_number,
          status,
          payment_status,
          total_amount
        `,
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json(
        {
          error: `فشل جلب الطلب: ${orderError.message}`,
        },
        { status: 500 },
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "طلب البيع غير موجود" },
        { status: 404 },
      );
    }

    if (order.status === "COMPLETED") {
      return NextResponse.json(
        {
          error: "لا يمكن إلغاء فاتورة مكتملة. استخدم عملية إرجاع/عكس منفصلة.",
        },
        { status: 400 },
      );
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "الطلب ملغى بالفعل" }, { status: 400 });
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("sales_order_payments")
      .select("id, amount")
      .eq("sales_order_id", id);

    if (paymentsError) {
      return NextResponse.json(
        {
          error: `فشل التحقق من دفعات الطلب: ${paymentsError.message}`,
        },
        { status: 500 },
      );
    }

    if ((payments ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            "لا يمكن إلغاء طلب تم تسجيل دفعة عليه. يجب استخدام عملية استرداد/عكس الدفع.",
        },
        { status: 400 },
      );
    }

    const nextNotes = reason ? `سبب الإلغاء: ${reason}` : null;

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("sales_orders")
      .update({
        status: "CANCELLED",
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("status", "PENDING")
      .select("id, order_number, status")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          error: `فشل إلغاء الطلب: ${updateError.message}`,
        },
        { status: 500 },
      );
    }

    if (!updatedOrder) {
      return NextResponse.json(
        {
          error: "تعذر إلغاء الطلب؛ ربما تغيرت حالته بواسطة عملية أخرى.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: `تم إلغاء طلب البيع ${updatedOrder.order_number} بنجاح`,
      cancelledBy: userId,
    });
  } catch (error: unknown) {
    console.error("POST /api/sales/orders/[id]/cancel error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء إلغاء الطلب",
      },
      { status: 500 },
    );
  }
}

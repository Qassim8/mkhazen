import { NextResponse } from "next/server";

import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import { createPurchasePaymentSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

import { fetchPurchaseOrderById } from "../../_lib/purchase-order";

/* =========================================================
   GET PAYMENTS
========================================================= */

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
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

    const { data: order, error: orderError } = await fetchPurchaseOrderById(id);

    if (orderError || !order) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: order.payments ?? [],

      summary: {
        totalAmount: order.totalAmount,

        paidAmount: order.paidAmount ?? 0,

        remainingAmount: order.remainingAmount ?? order.totalAmount,
      },
    });
  } catch (error: unknown) {
    console.error("Purchase payments GET:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST PAYMENT
========================================================= */

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
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

    const { data: order, error: orderError } = await fetchPurchaseOrderById(id);

    if (orderError || !order) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        { status: 404 },
      );
    }

    /*
     * We don't allow payments on cancelled orders.
     */
    if (order.status === "CANCELLED") {
      return NextResponse.json(
        {
          message: "لا يمكن تسجيل دفعة على طلب شراء ملغي",
        },
        { status: 400 },
      );
    }

    const body = await request.json();

    if (body.paymentDate === "") {
      body.paymentDate = undefined;
    }

    if (body.paymentMethod === "") {
      body.paymentMethod = null;
    }

    const validation = createPurchasePaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات الدفعة غير صالحة",

          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { amount, paymentDate, paymentMethod, notes } = validation.data;

    const paidAmount = order.paidAmount ?? 0;

    const remainingAmount =
      order.remainingAmount ?? Math.max(0, order.totalAmount - paidAmount);

    /*
     * Do not allow overpayment.
     */
    if (amount > remainingAmount) {
      return NextResponse.json(
        {
          message: `مبلغ الدفعة أكبر من المبلغ المتبقي (${remainingAmount.toFixed(2)} ريال)`,
        },
        { status: 400 },
      );
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("purchase_order_payments")
      .insert({
        purchase_order_id: id,

        amount: Number(amount.toFixed(2)),

        payment_date: paymentDate
          ? new Date(paymentDate).toISOString()
          : new Date().toISOString(),

        payment_method: paymentMethod ?? null,

        notes: notes ?? null,

        created_by: user.userId ?? null,
      })
      .select()
      .single();

    if (paymentError || !payment) {
      console.error("Create purchase payment:", paymentError);

      return NextResponse.json(
        {
          message: paymentError?.message ?? "تعذر تسجيل الدفعة",
        },
        { status: 400 },
      );
    }

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    revalidatePath(`/dashboard/orders/${id}`);

    const { data: updatedOrder } = await fetchPurchaseOrderById(id);

    return NextResponse.json(
      {
        message: "تم تسجيل الدفعة بنجاح",

        payment,

        data: updatedOrder,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Purchase payment POST:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { getSession } from "@/lib/auth";

import { createPurchasePaymentSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  fetchPurchaseOrderById,
  recordPurchasePayment,
} from "../../_lib/purchase-order";

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

    const { data: order, error } = await fetchPurchaseOrderById(id);

    if (error || !order) {
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

    if (order.status === "CANCELLED") {
      return NextResponse.json(
        {
          message: "لا يمكن تسجيل دفعة على طلب شراء ملغي",
        },
        { status: 400 },
      );
    }

    if (order.status === "DRAFT") {
      return NextResponse.json(
        {
          message: "لا يمكن تسجيل دفعة قبل اعتماد طلب الشراء",
        },
        { status: 400 },
      );
    }

    const body = await request.json();

    if (body.paymentDate === "") {
      body.paymentDate = undefined;
    }

    if (body.reference === "") {
      body.reference = undefined;
    }

    if (body.notes === "") {
      body.notes = undefined;
    }

    const validation = createPurchasePaymentSchema.safeParse({
      ...body,
      purchaseOrderId: id,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات الدفعة غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { amount, paymentDate, paymentMethod, reference, notes } =
      validation.data;

    const payment = await recordPurchasePayment({
      purchaseOrderId: id,

      amount,

      paymentDate,

      paymentMethod,

      reference,

      notes,

      createdBy: user.userId ?? null,
    });

    revalidateTag("purchases-list", "default");

    revalidateTag("accounting-summary", "default");

    revalidatePath("/dashboard/orders");

    revalidatePath(`/dashboard/orders/${id}`);

    revalidatePath("/dashboard/accounting");

    revalidatePath("/dashboard/accounting/overview");

    const { data: updatedOrder } = await fetchPurchaseOrderById(id);

    return NextResponse.json(
      {
        message: "تم تسجيل الدفعة والقيد المحاسبي بنجاح",

        payment,

        data: updatedOrder,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Purchase payment POST:", error);

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

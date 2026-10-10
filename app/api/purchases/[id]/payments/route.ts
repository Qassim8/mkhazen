import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";
import { revalidatePath, revalidateTag } from "next/cache";

import { can } from "@/lib/permissions";

import { createPurchasePaymentSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  fetchPurchaseOrderById,
  recordPurchasePayment,
  PurchaseRpcError,
} from "../../_lib/purchase-order";
import { dbErrorResponse, isDefiniteDbRejection } from "@/lib/api-response";
import { beginIdempotentOperation, readIdempotencyKey } from "@/lib/idempotency";

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
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
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
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
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

    // منع تسجيل نفس الدفعة مرتين (نقرتين / إعادة إرسال بعد انقطاع)
    const idempotency = await beginIdempotentOperation({
      scope: "purchases.payment",
      userId: user.userId,
      clientKey: readIdempotencyKey(request),
      payload: validation.data,
    });
    if (idempotency.kind === "response") return idempotency.response;

    let payment;
    try {
      payment = await recordPurchasePayment({
        purchaseOrderId: id,

        amount,

        paymentDate,

        paymentMethod,

        reference,

        notes,

        createdBy: user.userId,
      });
    } catch (paymentError) {
      if (paymentError instanceof PurchaseRpcError && isDefiniteDbRejection(paymentError.dbError)) {
        await idempotency.abandon();
      }
      throw paymentError;
    }

    revalidateTag("purchases-list", "default");

    revalidateTag("accounting-summary", "default");

    revalidatePath("/dashboard/orders");

    revalidatePath(`/dashboard/orders/${id}`);

    revalidatePath("/dashboard/accounting");

    revalidatePath("/dashboard/accounting/overview");

    const { data: updatedOrder } = await fetchPurchaseOrderById(id);

    const responseBody = {
      message: "تم تسجيل الدفعة والقيد المحاسبي بنجاح",

      payment,

      data: updatedOrder,
    };

    await idempotency.finish(201, responseBody);

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof PurchaseRpcError) {
      return dbErrorResponse(error.dbError, "record_purchase_payment", "تعذر تسجيل الدفعة.");
    }

    return dbErrorResponse(error, "Purchase payment POST", "تعذر تسجيل الدفعة.");
  }
}

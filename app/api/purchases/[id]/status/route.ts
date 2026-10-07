import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import {
  PurchaseOrderStatus,
  updatePurchaseOrderStatusSchema,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allowedStatusTransitions,
  fetchPurchaseOrderById,
  processPurchaseReceipt,
  recordPurchasePayment,
} from "../../_lib/purchase-order";

export async function PATCH(
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

    const body = await request.json();

    const validation = updatePurchaseOrderStatusSchema.safeParse({
      ...body,
      id,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات تغيير الحالة غير صالحة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { status: newStatus, payment } = validation.data;

    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from("purchase_orders")
      .select("id, status, purchase_type")
      .eq("id", id)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        { status: 404 },
      );
    }

    const currentStatus = existingOrder.status as PurchaseOrderStatus;

    if (newStatus === currentStatus) {
      return NextResponse.json({
        message: "حالة الطلب لم تتغير",

        data: (await fetchPurchaseOrderById(id)).data,
      });
    }

    /* =====================================================
       PAYMENT WITH STATUS REQUEST

       Optional payment is only processed when the request
       moves the order to RECEIVED.
    ===================================================== */

    if (payment && newStatus !== "RECEIVED") {
      return NextResponse.json(
        {
          message:
            "الدفعة المرفقة تستخدم فقط عند استلام طلب الشراء. ويمكن تسجيل الدفعة بشكل مستقل بعد اعتماد الطلب.",
        },
        { status: 400 },
      );
    }

    const allowed = allowedStatusTransitions[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      let message = "لا يمكن تغيير حالة الطلب إلى هذه القيمة.";

      if (currentStatus === "DRAFT") {
        message = "المسودة يمكن اعتمادها أو إلغاؤها فقط.";
      }

      if (currentStatus === "APPROVED") {
        message = "الطلب المعتمد ينتظر الاستلام فقط.";
      }

      if (currentStatus === "RECEIVED") {
        message = "الطلب المستلم لا يمكن تغيير حالته.";
      }

      if (currentStatus === "CANCELLED") {
        message = "الطلب الملغي يمكن إعادته إلى المسودة فقط.";
      }

      return NextResponse.json({ message }, { status: 400 });
    }

    /* =====================================================
       DRAFT
       CANCELLED -> DRAFT
    ===================================================== */

    if (newStatus === "DRAFT") {
      const { error } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "DRAFT",

          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json(
          {
            message: error.message,
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       APPROVED
    ===================================================== */

    if (newStatus === "APPROVED") {
      const { error } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "APPROVED",

          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json(
          {
            message: error.message,
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       CANCELLED
    ===================================================== */

    if (newStatus === "CANCELLED") {
      const { error } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "CANCELLED",

          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json(
          {
            message: error.message,
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       RECEIVED
    ===================================================== */

    if (newStatus === "RECEIVED") {
      await processPurchaseReceipt(id, user.userId);

      const { error: receiveError } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "RECEIVED",

          received_by: user.userId,

          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (receiveError) {
        return NextResponse.json(
          {
            message:
              "تم تحديث المخزون لكن تعذر تحديث حالة الطلب. لا تحاول الاستلام مرة أخرى قبل معالجة هذه الحالة.",
          },
          { status: 500 },
        );
      }

      /* ===================================================
         OPTIONAL PAYMENT AFTER RECEIPT
      =================================================== */

      if (payment) {
        try {
          await recordPurchasePayment({
            purchaseOrderId: id,

            amount: payment.amount,

            paymentDate: payment.paymentDate,

            paymentMethod: payment.paymentMethod,

            reference: payment.reference,

            notes: payment.notes,

            createdBy: user.userId ?? null,
          });
        } catch (paymentError) {
          console.error("Receive payment error:", paymentError);

          revalidateTag("products-list", "default");

          revalidateTag("purchases-list", "default");

          revalidatePath("/dashboard/orders");

          revalidatePath(`/dashboard/orders/${id}`);

          return NextResponse.json(
            {
              message:
                paymentError instanceof Error
                  ? `تم استلام الطلب وتحديث المخزون، لكن تعذر تسجيل الدفعة: ${paymentError.message}`
                  : "تم استلام الطلب وتحديث المخزون، لكن تعذر تسجيل الدفعة.",
              warning: true,
              data: (await fetchPurchaseOrderById(id)).data,
            },
            { status: 400 },
          );
        }
      }

      revalidateTag("products-list", "default");

      revalidateTag("accounting-summary", "default");

      revalidatePath("/dashboard/products");

      revalidatePath("/dashboard/inventory");

      revalidatePath("/dashboard/accounting");

      revalidatePath("/dashboard/accounting/overview");
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    revalidatePath(`/dashboard/orders/${id}`);

    const { data } = await fetchPurchaseOrderById(id);

    const messages: Record<string, string> = {
      DRAFT: "تمت إعادة طلب الشراء إلى المسودة.",

      APPROVED: "تمت الموافقة على طلب الشراء.",

      RECEIVED: payment
        ? "تم استلام الطلب وتسجيل الدفعة بنجاح."
        : "تم استلام الطلب وتحديث المخزون بنجاح.",

      CANCELLED: "تم إلغاء طلب الشراء.",
    };

    return NextResponse.json({
      message: messages[newStatus] ?? "تم تحديث حالة الطلب",

      data,
    });
  } catch (error: unknown) {
    console.error("Purchase status PATCH:", error);

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

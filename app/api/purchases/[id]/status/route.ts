import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { can } from "@/lib/permissions";

import {
  PurchaseOrderStatus,
  updatePurchaseOrderStatusSchema,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allowedStatusTransitions,
  fetchPurchaseOrderById,
  processPurchaseReceipt,
  recordPurchasePayment,
  notifyPurchaseDecision,
  PurchaseRpcError,
} from "../../_lib/purchase-order";
import { apiError, dbErrorResponse } from "@/lib/api-response";

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
      .select("id, status, purchase_type, order_number")
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
       الاعتماد للمالك فقط
    ===================================================== */

    if (newStatus === "APPROVED" && !can(user.role, "purchases.approve")) {
      return NextResponse.json(
        { message: "اعتماد طلبات الشراء متاح للمالك فقط.", code: "FORBIDDEN" },
        { status: 403 },
      );
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
       DRAFT / APPROVED / CANCELLED
       التحديث مشروط بالحالة اللي اتقرت فوق: لو حد تاني غيّرها في نفس
       اللحظة (المالك اعتمد والمدير ألغى) التحديث ما بيلمسش أي صف → 409.
    ===================================================== */

    if (newStatus === "DRAFT" || newStatus === "APPROVED" || newStatus === "CANCELLED") {
      const { data: updated, error } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: newStatus,

          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", currentStatus)
        .select("id")
        .maybeSingle();

      if (error) {
        return dbErrorResponse(error, "PATCH purchase status", "تعذر تغيير حالة الطلب.");
      }

      if (!updated) {
        return apiError(
          409,
          "CONFLICT",
          "تغيّرت حالة الطلب بواسطة مستخدم آخر. حدّث الصفحة وراجع الطلب.",
        );
      }
    }

    /* =====================================================
       RECEIVED — عملية ذرّية في قاعدة البيانات (receive_purchase_order)
       المخزون + التكلفة + الحركات + قيد الشراء + الحالة: كله أو ولا حاجة.
    ===================================================== */

    if (newStatus === "RECEIVED") {
      try {
        await processPurchaseReceipt(id, user.userId);
      } catch (receiptError) {
        if (receiptError instanceof PurchaseRpcError) {
          return dbErrorResponse(receiptError.dbError, "receive_purchase_order", "تعذر استلام طلب الشراء.");
        }
        throw receiptError;
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

            createdBy: user.userId,
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


    /* =====================================================
       إشعارات القرار:
       • المالك اعتمد/رفض → إشعار للمدير
       • المدير ألغى مسودته → إشعار الاعتماد عند المالك يتقفل
    ===================================================== */

    if (currentStatus === "DRAFT" && (newStatus === "APPROVED" || newStatus === "CANCELLED")) {
      if (newStatus === "APPROVED" || can(user.role, "purchases.approve")) {
        await notifyPurchaseDecision(existingOrder.order_number, id, newStatus);
      } else {
        await supabaseAdmin
          .from("notifications")
          .update({ isRead: true })
          .eq("metadata->>key", `PO_APPROVAL:${id}`)
          .eq("isRead", false);
      }
    }

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
    return dbErrorResponse(error, "Purchase status PATCH", "تعذر تغيير حالة الطلب.");
  }
}

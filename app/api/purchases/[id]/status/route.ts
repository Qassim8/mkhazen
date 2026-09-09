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
          message: "حالة الطلب غير صالحة",

          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { status: newStatus } = validation.data;

    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from("purchase_orders")
      .select("status, purchase_type")
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

    /* =====================================================
       Same status
    ===================================================== */

    if (newStatus === currentStatus) {
      const { data } = await fetchPurchaseOrderById(id);

      return NextResponse.json({
        message: "حالة الطلب لم تتغير",

        data,
      });
    }

    /* =====================================================
       Validate transition
    ===================================================== */

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
        message = "الطلب الملغي لا يمكن إعادة تنشيطه.";
      }

      return NextResponse.json({ message }, { status: 400 });
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

       This is the ONLY point where stock increases
       for workflow purchases.
    ===================================================== */

    if (newStatus === "RECEIVED") {
      try {
        await processPurchaseReceipt(id, user.userId);
      } catch (receiptError) {
        console.error("Purchase receipt error:", receiptError);

        return NextResponse.json(
          {
            message:
              receiptError instanceof Error
                ? receiptError.message
                : "تعذر استلام الطلب وتحديث المخزون",
          },
          { status: 500 },
        );
      }

      const { error: receiveUpdateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "RECEIVED",

          received_by: user.userId,

          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (receiveUpdateError) {
        return NextResponse.json(
          {
            message:
              "تم تحديث المخزون لكن تعذر تحديث حالة الطلب. يجب معالجة هذه الحالة قبل إعادة الاستلام.",
          },
          { status: 500 },
        );
      }

      revalidateTag("products-list", "default");

      revalidatePath("/dashboard/products");

      revalidatePath("/dashboard/inventory");
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    const { data } = await fetchPurchaseOrderById(id);

    const messages: Record<string, string> = {
      APPROVED: "تمت الموافقة على طلب الشراء.",

      RECEIVED: "تم استلام الطلب وتحديث المخزون بنجاح.",

      CANCELLED: "تم إلغاء مسودة طلب الشراء.",
    };

    return NextResponse.json({
      message: messages[newStatus] ?? "تم تحديث حالة الطلب",

      data,
    });
  } catch (error: unknown) {
    console.error("Purchase status PATCH:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

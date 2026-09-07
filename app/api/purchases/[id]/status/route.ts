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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSession();
    const { id } = await params;
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

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
        { message: "طلب الشراء غير موجود" },
        { status: 404 },
      );
    }

    const currentStatus = existingOrder.status as PurchaseOrderStatus;

    if (newStatus === currentStatus) {
      const { data } = await fetchPurchaseOrderById(id);
      return NextResponse.json({
        message: "حالة الطلب لم تتغير",
        data,
      });
    }

    if (!allowedStatusTransitions[currentStatus]?.includes(newStatus)) {
      const lockedMessage =
        currentStatus === "APPROVED"
          ? "بعد الموافقة لا يمكن إلغاء الطلب. يمكن تحويله إلى مستلم فقط عند وصول التوريد."
          : currentStatus === "RECEIVED"
            ? "الطلب المستلم لا يمكن تعديل حالته أو حذفه."
            : "لا يمكن تغيير حالة الطلب إلى هذه القيمة.";

      return NextResponse.json({ message: lockedMessage }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (newStatus === "RECEIVED") {
      try {
        await processPurchaseReceipt(id, user.userId);
      } catch (receiptError) {
        await supabaseAdmin
          .from("purchase_orders")
          .update({
            status: currentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        return NextResponse.json(
          {
            message:
              receiptError instanceof Error
                ? receiptError.message
                : "تعذر استلام الطلب وزيادة المخزون",
          },
          { status: 500 },
        );
      }

      revalidateTag("products-list", "default");
      revalidatePath("/dashboard/products");
      revalidatePath("/dashboard/inventory");
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");

    const { data } = await fetchPurchaseOrderById(id);
    const messages: Record<string, string> = {
      APPROVED:
        "تمت الموافقة على طلب الشراء. يمكنك الآن انتظار التوريد واستلام الشحنة.",
      RECEIVED: "تم استلام الطلب بنجاح وتحديث مخزون المتغيرات التسويقية.",
      CANCELLED: "تم إلغاء مسودة طلب الشراء.",
    };

    return NextResponse.json({
      message: messages[newStatus] || "تم تحديث حالة الطلب",
      data,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

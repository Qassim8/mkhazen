import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";

import { completeSalesCheckout } from "@/app/api/sales/_lib/sales-helper";
import { createSalesOrderSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

export async function POST(req: NextRequest) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." },
        { status: 500 },
      );
    }

    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { message: "يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    if (!can(session.role, "sales.pos")) {
      return NextResponse.json(
        { message: "عذراً، البيع من الكاشير غير متاح لصلاحياتك." },
        { status: 403 },
      );
    }

    const cashierId = session.userId;

    if (!cashierId) {
      return NextResponse.json(
        { message: "تعذر تحديد المستخدم الحالي." },
        { status: 401 },
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: "بيانات الطلب ليست JSON صالحة." },
        { status: 400 },
      );
    }

    const validation = createSalesOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات عملية البيع غير صحيحة.",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const payload = validation.data;

    const items = payload.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      isGift: item.isGift,
      giftNote: item.giftNote ?? null,
    }));

    const result = await completeSalesCheckout({
      branchId: MAIN_BRANCH_ID,
      cashierId,
      // طلبات التفصيل ليها مسار خاص (/api/tailoring/orders)
      orderType: "POS",
      customerId: payload.customerId ?? null,
      tailorId: payload.tailorId ?? null,
      discountAmount: payload.discountAmount,
      taxAmount: payload.taxAmount,
      paymentMethod: payload.paymentMethod,
      paymentSplits: payload.paymentSplits,
      notes: payload.notes ?? null,
      items,
    });

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard");

    return NextResponse.json(
      {
        message: "تمت عملية البيع بنجاح.",
        orderId: result.id,
        orderNumber: result.orderNumber,
        subtotal: result.subtotal,
        discountAmount: result.discountAmount,
        taxAmount: result.taxAmount,
        totalAmount: result.totalAmount,
        paidAmount: result.paidAmount,
        remainingAmount: Math.max(
          Number((result.totalAmount - result.paidAmount).toFixed(2)),
          0,
        ),
        paymentStatus: result.paymentStatus,
        paymentMethod: result.paymentMethod,
        status: result.status,
        createdAt: result.createdAt,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/sales/checkout error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "حدث خطأ أثناء إتمام عملية البيع.";

    return NextResponse.json({ message }, { status: 400 });
  }
}

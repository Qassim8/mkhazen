import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { completeSalesCheckout } from "../_lib/sales-helper";
import { createSalesOrderSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

export async function POST(req: NextRequest) {
  try {
    // =====================================================
    // 1. Authentication
    // =====================================================
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { message: "يرجى تسجيل الدخول أولاً." },
        { status: 401 },
      );
    }

    const cashierId = session.userId;
    if (!cashierId) {
      return NextResponse.json(
        { message: "تعذر تحديد المستخدم الحالي." },
        { status: 401 },
      );
    }

    // =====================================================
    // 2. Parse body
    // =====================================================
    const body = await req.json();

    // =====================================================
    // 3. Validate
    // =====================================================
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

    // =====================================================
    // 4. Prepare trusted checkout input
    // =====================================================
    // The DB is the source of truth for price/cost/stock.
    // Only item identity, quantity and gift metadata are sent.
    const items = payload.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      isGift: item.isGift,
      giftNote: item.giftNote ?? null,
    }));

    // =====================================================
    // 5. Atomic checkout
    // =====================================================
    const result = await completeSalesCheckout({
      branchId: MAIN_BRANCH_ID,
      cashierId,
      orderType: payload.orderType,
      customerId: payload.customerId ?? null,
      tailorId: payload.tailorId ?? null,
      discountAmount: payload.discountAmount,
      taxAmount: payload.taxAmount,
      paymentMethod: payload.paymentMethod,
      paymentSplits: payload.paymentSplits,
      notes: payload.notes ?? null,
      items,
    });

    // =====================================================
    // 6. Success
    // =====================================================
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
        remainingAmount: 0,
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

    return NextResponse.json(
      { message },
      { status: 400 },
    );
  }
}

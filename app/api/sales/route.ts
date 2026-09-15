import { NextRequest, NextResponse } from "next/server";

import { completeSalesCheckout } from "./_lib/sales-helper";

import { createSalesOrderSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

const MAIN_BRANCH_ID = process.env.MAIN_BRANCH_ID;

export async function POST(req: NextRequest) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        {
          error: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام",
        },
        { status: 500 },
      );
    }

    // ---------------------------------------------
    // 1. قراءة المستخدم من الجلسة / middleware
    // ---------------------------------------------

    const cashierId = req.headers.get("x-user-id");

    if (!cashierId) {
      return NextResponse.json(
        {
          error: "تعذر تحديد الكاشير الحالي",
        },
        { status: 401 },
      );
    }

    // ---------------------------------------------
    // 2. قراءة body
    // ---------------------------------------------

    const body = await req.json();

    // ---------------------------------------------
    // 3. Zod validation
    // ---------------------------------------------

    const validation = createSalesOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "بيانات البيع غير صالحة",
          details: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = validation.data;

    // ---------------------------------------------
    // 4. إعداد المنتجات للسيرفر
    // ---------------------------------------------
    //
    // unitPrice / unitCost / totalPrice
    // لا نستخدمها كمصدر للحقيقة.
    //
    // الـ RPC ستقرأ السعر والتكلفة من DB.
    //

    const items = payload.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    // ---------------------------------------------
    // 5. Mixed payment
    // ---------------------------------------------
    //
    // نقرأ paymentSplits من body.
    // إذا كان schema الحالي لا يحتوي عليه،
    // أضفه إليه كما في الملاحظة أسفل الكود.
    //

    const paymentSplits =
      "paymentSplits" in payload && Array.isArray(payload.paymentSplits)
        ? payload.paymentSplits
        : [];

    // ---------------------------------------------
    // 6. إتمام البيع
    // ---------------------------------------------

    const result = await completeSalesCheckout({
      cashierId,

      branchId: MAIN_BRANCH_ID,

      orderType: payload.orderType,

      customerId: payload.customerId ?? null,

      tailorId: payload.tailorId ?? null,

      discountAmount: payload.discountAmount,

      taxAmount: payload.taxAmount,

      paymentMethod: payload.paymentMethod,

      paymentSplits,

      notes: payload.notes ?? null,

      items,
    });

    // ---------------------------------------------
    // 7. Success
    // ---------------------------------------------

    return NextResponse.json(
      {
        message: "تمت عملية البيع بنجاح",

        orderId: result.id,

        orderNumber: result.orderNumber,

        subtotal: result.subtotal,

        discountAmount: result.discountAmount,

        taxAmount: result.taxAmount,

        totalAmount: result.totalAmount,

        paidAmount: result.paidAmount,

        paymentStatus: result.paymentStatus,

        status: result.status,

        createdAt: result.createdAt,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "حدث خطأ أثناء إتمام عملية البيع";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 },
    );
  }
}

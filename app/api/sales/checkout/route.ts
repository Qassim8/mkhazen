import { NextRequest, NextResponse } from "next/server";

import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePermission } from "@/lib/permissions-server";
import {
  apiError,
  dbErrorResponse,
  invalidJsonResponse,
  isDefiniteDbRejection,
  readJson,
} from "@/lib/api-response";
import { beginIdempotentOperation, readIdempotencyKey } from "@/lib/idempotency";
import { CheckoutRpcError, completeSalesCheckout } from "../_lib/sales-helper";
import { verifyCheckoutSubtotal, type PricingVariant } from "../_lib/checkout-pricing";
import { createSalesOrderSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

/**
 * POST /api/sales/checkout — إتمام بيع من الكاشير
 *
 * • البيع نفسه ذرّي داخل complete_sales_checkout (المخزون + البنود + الدفعات + القيود).
 * • Idempotency-Key: إعادة الإرسال (نقرتين / انقطاع الشبكة بعد الحفظ) بترجع نفس
 *   الفاتورة بدل بيع تاني.
 * • المجموع بيتراجع على أسعار قاعدة البيانات وسعر الصرف الحالي قبل التنفيذ.
 */
export async function POST(req: NextRequest) {
  // 1. Authentication + authorization (401 جلسة / 403 صلاحية)
  const guard = await requirePermission("sales.pos", "عذراً، البيع من الكاشير غير متاح لصلاحياتك.");
  if (!guard.ok) return guard.response;
  const cashierId = guard.session.userId;

  // 2. Parse + validate
  const body = await readJson(req);
  if (body === null) return invalidJsonResponse();

  const validation = createSalesOrderSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        message: "بيانات عملية البيع غير صحيحة.",
        code: "VALIDATION_ERROR",
        errors: validation.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const payload = validation.data;

  if (!payload.exchangeRate) {
    return apiError(422, "VALIDATION_ERROR", "سعر الصرف المعروض على الكاشير مطلوب. حدّث الصفحة.");
  }

  // 3. منع التكرار (قبل أي قراءة/كتابة مالية)
  const idempotency = await beginIdempotentOperation({
    scope: "sales.checkout",
    userId: cashierId,
    clientKey: readIdempotencyKey(req),
    payload,
  });
  if (idempotency.kind === "response") return idempotency.response;

  let reachedCheckout = false;

  try {
    // 4. التحقق من الأسعار على قاعدة البيانات
    const variantIds = [...new Set(payload.items.map((item) => item.variantId))];

    const [variantsResult, rateResult] = await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select('id, "sellingPrice", "isActive", template:product_templates!inner ( "isActive" )')
        .in("id", variantIds),
      supabaseAdmin
        .from("exchange_rates")
        .select("rate")
        .eq("branch_id", MAIN_BRANCH_ID)
        .lte("effective_at", new Date().toISOString())
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (variantsResult.error || rateResult.error) {
      await idempotency.abandon();
      return dbErrorResponse(variantsResult.error ?? rateResult.error, "checkout pricing", "تعذر التحقق من أسعار السلة.");
    }

    const currentRate = Number(rateResult.data?.rate ?? 0);
    if (!(currentRate > 0)) {
      await idempotency.abandon();
      return apiError(409, "BUSINESS_RULE", "لا يوجد سعر صرف مسجّل. اطلب من المدير تسجيله من الإعدادات.");
    }

    if (Math.abs(currentRate - payload.exchangeRate) > 1e-9) {
      await idempotency.abandon();
      return apiError(
        409,
        "BUSINESS_RULE",
        "تغيّر سعر الصرف أثناء البيع. تم تحديث الأسعار، راجع الإجمالي وأعد المحاولة.",
      );
    }

    const variants = new Map<string, PricingVariant>();
    for (const row of (variantsResult.data ?? []) as Array<{
      id: string;
      sellingPrice: number | string | null;
      isActive: boolean | null;
      template: { isActive?: boolean | null } | { isActive?: boolean | null }[] | null;
    }>) {
      const template = Array.isArray(row.template) ? row.template[0] : row.template;
      variants.set(row.id, {
        sellingPrice: Number(row.sellingPrice ?? 0),
        isActive: row.isActive !== false && template?.isActive !== false,
      });
    }

    const pricing = verifyCheckoutSubtotal({
      items: payload.items,
      variants,
      rate: currentRate,
      clientSubtotal: payload.subtotal,
    });

    if (!pricing.ok) {
      await idempotency.abandon();
      // الأسعار الحالية بترجع للكاشير عشان يحدّث السلة من غير ما يعيد إضافة المنتجات
      const currentPrices = Object.fromEntries(
        [...variants.entries()]
          .filter(([, variant]) => variant.isActive)
          .map(([id, variant]) => [id, variant.sellingPrice]),
      );
      return apiError(409, "BUSINESS_RULE", pricing.message, { errors: { currentPrices } });
    }

    // 5. البيع (ذرّي في قاعدة البيانات)
    let result;
    reachedCheckout = true;
    try {
      result = await completeSalesCheckout({
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
        items: payload.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          isGift: item.isGift,
          giftNote: item.giftNote ?? null,
        })),
        expectedExchangeRate: payload.exchangeRate,
      });
    } catch (error) {
      if (error instanceof CheckoutRpcError && isDefiniteDbRejection(error.dbError)) {
        // قاعدة البيانات رفضت → المعاملة اترجعت بالكامل → نحرر المفتاح
        await idempotency.abandon();
        return dbErrorResponse(error.dbError, "complete_sales_checkout", "تعذر إتمام عملية البيع.");
      }

      // نتيجة غير معروفة (انقطاع اتصال بعد الإرسال): ممكن البيع يكون اتسجل.
      // المفتاح بيفضل محجوز → أي إعادة إرسال بنفس السلة بتترفض بدل بيع مكرر.
      console.error("POST /api/sales/checkout unknown outcome:", error);
      return apiError(
        503,
        "SERVICE_UNAVAILABLE",
        "تعذر التأكد من إتمام عملية البيع بسبب مشكلة في الاتصال. راجع آخر المبيعات قبل إعادة المحاولة.",
      );
    }

    const responseBody = {
      message: "تمت عملية البيع بنجاح.",
      orderId: result.id,
      orderNumber: result.orderNumber,
      subtotal: result.subtotal,
      discountAmount: result.discountAmount,
      taxAmount: result.taxAmount,
      totalAmount: result.totalAmount,
      totalAmountUsd: result.totalAmountUsd,
      exchangeRateUsed: result.exchangeRateUsed,
      paidAmount: result.paidAmount,
      remainingAmount: 0,
      paymentStatus: result.paymentStatus,
      paymentMethod: result.paymentMethod,
      status: result.status,
      createdAt: result.createdAt,
    };

    await idempotency.finish(201, responseBody);

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/sales/checkout error:", error);
    // فشل قبل إرسال البيع لقاعدة البيانات → مفيش أي أثر → نحرر المفتاح
    if (!reachedCheckout) await idempotency.abandon();
    return apiError(500, "INTERNAL_ERROR", "حدث خطأ أثناء إتمام عملية البيع. راجع آخر المبيعات قبل إعادة المحاولة.");
  }
}

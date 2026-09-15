import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  generateInvoiceNumber,
  processInventoryDeduction,
  createSalesJournalEntries,
} from "../_lib/sales-helper";
import { createSalesOrderSchema } from "@/app/dashboard/pos/schemas/pos.schemas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. التحقق من المدخلات باستخدام Zod
    const validation = createSalesOrderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.flatten() },
        { status: 400 },
      );
    }

    const payload = validation.data;
    const cashierId = payload.cashierId || req.headers.get("x-user-id");

    if (!cashierId) {
      return NextResponse.json(
        { error: "معرف الكاشير مطلوب" },
        { status: 401 },
      );
    }

    // 2. توليد رقم الفاتورة
    const orderNumber = await generateInvoiceNumber(supabase);

    // 3. إنشاء سجل الفاتورة الرئيسي في sales_orders
    const { data: order, error: orderError } = await supabase
      .from("sales_orders")
      .insert({
        order_number: orderNumber,
        branch_id: payload.branchId,
        cashier_id: cashierId,
        subtotal: payload.subtotal,
        discount_amount: payload.discountAmount,
        tax_amount: payload.taxAmount,
        total_amount: payload.totalAmount,
        payment_method: payload.paymentMethod,
        payment_status: "PAID",
        status: "COMPLETED",
        notes: payload.notes,
      })
      .select("id, order_number, created_at")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `فشل إنشاء طلب البيع: ${orderError?.message}` },
        { status: 500 },
      );
    }

    // 4. إنشاء بنود الفاتورة في sales_order_items
    const orderItems = payload.items.map((item) => ({
      sales_order_id: order.id,
      template_id: item.templateId,
      variant_id: item.variantId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      unit_cost: item.unitCost,
      total_price: item.totalPrice,
    }));

    const { error: itemsError } = await supabase
      .from("sales_order_items")
      .insert(orderItems);

    if (itemsError) {
      // إغلاق الفاتورة وتغيير حالتها في حال الفشل
      await supabase
        .from("sales_orders")
        .update({ status: "CANCELLED" })
        .eq("id", order.id);
      return NextResponse.json(
        { error: `فشل تسجيل بنود الفاتورة: ${itemsError.message}` },
        { status: 500 },
      );
    }

    // 5. خصم المخزون وتسجيل حركات المخزن
    try {
      await processInventoryDeduction(
        supabase,
        order.id,
        payload.branchId,
        cashierId,
        payload.items,
      );
    } catch (invError: any) {
      await supabase
        .from("sales_orders")
        .update({ status: "CANCELLED" })
        .eq("id", order.id);
      return NextResponse.json({ error: invError.message }, { status: 400 });
    }

    // 6. إنشاء القيود المحاسبية المزدوجة
    try {
      await createSalesJournalEntries(
        supabase,
        order.id,
        order.order_number,
        payload.branchId,
        cashierId,
        payload.totalAmount,
        payload.items,
        payload.paymentMethod,
      );
    } catch (journalError: any) {
      return NextResponse.json(
        {
          error: `تم إنشاء الفاتورة ولكن فشل تسجيل القيد: ${journalError.message}`,
        },
        { status: 500 },
      );
    }

    // 7. إرجاع بيانات الاستجابة للفاتورة
    return NextResponse.json(
      {
        message: "تمت عملية البيع بنجاح",
        orderId: order.id,
        orderNumber: order.order_number,
        createdAt: order.created_at,
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "خطأ أثناء المعالجة" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import {
  createPurchaseOrderSchema,
  purchaseQuerySchema,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allocateDeliveryCost,
  mapPurchaseOrder,
  notifyOwnerForDraft,
  processPurchaseReceipt,
  PURCHASE_ORDER_SELECT,
} from "./_lib/purchase-order";

/* =========================================================
   GET
========================================================= */

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);

    const parsed = purchaseQuerySchema.safeParse({
      page: searchParams.get("page"),

      limit: searchParams.get("limit"),

      search: searchParams.get("search") || undefined,

      status: searchParams.get("status") || undefined,

      purchaseType: searchParams.get("purchaseType") || undefined,

      paymentStatus: searchParams.get("paymentStatus") || undefined,

      supplierId: searchParams.get("supplierId") || undefined,

      sort: searchParams.get("sort") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "معاملات الطلب غير صحيحة",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      page,
      limit,
      search,
      status,
      purchaseType,
      paymentStatus,
      supplierId,
      sort,
    } = parsed.data;

    const sortMap = {
      date_desc: {
        column: "order_date",
        ascending: false,
      },
      date_asc: {
        column: "order_date",
        ascending: true,
      },
      total_desc: {
        column: "total_amount",
        ascending: false,
      },
      total_asc: {
        column: "total_amount",
        ascending: true,
      },
    } as const;

    const currentSort = sortMap[sort];

    /* =======================================================
       PAYMENT STATUS FILTER

       Because payment status is derived from payment rows,
       get matching order IDs first.
    ======================================================= */

    let paymentOrderIds: string[] | null = null;

    if (paymentStatus && paymentStatus !== "ALL") {
      const { data: allOrders, error: allOrdersError } = await supabaseAdmin
        .from("purchase_orders")
        .select("id, total_amount");

      if (allOrdersError) {
        return NextResponse.json(
          {
            message: "تعذر قراءة بيانات حالة الدفع",
          },
          { status: 500 },
        );
      }

      const { data: allPayments, error: paymentsError } = await supabaseAdmin
        .from("purchase_order_payments")
        .select("purchase_order_id, amount");

      if (paymentsError) {
        return NextResponse.json(
          {
            message: "تعذر قراءة دفعات المشتريات",
          },
          { status: 500 },
        );
      }

      const paidMap = new Map<string, number>();

      for (const payment of allPayments ?? []) {
        paidMap.set(
          payment.purchase_order_id,
          (paidMap.get(payment.purchase_order_id) ?? 0) +
            Number(payment.amount ?? 0),
        );
      }

      paymentOrderIds = (allOrders ?? [])
        .filter((order) => {
          const total = Number(order.total_amount ?? 0);

          const paid = paidMap.get(order.id) ?? 0;

          const calculatedStatus =
            paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIAL";

          return calculatedStatus === paymentStatus;
        })
        .map((order) => order.id);

      if (paymentOrderIds.length === 0) {
        return NextResponse.json({
          data: [],
          meta: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        });
      }
    }

    /* =======================================================
       MAIN QUERY
    ======================================================= */

    let query = supabaseAdmin
      .from("purchase_orders")
      .select(PURCHASE_ORDER_SELECT, {
        count: "exact",
      });

    if (search) {
      query = query.ilike("order_number", `%${search}%`);
    }

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    if (purchaseType && purchaseType !== "ALL") {
      query = query.eq("purchase_type", purchaseType);
    }

    if (supplierId) {
      query = query.eq("supplier_id", supplierId);
    }

    if (paymentOrderIds) {
      query = query.in("id", paymentOrderIds);
    }

    const from = (page - 1) * limit;

    const to = from + limit - 1;

    const { data, count, error } = await query
      .order(currentSort.column, {
        ascending: currentSort.ascending,
      })
      .range(from, to);

    if (error) {
      console.error("Purchase orders GET:", error);

      return NextResponse.json(
        {
          message: "حدث خطأ أثناء جلب طلبات الشراء",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: (data ?? []).map((order) =>
        mapPurchaseOrder(order as Record<string, unknown>),
      ),

      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("Purchase orders GET unexpected:", error);

    return NextResponse.json(
      {
        message: "خطأ غير متوقع في السيرفر",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(request: Request) {
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

    const body = await request.json();

    if (body.supplierId === "") {
      body.supplierId = null;
    }

    if (body.expectedDate === "") {
      body.expectedDate = null;
    }

    const validation = createPurchaseOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "خطأ في البيانات المدخلة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      supplierId,
      orderNumber,
      purchaseType,
      orderDate,
      expectedDate,
      notes,
      items,
      deliveryCost,
      discountAmount,
    } = validation.data;

    const isDirect = purchaseType === "DIRECT";

    const finalStatus = isDirect ? "RECEIVED" : "DRAFT";

    /* =====================================================
       SUPPLIER
    ===================================================== */

    if (supplierId) {
      const { data: supplier, error: supplierError } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .eq("id", supplierId)
        .single();

      if (supplierError || !supplier) {
        return NextResponse.json(
          {
            message: "المورد المحدد غير موجود",
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       TOTAL
    ===================================================== */

    const itemsSubtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const totalAmount = Number(
      Math.max(0, itemsSubtotal + deliveryCost - discountAmount).toFixed(2),
    );

    if (totalAmount <= 0) {
      return NextResponse.json(
        {
          message: "إجمالي طلب الشراء يجب أن يكون أكبر من صفر",
        },
        { status: 400 },
      );
    }

    const finalOrderNumber =
      orderNumber || `PO-${Date.now().toString().slice(-8)}`;

    /* =====================================================
       CREATE ORDER
    ===================================================== */

    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("purchase_orders")
      .insert({
        order_number: finalOrderNumber,

        supplier_id: supplierId ?? null,

        status: finalStatus,

        purchase_type: purchaseType,

        order_date: orderDate,

        expected_date: expectedDate ?? null,

        subtotal: Number(itemsSubtotal.toFixed(2)),

        delivery_cost: deliveryCost,

        discount_amount: discountAmount,

        total_amount: totalAmount,

        notes: notes ?? null,

        created_by: user.userId ?? null,
      })
      .select()
      .single();

    if (orderError || !newOrder) {
      console.error("Create purchase order:", orderError);

      return NextResponse.json(
        {
          message: orderError?.message ?? "تعذر إنشاء طلب الشراء",
        },
        { status: 400 },
      );
    }

    /* =====================================================
       ALLOCATE COSTS
    ===================================================== */

    const allocated = allocateDeliveryCost(deliveryCost, items, discountAmount);

    const formattedItems = items.map((item, index) => {
      const deliveryData = allocated[index];

      const itemSubtotal = item.quantity * item.unitCost;

      return {
        purchase_order_id: newOrder.id,

        template_id: item.templateId,

        variant_id: item.variantId,

        quantity: item.quantity,

        received_quantity: 0,

        unit_cost: Number(item.unitCost.toFixed(2)),

        allocated_delivery_cost: deliveryData.allocatedDeliveryCost,

        effective_unit_cost: deliveryData.effectiveUnitCost,

        subtotal: Number(itemSubtotal.toFixed(2)),
      };
    });

    const { error: itemsError } = await supabaseAdmin
      .from("purchase_order_items")
      .insert(formattedItems);

    if (itemsError) {
      await supabaseAdmin
        .from("purchase_orders")
        .delete()
        .eq("id", newOrder.id);

      return NextResponse.json(
        {
          message: itemsError.message,
        },
        { status: 400 },
      );
    }

    /* =====================================================
       DIRECT PURCHASE
    ===================================================== */

    if (isDirect) {
      try {
        const { error: approveError } = await supabaseAdmin
          .from("purchase_orders")
          .update({
            status: "APPROVED",
          })
          .eq("id", newOrder.id);

        if (approveError) {
          throw new Error(approveError.message);
        }

        await processPurchaseReceipt(newOrder.id, user.userId);

        const { error: receiveError } = await supabaseAdmin
          .from("purchase_orders")
          .update({
            status: "RECEIVED",

            received_by: user.userId,

            updated_at: new Date().toISOString(),
          })
          .eq("id", newOrder.id);

        if (receiveError) {
          throw new Error("تم تحديث المخزون لكن تعذر تحديث حالة طلب الشراء");
        }
      } catch (receiptError) {
        console.error("Direct purchase receipt error:", receiptError);

        await supabaseAdmin
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", newOrder.id);

        await supabaseAdmin
          .from("purchase_orders")
          .delete()
          .eq("id", newOrder.id);

        return NextResponse.json(
          {
            message:
              receiptError instanceof Error
                ? receiptError.message
                : "تعذر استلام الشراء المباشر",
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       WORKFLOW DRAFT
    ===================================================== */

    if (purchaseType === "WORKFLOW") {
      await notifyOwnerForDraft(finalOrderNumber, newOrder.id);
    }

    /* =====================================================
       CACHE
    ===================================================== */

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    if (isDirect) {
      revalidateTag("products-list", "default");

      revalidatePath("/dashboard/products");

      revalidatePath("/dashboard/inventory");

      revalidatePath("/dashboard/accounting");

      revalidatePath("/dashboard/accounting/overview");
    }

    /* =====================================================
       RETURN
    ===================================================== */

    const { data: created } = await supabaseAdmin
      .from("purchase_orders")
      .select(PURCHASE_ORDER_SELECT)
      .eq("id", newOrder.id)
      .single();

    return NextResponse.json(
      {
        message: isDirect
          ? "تم تسجيل الشراء المباشر وزيادة المخزون بنجاح"
          : "تم حفظ طلب الشراء كمسودة وإرسال إشعار للموافقة",

        data: created
          ? mapPurchaseOrder(created as Record<string, unknown>)
          : null,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Purchase order POST:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ في معالجة طلب الشراء",
      },
      { status: 500 },
    );
  }
}

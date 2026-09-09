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

      supplierId: searchParams.get("supplierId") || undefined,
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

    const { page, limit, search, status, purchaseType, supplierId } =
      parsed.data;

    const from = (page - 1) * limit;

    const to = from + limit - 1;

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

    const { data, count, error } = await query
      .order("order_date", {
        ascending: false,
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

    /*
     * Server controls the initial status.
     */
    const isDirect = purchaseType === "DIRECT";

    const finalStatus = isDirect ? "RECEIVED" : "DRAFT";

    /* =====================================================
       Validate supplier
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
       Calculate subtotal
    ===================================================== */

    const itemsSubtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const totalAmount = Number(
      Math.max(0, itemsSubtotal + deliveryCost - discountAmount).toFixed(2),
    );

    const finalOrderNumber =
      orderNumber || `PO-${Date.now().toString().slice(-8)}`;

    /* =====================================================
       Insert order
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
       Delivery allocation

       IMPORTANT:
       Equal distribution between ITEMS.
    ===================================================== */

    const allocated = allocateDeliveryCost(deliveryCost, items);

    const formattedItems = items.map((item, index) => {
      const deliveryData = allocated[index];

      const itemSubtotal = item.quantity * item.unitCost;

      return {
        purchase_order_id: newOrder.id,

        template_id: item.templateId,

        variant_id: item.variantId,

        quantity: item.quantity,

        received_quantity: isDirect ? item.quantity : 0,

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
        /*
         * Make the receipt processor
         * think it is APPROVED internally.
         */
        await supabaseAdmin
          .from("purchase_orders")
          .update({
            status: "APPROVED",
          })
          .eq("id", newOrder.id);

        await processPurchaseReceipt(newOrder.id, user.userId);

        await supabaseAdmin
          .from("purchase_orders")
          .update({
            status: "RECEIVED",

            received_by: user.userId,

            updated_at: new Date().toISOString(),
          })
          .eq("id", newOrder.id);
      } catch (receiptError) {
        console.error("Direct purchase receipt error:", receiptError);

        /*
         * Cleanup because the direct purchase
         * did not complete successfully.
         */
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
    }

    /* =====================================================
       Return created order
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
          : "تم حفظ مسودة طلب الشراء وإخطار المدير للموافقة",

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
        message: "خطأ في معالجة طلب الشراء",
      },
      { status: 500 },
    );
  }
}

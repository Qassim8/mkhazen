import { NextResponse } from "next/server";

import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

import { updatePurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allocateDeliveryCost,
  calculatePurchaseTotal,
  canDeletePurchaseOrder,
  canEditPurchaseOrder,
  fetchPurchaseOrderById,
  PURCHASE_ORDER_SELECT,
} from "../_lib/purchase-order";

/* =========================================================
   GET
========================================================= */

export async function GET(
  _request: Request,
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

    const { data, error } = await fetchPurchaseOrderById(id);

    if (error || !data) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data,
    });
  } catch (error: unknown) {
    console.error("Purchase order GET:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   PATCH
========================================================= */

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

    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from("purchase_orders")
      .select("status, delivery_cost, discount_amount")
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

    if (!canEditPurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message: "لا يمكن تعديل طلب الشراء إلا عندما يكون مسودة",
        },
        { status: 400 },
      );
    }

    const body = await request.json();

    if (body.supplierId === "") {
      body.supplierId = null;
    }

    if (body.expectedDate === "") {
      body.expectedDate = null;
    }

    const validation = updatePurchaseOrderSchema.safeParse({
      ...body,
      id,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "بيانات التعديل غير صالحة",

          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const {
      supplierId,
      orderDate,
      expectedDate,
      notes,
      items,
      deliveryCost,
      discountAmount,
    } = validation.data;

    /* =====================================================
       Update order fields
    ===================================================== */

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (orderDate !== undefined) {
      updateData.order_date = orderDate;
    }

    if (expectedDate !== undefined) {
      updateData.expected_date = expectedDate;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (supplierId !== undefined) {
      updateData.supplier_id = supplierId;
    }

    const currentDeliveryCost = Number(existingOrder.delivery_cost ?? 0);

    const currentDiscount = Number(existingOrder.discount_amount ?? 0);

    const activeDeliveryCost =
      deliveryCost !== undefined ? Number(deliveryCost) : currentDeliveryCost;

    const activeDiscountAmount =
      discountAmount !== undefined ? Number(discountAmount) : currentDiscount;

    /* =====================================================
       If items are changed
    ===================================================== */

    if (items) {
      const itemsSubtotal = items.reduce(
        (sum, item) => sum + item.quantity * item.unitCost,
        0,
      );

      /*
       * Prevent negative final total.
       */
      const totalAmount = calculatePurchaseTotal(
        items,
        activeDeliveryCost,
        activeDiscountAmount,
      );

      updateData.subtotal = Number(itemsSubtotal.toFixed(2));

      updateData.total_amount = totalAmount;
    } else if (deliveryCost !== undefined || discountAmount !== undefined) {
      const { data: currentItems } = await supabaseAdmin
        .from("purchase_order_items")
        .select("quantity, unit_cost")
        .eq("purchase_order_id", id);

      const mappedItems = (currentItems ?? []).map((item) => ({
        quantity: Number(item.quantity),

        unitCost: Number(item.unit_cost),
      }));

      const itemsSubtotal = mappedItems.reduce(
        (sum, item) => sum + item.quantity * item.unitCost,
        0,
      );

      updateData.subtotal = Number(itemsSubtotal.toFixed(2));

      updateData.total_amount = calculatePurchaseTotal(
        mappedItems,
        activeDeliveryCost,
        activeDiscountAmount,
      );
    }

    /* =====================================================
       Update main order
    ===================================================== */

    const { error: orderUpdateError } = await supabaseAdmin
      .from("purchase_orders")
      .update(updateData)
      .eq("id", id);

    if (orderUpdateError) {
      return NextResponse.json(
        {
          message: orderUpdateError.message,
        },
        { status: 400 },
      );
    }

    /* =====================================================
       Replace items

       Safe because only DRAFT orders are editable.
    ===================================================== */

    if (items) {
      const { error: deleteItemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", id);

      if (deleteItemsError) {
        return NextResponse.json(
          {
            message: deleteItemsError.message,
          },
          { status: 400 },
        );
      }

      const allocated = allocateDeliveryCost(activeDeliveryCost, items);

      const formattedItems = items.map((item, index) => {
        const deliveryData = allocated[index];

        const itemSubtotal = item.quantity * item.unitCost;

        return {
          purchase_order_id: id,

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

      const { error: insertItemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .insert(formattedItems);

      if (insertItemsError) {
        return NextResponse.json(
          {
            message: insertItemsError.message,
          },
          { status: 400 },
        );
      }
    }

    /* =====================================================
       Cache
    ===================================================== */

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    const { data } = await fetchPurchaseOrderById(id);

    return NextResponse.json({
      message: "تم تحديث طلب الشراء بنجاح",

      data,
    });
  } catch (error: unknown) {
    console.error("Purchase order PATCH:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   DELETE
========================================================= */

export async function DELETE(
  _request: Request,
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

    const { data: existingOrder } = await supabaseAdmin
      .from("purchase_orders")
      .select("status")
      .eq("id", id)
      .single();

    if (!existingOrder) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        { status: 404 },
      );
    }

    if (!canDeletePurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message: "لا يمكن حذف طلب الشراء إلا عندما يكون مسودة",
        },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          message: error.message,
        },
        { status: 400 },
      );
    }

    revalidateTag("purchases-list", "default");

    revalidatePath("/dashboard/orders");

    return NextResponse.json({
      message: "تم حذف طلب الشراء بنجاح",
    });
  } catch (error: unknown) {
    console.error("Purchase order DELETE:", error);

    return NextResponse.json(
      {
        message: "خطأ في السيرفر",
      },
      { status: 500 },
    );
  }
}

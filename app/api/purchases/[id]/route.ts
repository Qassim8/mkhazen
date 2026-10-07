import { NextResponse } from "next/server";

import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

import { updatePurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allocateDeliveryCost,
  calculatePurchaseTotal,
  canDeletePurchaseOrder,
  canEditPurchaseOrder,
  fetchPurchaseOrderById,
  normalizeConversionFactor,
} from "../_lib/purchase-order";

/* =========================================================
   HELPERS
========================================================= */

async function getPurchaseItemMeta(
  items: {
    id?: string;
    templateId: string;
    variantId: string;
    quantity: number;
    unitCost: number;
  }[],
) {
  const variantIds = [...new Set(items.map((item) => item.variantId))];

  const { data, error } = await supabaseAdmin
    .from("product_variants")
    .select(
      `
        id,
        "templateId",
        isActive,
        product_templates (
          id,
          isActive,
          "purchaseUnit",
          "sellingUnit",
          "conversionFactor"
        )
      `,
    )
    .in("id", variantIds);

  if (error) {
    throw new Error(`تعذر التحقق من وحدات المنتجات: ${error.message}`);
  }

  const map = new Map<
    string,
    {
      templateId: string;
      conversionFactor: number;
    }
  >();

  for (const row of data ?? []) {
    const template = Array.isArray(row.product_templates)
      ? row.product_templates[0]
      : row.product_templates;

    if (!row.isActive || !template || !template.isActive) {
      continue;
    }

    map.set(row.id, {
      templateId: row.templateId,

      conversionFactor: normalizeConversionFactor(template.conversionFactor),
    });
  }

  return items.map((item) => {
    const meta = map.get(item.variantId);

    if (!meta) {
      throw new Error("أحد المنتجات غير موجود أو غير نشط");
    }

    if (meta.templateId !== item.templateId) {
      throw new Error("متغير المنتج لا يتبع المنتج المحدد");
    }

    return {
      ...item,

      conversionFactor: meta.conversionFactor,
    };
  });
}

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

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
        },
        {
          status: 403,
        },
      );
    }

    const { id } = await params;

    const { data, error } = await fetchPurchaseOrderById(id);

    if (error || !data) {
      return NextResponse.json(
        {
          message: "طلب الشراء غير موجود",
        },
        {
          status: 404,
        },
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
      {
        status: 500,
      },
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

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
        },
        {
          status: 403,
        },
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
        {
          status: 404,
        },
      );
    }

    if (!canEditPurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message: "لا يمكن تعديل طلب الشراء إلا عندما يكون مسودة",
        },
        {
          status: 400,
        },
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
        {
          status: 422,
        },
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

    const currentDeliveryCost = Number(existingOrder.delivery_cost ?? 0);

    const currentDiscount = Number(existingOrder.discount_amount ?? 0);

    const activeDeliveryCost =
      deliveryCost !== undefined ? Number(deliveryCost) : currentDeliveryCost;

    const activeDiscountAmount =
      discountAmount !== undefined ? Number(discountAmount) : currentDiscount;

    /* =====================================================
       BASIC ORDER FIELDS
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

    /* =====================================================
       GET CURRENT ITEMS WHEN NECESSARY
    ===================================================== */

    let sourceItems: {
      id?: string;
      templateId: string;
      variantId: string;
      quantity: number;
      unitCost: number;
    }[];

    if (items) {
      sourceItems = items.map((item) => ({
        templateId: item.templateId,

        variantId: item.variantId,

        quantity: item.quantity,

        unitCost: item.unitCost,
      }));
    } else {
      const { data: currentItems, error: currentItemsError } =
        await supabaseAdmin
          .from("purchase_order_items")
          .select("id, template_id, variant_id, quantity, unit_cost")
          .eq("purchase_order_id", id);

      if (currentItemsError) {
        return NextResponse.json(
          {
            message: currentItemsError.message,
          },
          {
            status: 400,
          },
        );
      }

      sourceItems = (currentItems ?? []).map((item) => ({
        id: item.id,

        templateId: item.template_id,

        variantId: item.variant_id,

        quantity: Number(item.quantity ?? 0),

        unitCost: Number(item.unit_cost ?? 0),
      }));
    }

    if (sourceItems.length === 0) {
      return NextResponse.json(
        {
          message: "يجب أن يحتوي الطلب على بند واحد على الأقل",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       RESOLVE CONVERSION FACTORS
    ===================================================== */

    const normalizedItems = await getPurchaseItemMeta(sourceItems);

    /* =====================================================
       TOTAL

       Still based on purchase units.
    ===================================================== */

    const itemsSubtotal = normalizedItems.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const totalAmount = calculatePurchaseTotal(
      normalizedItems,
      activeDeliveryCost,
      activeDiscountAmount,
    );

    updateData.subtotal = Number(itemsSubtotal.toFixed(2));

    updateData.delivery_cost = Number(activeDeliveryCost.toFixed(2));

    updateData.discount_amount = Number(activeDiscountAmount.toFixed(2));

    updateData.total_amount = totalAmount;

    /* =====================================================
       UPDATE MAIN ORDER
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
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       RECALCULATE COST ALLOCATION
    ===================================================== */

    const allocated = allocateDeliveryCost(
      activeDeliveryCost,
      normalizedItems,
      activeDiscountAmount,
    );

    /* =====================================================
       IF ITEMS CHANGED
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
          {
            status: 400,
          },
        );
      }

      const formattedItems = normalizedItems.map((item, index) => {
        const costData = allocated[index];

        return {
          purchase_order_id: id,

          template_id: item.templateId,

          variant_id: item.variantId,

          quantity: item.quantity,

          received_quantity: 0,

          unit_cost: Number(item.unitCost.toFixed(2)),

          allocated_delivery_cost: costData.allocatedDeliveryCost,

          effective_unit_cost: costData.effectiveUnitCost,

          subtotal: Number((item.quantity * item.unitCost).toFixed(2)),
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
          {
            status: 400,
          },
        );
      }
    } else {
      /* ===================================================
         ONLY DELIVERY / DISCOUNT CHANGED

         Recalculate every existing item.
      =================================================== */

      for (let index = 0; index < normalizedItems.length; index++) {
        const item = normalizedItems[index];

        const costData = allocated[index];

        if (!item.id) {
          continue;
        }

        const { error: updateItemError } = await supabaseAdmin
          .from("purchase_order_items")
          .update({
            allocated_delivery_cost: costData.allocatedDeliveryCost,

            effective_unit_cost: costData.effectiveUnitCost,

            subtotal: Number((item.quantity * item.unitCost).toFixed(2)),
          })
          .eq("id", item.id);

        if (updateItemError) {
          return NextResponse.json(
            {
              message: updateItemError.message,
            },
            {
              status: 400,
            },
          );
        }
      }
    }

    /* =====================================================
       CACHE
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
        message: error instanceof Error ? error.message : "خطأ في السيرفر",
      },
      {
        status: 500,
      },
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

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
        },
        {
          status: 403,
        },
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
        {
          status: 404,
        },
      );
    }

    if (!canDeletePurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message: "لا يمكن حذف طلب الشراء إلا عندما يكون مسودة",
        },
        {
          status: 400,
        },
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
        {
          status: 400,
        },
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
      {
        status: 500,
      },
    );
  }
}

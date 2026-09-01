import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { updatePurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";
import {
  calculatePurchaseTotal,
  canDeletePurchaseOrder,
  canEditPurchaseOrder,
  fetchPurchaseOrderById,
} from "../_lib/purchase-order";

export async function GET(
  _request: Request,
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

    const { data, error } = await fetchPurchaseOrderById(id);

    if (error || !data) {
      return NextResponse.json(
        { message: "طلب الشراء غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
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

    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from("purchase_orders")
      .select("status")
      .eq("id", id)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json(
        { message: "طلب الشراء غير موجود" },
        { status: 404 },
      );
    }

    if (!canEditPurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message:
            "لا يمكن تعديل الطلب إلا وهو مسودة. الشراء المباشر والمعتمد والمستلم غير قابل للتعديل.",
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    if (body.supplierId === "") body.supplierId = null;
    if (body.expectedDate === "") body.expectedDate = null;

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

    const { expectedDate, notes, supplierId, items, orderDate, deliveryCost } =
      validation.data;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (orderDate !== undefined) updateData.order_date = orderDate;
    if (expectedDate !== undefined) updateData.expected_date = expectedDate;
    if (notes !== undefined) updateData.notes = notes;
    if (supplierId !== undefined) updateData.supplier_id = supplierId || null;
    if (deliveryCost !== undefined) updateData.delivery_cost = deliveryCost;

    if (items) {
      const shipping =
        deliveryCost !== undefined
          ? Number(deliveryCost)
          : Number(
              (
                await supabaseAdmin
                  .from("purchase_orders")
                  .select("delivery_cost")
                  .eq("id", id)
                  .single()
              ).data?.delivery_cost || 0,
            );
      updateData.total_amount = calculatePurchaseTotal(items, shipping);
    } else if (deliveryCost !== undefined) {
      const { data: currentItems } = await supabaseAdmin
        .from("purchase_order_items")
        .select("quantity, unit_cost")
        .eq("purchase_order_id", id);
      updateData.total_amount = calculatePurchaseTotal(
        (currentItems || []).map((item) => ({
          quantity: Number(item.quantity),
          unitCost: Number(item.unit_cost),
        })),
        Number(deliveryCost),
      );
    }

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (items) {
      await supabaseAdmin
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", id);

      const { error: insertItemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .insert(
          items.map((item) => ({
            purchase_order_id: id,
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
            subtotal: item.quantity * item.unitCost,
            received_quantity: 0,
          })),
        );

      if (insertItemsError) {
        return NextResponse.json(
          { message: insertItemsError.message },
          { status: 400 },
        );
      }
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");

    const { data: mapped } = await fetchPurchaseOrderById(id);

    return NextResponse.json(
      {
        message: "تم تحديث طلب الشراء بنجاح",
        data: mapped,
      },
      { status: 200 },
    );
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

export async function DELETE(
  _request: Request,
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

    const { data: existingOrder } = await supabaseAdmin
      .from("purchase_orders")
      .select("status")
      .eq("id", id)
      .single();

    if (!existingOrder) {
      return NextResponse.json(
        { message: "طلب الشراء غير موجود" },
        { status: 404 },
      );
    }

    if (!canDeletePurchaseOrder(existingOrder.status)) {
      return NextResponse.json(
        {
          message:
            "لا يمكن حذف الطلب إلا وهو مسودة. بعد الموافقة أو الشراء المباشر لا يمكن الحذف.",
        },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("purchase_orders")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");

    return NextResponse.json(
      { message: "تم حذف طلب الشراء بنجاح" },
      { status: 200 },
    );
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

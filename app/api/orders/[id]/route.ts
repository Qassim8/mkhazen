import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { updatePurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

// GET: جلب تفاصيل طلب شراء واحد
export async function GET(
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

    const { data, error } = await supabaseAdmin
      .from("purchase_orders")
      .select(
        `
        *,
        suppliers (id, name),
        purchase_order_items (
          id,
          productId:product_id,
          quantity,
          unitCost:unit_cost,
          subtotal,
          receivedQuantity:received_quantity,
          products (id, name, barcode)
        )
      `,
      )
      .eq("id", id)
      .single();

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

// PATCH: تعديل الطلب أو تغيير الحالة
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

    const body = await request.json();
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

    const { status, expectedDate, notes, supplierId, items } = validation.data;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (expectedDate !== undefined) updateData.expected_date = expectedDate;
    if (notes !== undefined) updateData.notes = notes;
    if (supplierId !== undefined) {
      updateData.supplier_id = supplierId || null;
    }

    const { data, error } = await supabaseAdmin
      .from("purchase_orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (items) {
      const { error: deleteItemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", id);
      if (deleteItemsError) {
        return NextResponse.json(
          { message: deleteItemsError.message },
          { status: 400 },
        );
      }

      const { error: insertItemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .insert(
          items.map((item) => ({
            purchase_order_id: id,
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
            subtotal: item.quantity * item.unitCost,
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

    return NextResponse.json(
      { message: "تم تحديث طلب الشراء بنجاح", data },
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

// DELETE: حذف طلب الشراء (للمسودات DRAFT فقط)
export async function DELETE(
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

    // التأكد من حالة الطلب قبل الحذف
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

    if (existingOrder.status !== "DRAFT") {
      return NextResponse.json(
        { message: "لا يمكن حذف طلب شراء معتمد أو مستلم، يمكنك الغاؤه فقط" },
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

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { createPurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";
import {
  calculatePurchaseTotal,
  mapPurchaseOrder,
  notifyOwnerForDraft,
  processPurchaseReceipt,
} from "./_lib/purchase-order";

export async function GET(request: Request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    const sort = searchParams.get("sort") || "date_desc";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") || "10")),
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("purchase_orders")
      .select(
        `*, suppliers(id, name), purchase_order_items(id, product_id, quantity, unit_cost, subtotal, received_quantity, products(id, name, barcode))`,
        { count: "exact" },
      );

    if (search) query = query.ilike("order_number", `%${search}%`);
    if (status && status !== "ALL") query = query.eq("status", status);
    if (supplierId) query = query.eq("supplier_id", supplierId);

    const sortColumn = sort.startsWith("total") ? "total_amount" : "order_date";
    const ascending = sort.endsWith("asc");
    const { data, count, error } = await query
      .order(sortColumn, { ascending })
      .range(from, to);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: (data || []).map((order) =>
        mapPurchaseOrder(order as Record<string, unknown>),
      ),
      meta: {
        totalCount: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
        currentPage: page,
        limit,
      },
    });
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

export async function POST(request: Request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { message: "عذراً، هذه الصلاحية مقتصرة على المدير فقط" },
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
      orderDate,
      expectedDate,
      notes,
      items,
      status,
      deliveryCost,
    } = validation.data;
    const isDirect = status === "DIRECT";
    const initialStatus = isDirect ? "DIRECT" : "DRAFT";
    const shipping = Number(deliveryCost || 0);

    const formattedItems = items.map((item) => {
      const itemSubtotal = item.quantity * item.unitCost;
      return {
        product_id: item.productId,
        quantity: item.quantity,
        unit_cost: item.unitCost,
        subtotal: itemSubtotal,
        received_quantity: 0,
      };
    });

    const calculatedTotal = calculatePurchaseTotal(items, shipping);
    const finalOrderNumber =
      orderNumber || `PO-${Date.now().toString().slice(-6)}`;

    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("purchase_orders")
      .insert([
        {
          order_number: finalOrderNumber,
          supplier_id: supplierId || null,
          status: initialStatus,
          order_date: orderDate,
          expected_date: expectedDate || null,
          delivery_cost: shipping,
          total_amount: calculatedTotal,
          notes: notes || null,
        },
      ])
      .select()
      .single();

    if (orderError) {
      return NextResponse.json(
        { message: orderError.message },
        { status: 400 },
      );
    }

    const { error: itemsError } = await supabaseAdmin
      .from("purchase_order_items")
      .insert(
        formattedItems.map((item) => ({
          ...item,
          purchase_order_id: newOrder.id,
        })),
      );

    if (itemsError) {
      await supabaseAdmin
        .from("purchase_orders")
        .delete()
        .eq("id", newOrder.id);

      return NextResponse.json(
        { message: itemsError.message },
        { status: 400 },
      );
    }

    if (isDirect) {
      try {
        await processPurchaseReceipt(newOrder.id);
      } catch (receiptError) {
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
                : "تعذر زيادة المخزون وتسجيل القيد، لم يتم إنشاء طلب الشراء",
          },
          { status: 500 },
        );
      }
    } else {
      await notifyOwnerForDraft(finalOrderNumber, newOrder.id);
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");
    if (isDirect) {
      revalidateTag("products-list", "default");
      revalidatePath("/dashboard/products");
      revalidatePath("/dashboard/inventory");
      revalidatePath("/dashboard/accounting");
    }

    const { data: created } = await supabaseAdmin
      .from("purchase_orders")
      .select(
        `*, suppliers(id, name), purchase_order_items(id, product_id, quantity, unit_cost, subtotal, received_quantity, products(id, name, barcode))`,
      )
      .eq("id", newOrder.id)
      .single();

    return NextResponse.json(
      {
        message: isDirect
          ? "تم الشراء المباشر وزيادة المخزون وتسجيل القيد المحاسبي"
          : "تم حفظ مسودة طلب الشراء وإخطار المالك للموافقة",
        data: created
          ? mapPurchaseOrder(created as Record<string, unknown>)
          : mapPurchaseOrder(newOrder as Record<string, unknown>),
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        message: "خطأ في معالجة الطلب",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

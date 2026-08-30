import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { createPurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";

// GET: جلب قائمة طلبات الشراء مع الفلترة والبحث
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

    const sortColumn = sort.startsWith("total") ? "total_amount" : "created_at";
    const ascending = sort.endsWith("asc");
    const { data, count, error } = await query
      .order(sortColumn, { ascending })
      .range(from, to);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const formattedData = (data || []).map((order) => {
      const rawOrder = order as Record<string, unknown>;
      const supplier = rawOrder.suppliers as { name?: string } | null;
      const rawItems = (rawOrder.purchase_order_items || []) as Record<
        string,
        unknown
      >[];
      return {
        id: rawOrder.id,
        orderNumber: rawOrder.order_number,
        supplierId: rawOrder.supplier_id,
        supplierName: supplier?.name || "غير محدد",
        status: rawOrder.status,
        orderDate: rawOrder.order_date || rawOrder.created_at,
        expectedDate: rawOrder.expected_date,
        totalAmount: rawOrder.total_amount,
        notes: rawOrder.notes,
        createdAt: rawOrder.created_at,
        updatedAt: rawOrder.updated_at,
        items: rawItems.map((item) => {
          const product = item.products as {
            name?: string;
            barcode?: string;
          } | null;
          return {
            id: item.id,
            purchaseOrderId: rawOrder.id,
            productId: item.product_id,
            productName: product?.name,
            productBarcode: product?.barcode,
            quantity: item.quantity,
            unitCost: item.unit_cost,
            subtotal: item.subtotal,
            receivedQuantity: item.received_quantity || 0,
          };
        }),
      };
    });

    return NextResponse.json({
      data: formattedData,
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

// POST: إنشاء طلب شراء جديد
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

    // معالجة صريحة للـ supplierId قبل الـ Validation
    if (body.supplierId === "") {
      body.supplierId = null;
    }

    const validation = createPurchaseOrderSchema.safeParse(body);

    if (!validation.success) {
      console.error("Zod Validation Error:", validation.error.flatten());
      return NextResponse.json(
        {
          message: "خطأ في البيانات المدخلة",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { supplierId, orderNumber, expectedDate, notes, items } =
      validation.data;

    let calculatedTotal = 0;
    const formattedItems = items.map((item) => {
      const itemSubtotal = item.quantity * item.unitCost;
      calculatedTotal += itemSubtotal;
      return {
        product_id: item.productId,
        quantity: item.quantity,
        unit_cost: item.unitCost,
        subtotal: itemSubtotal,
      };
    });

    const finalOrderNumber =
      orderNumber || `ORD-${Date.now().toString().slice(-6)}`;

    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("purchase_orders")
      .insert([
        {
          order_number: finalOrderNumber,
          supplier_id: supplierId || null,
          status: "DRAFT",
          expected_date: expectedDate || new Date().toISOString().split("T")[0],
          total_amount: calculatedTotal,
          notes: notes || null,
        },
      ])
      .select()
      .single();

    if (orderError) {
      console.error("Supabase Order Error:", orderError);
      return NextResponse.json(
        { message: orderError.message },
        { status: 400 },
      );
    }

    const itemsToInsert = formattedItems.map((item) => ({
      ...item,
      purchase_order_id: newOrder.id,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("purchase_order_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error("Supabase Items Error:", itemsError);
      await supabaseAdmin
        .from("purchase_orders")
        .delete()
        .eq("id", newOrder.id);

      return NextResponse.json(
        { message: itemsError.message },
        { status: 400 },
      );
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");

    return NextResponse.json(
      { message: "تمت إضافة طلب الشراء بنجاح", data: newOrder },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("Server Error:", err);
    return NextResponse.json(
      {
        message: "خطأ في معالجة الطلب",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

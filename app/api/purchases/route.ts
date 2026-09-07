import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { createPurchaseOrderSchema } from "@/app/dashboard/orders/schemas/orders.schemas";
import {
  mapPurchaseOrder,
  notifyOwnerForDraft,
  processPurchaseReceipt,
  PURCHASE_ORDER_SELECT,
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
    const purchaseType = searchParams.get("purchaseType");
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
      .select(PURCHASE_ORDER_SELECT, { count: "exact" });

    if (search) query = query.ilike("order_number", `%${search}%`);
    if (status && status !== "ALL") query = query.eq("status", status);
    if (purchaseType && purchaseType !== "ALL")
      query = query.eq("purchase_type", purchaseType);
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
    if (body.supplierId === "") body.supplierId = null;
    if (body.expectedDate === "") body.expectedDate = null;

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
      status,
      deliveryCost = 0,
      discountAmount = 0,
    } = validation.data;

    const isDirect = purchaseType === "DIRECT";
    const finalStatus = isDirect ? "RECEIVED" : status;

    // 1. حساب الإجمالي الصافي
    const itemsSubtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );
    const totalAmount = itemsSubtotal + deliveryCost - discountAmount;

    const finalOrderNumber =
      orderNumber || `PO-${Date.now().toString().slice(-6)}`;

    // 2. إنشاء أمر الشراء الرئيسي
    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from("purchase_orders")
      .insert([
        {
          order_number: finalOrderNumber,
          supplier_id: supplierId || null,
          status: finalStatus,
          purchase_type: purchaseType,
          order_date: orderDate,
          expected_date: expectedDate || null,
          subtotal: itemsSubtotal,
          delivery_cost: deliveryCost,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          notes: notes || null,
          created_by: user.userId || null,
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

    // 3. تجهيز البنود وتحديد received_quantity بحسب نوع الطلب
    const formattedItems = items.map((item) => {
      const itemSubtotal = item.quantity * item.unitCost;
      const shareRatio = itemsSubtotal > 0 ? itemSubtotal / itemsSubtotal : 0;
      const allocatedDeliveryCost =
        item.quantity > 0 ? (deliveryCost * shareRatio) / item.quantity : 0;
      const effectiveUnitCost = item.unitCost + allocatedDeliveryCost;

      return {
        purchase_order_id: newOrder.id,
        template_id: item.templateId,
        variant_id: item.variantId,
        quantity: item.quantity,
        unit_cost: item.unitCost,
        allocated_delivery_cost: Number(allocatedDeliveryCost.toFixed(2)),
        effective_unit_cost: Number(effectiveUnitCost.toFixed(2)),
        subtotal: itemSubtotal,
        // في الشراء المباشر تعتبر الكمية مستلمة فورياً بكاملها
        received_quantity: isDirect ? item.quantity : 0,
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
        { message: itemsError.message },
        { status: 400 },
      );
    }

    // 4. المعالجة بحسب نوع الشراء
    if (isDirect) {
      try {
        await processPurchaseReceipt(newOrder.id, user.userId);
      } catch (receiptError) {
        // حذف الطلب والبنود المستحدثة في حال حدوث استثناء لضمان السلامة المرجعية (Rollback)
        await supabaseAdmin
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", newOrder.id);
        await supabaseAdmin
          .from("purchase_orders")
          .delete()
          .eq("id", newOrder.id);

        const errorMessage =
          receiptError instanceof Error
            ? receiptError.message
            : "تعذر زيادة المخزون وتسجيل الحركة، لم يتم إنشاء الطلب";

        console.error("Direct Purchase Error:", receiptError);

        return NextResponse.json(
          { message: errorMessage },
          { status: 400 }, // إرجاع status 400 بدلاً من 500 لإظهار الرسالة بوضوح للعميل
        );
      }
    } else if (finalStatus === "DRAFT") {
      await notifyOwnerForDraft(finalOrderNumber, newOrder.id);
    }

    revalidateTag("purchases-list", "default");
    revalidatePath("/dashboard/orders");
    if (isDirect) {
      revalidateTag("products-list", "default");
      revalidatePath("/dashboard/products");
      revalidatePath("/dashboard/inventory");
    }

    const { data: created } = await supabaseAdmin
      .from("purchase_orders")
      .select(PURCHASE_ORDER_SELECT)
      .eq("id", newOrder.id)
      .single();

    return NextResponse.json(
      {
        message: isDirect
          ? "تم الشراء المباشر وزيادة المخزون بنجاح"
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

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/permissions-server";
import { revalidatePath, revalidateTag } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase";
import { fetchAll, pageByAllowedIds } from "@/lib/supabase-fetch-all";
import { can } from "@/lib/permissions";

import {
  createPurchaseOrderSchema,
  purchaseQuerySchema,
} from "@/app/dashboard/orders/schemas/orders.schemas";

import {
  allocateDeliveryCost,
  mapPurchaseOrder,
  normalizeConversionFactor,
  notifyOwnerForDraft,
  processPurchaseReceipt,
  PurchaseRpcError,
  PURCHASE_ORDER_SELECT,
} from "./_lib/purchase-order";
import { apiError, dbErrorResponse, isDefiniteDbRejection } from "@/lib/api-response";

/* =========================================================
   HELPERS
========================================================= */

async function getPurchaseItemMeta(
  items: {
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

export async function GET(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
        },
        {
          status: 403,
        },
      );
    }

    const { searchParams } = new URL(request.url);

    const parsed = purchaseQuerySchema.safeParse({
      page: searchParams.get("page") || undefined,

      limit: searchParams.get("limit") || undefined,

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
        {
          status: 422,
        },
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

    // فلاتر الأعمدة العادية (نفسها في استعلام الصفحة واستعلام الـ IDs)
    const eqFilters: [string, string][] = [];
    if (status && status !== "ALL") eqFilters.push(["status", status]);
    if (purchaseType && purchaseType !== "ALL") eqFilters.push(["purchase_type", purchaseType]);
    if (supplierId) eqFilters.push(["supplier_id", supplierId]);
    const searchPattern = search ? `%${search}%` : null;

    let data: unknown[] | null;
    let count: number | null;

    if (paymentStatus && paymentStatus !== "ALL") {
      // حالة الدفع بتتحسب من الدفعات، فبنجيب الكل على دفعات (حد الـ 1000 صف)
      // وبنقسّم الصفحات في الكود بدل .in() بقائمة IDs طويلة
      try {
        const [allOrders, allPayments] = await Promise.all([
          fetchAll<{ id: string; total_amount: number | string | null }>((from, to) =>
            supabaseAdmin
              .from("purchase_orders")
              .select("id, total_amount")
              .order("id")
              .range(from, to),
          ),
          fetchAll<{ purchase_order_id: string; amount: number | string | null }>((from, to) =>
            supabaseAdmin
              .from("purchase_order_payments")
              .select("id, purchase_order_id, amount")
              .order("id")
              .range(from, to),
          ),
        ]);

        const paidMap = new Map<string, number>();
        for (const payment of allPayments) {
          paidMap.set(
            payment.purchase_order_id,
            (paidMap.get(payment.purchase_order_id) ?? 0) + Number(payment.amount ?? 0),
          );
        }

        const allowed = new Set(
          allOrders
            .filter((order) => {
              const total = Number(order.total_amount ?? 0);
              const paid = paidMap.get(order.id) ?? 0;
              const calculatedStatus =
                paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIAL";
              return calculatedStatus === paymentStatus;
            })
            .map((order) => order.id),
        );

        const result = await pageByAllowedIds<{ id: string }>({
          allowed,
          page,
          limit,
          orderedIds: (from, to) => {
            let idsQuery = supabaseAdmin.from("purchase_orders").select("id");
            if (searchPattern) idsQuery = idsQuery.ilike("order_number", searchPattern);
            for (const [column, value] of eqFilters) idsQuery = idsQuery.eq(column, value);
            return idsQuery
              .order(currentSort.column, { ascending: currentSort.ascending })
              .order("id")
              .range(from, to);
          },
          fetchRows: (ids) =>
            supabaseAdmin.from("purchase_orders").select(PURCHASE_ORDER_SELECT).in("id", ids),
        });

        data = result.rows;
        count = result.total;
      } catch (filterError) {
        console.error("Purchase orders payment filter:", filterError);
        return NextResponse.json(
          { message: "تعذر قراءة بيانات حالة الدفع" },
          { status: 500 },
        );
      }
    } else {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let pageQuery = supabaseAdmin
        .from("purchase_orders")
        .select(PURCHASE_ORDER_SELECT, { count: "exact" });
      if (searchPattern) pageQuery = pageQuery.ilike("order_number", searchPattern);
      for (const [column, value] of eqFilters) pageQuery = pageQuery.eq(column, value);

      const result = await pageQuery
        .order(currentSort.column, { ascending: currentSort.ascending })
        .order("id")
        .range(from, to);

      if (result.error) {
        console.error("Purchase orders GET:", result.error);
        return NextResponse.json(
          { message: "حدث خطأ أثناء جلب طلبات الشراء" },
          { status: 500 },
        );
      }

      data = result.data;
      count = result.count;
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
      {
        status: 500,
      },
    );
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(request: Request) {
  try {
    const guard = await requireLogin();
    if (!guard.ok) return guard.response;
    const user = guard.session;

    if (!user || !can(user.role, "purchases.manage")) {
      return NextResponse.json(
        {
          message: "عذراً، هذه الصلاحية غير متاحة لصلاحياتك",
          code: "FORBIDDEN",
        },
        {
          status: 403,
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

    const validation = createPurchaseOrderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: "خطأ في البيانات المدخلة",

          errors: validation.error.flatten().fieldErrors,
        },
        {
          status: 422,
        },
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

    // الشراء المباشر بيتسجل "معتمد" وبعدين بيتستلم ذرّيًا في قاعدة البيانات
    // (receive_purchase_order بيحوله RECEIVED مع المخزون والقيد في معاملة واحدة)
    const finalStatus = isDirect ? "APPROVED" : "DRAFT";

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
          {
            status: 400,
          },
        );
      }
    }

    /* =====================================================
       VALIDATE VARIANTS + GET CONVERSION FACTORS
    ===================================================== */

    const normalizedItems = await getPurchaseItemMeta(items);

    /* =====================================================
       PURCHASE TOTAL

       IMPORTANT:
       this remains in PURCHASE units.

       Example:
       1 carton × 600
       = subtotal 600
       + shipping 50
       = total 650
    ===================================================== */

    const itemsSubtotal = normalizedItems.reduce(
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
        {
          status: 400,
        },
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
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       ALLOCATE COSTS

       effectiveUnitCost is SELLING UNIT cost.
    ===================================================== */

    const allocated = allocateDeliveryCost(
      deliveryCost,
      normalizedItems,
      discountAmount,
    );

    const formattedItems = normalizedItems.map((item, index) => {
      const deliveryData = allocated[index];

      const itemSubtotal = item.quantity * item.unitCost;

      return {
        purchase_order_id: newOrder.id,

        template_id: item.templateId,

        variant_id: item.variantId,

        /*
         * purchase unit quantity
         */
        quantity: item.quantity,

        /*
         * also purchase unit quantity
         */
        received_quantity: 0,

        /*
         * purchase unit cost
         */
        unit_cost: Number(item.unitCost.toFixed(2)),

        /*
         * line's total shipping allocation
         */
        allocated_delivery_cost: deliveryData.allocatedDeliveryCost,

        /*
         * cost PER SELLING UNIT
         */
        effective_unit_cost: deliveryData.effectiveUnitCost,

        /*
         * purchase transaction line subtotal
         */
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
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       DIRECT PURCHASE
    ===================================================== */

    if (isDirect) {
      try {
        await processPurchaseReceipt(newOrder.id, user.userId);
      } catch (receiptError) {
        console.error("Direct purchase receipt error:", receiptError);

        // لو الدالة رجّعت خطأ من قاعدة البيانات فالمعاملة اترجعت بالكامل
        // (مفيش مخزون ولا قيد) → حذف الطلب المؤقت آمن.
        // لو الخطأ مش معروف (انقطاع اتصال) ممكن الاستلام يكون تم → ما نحذفش.
        if (receiptError instanceof PurchaseRpcError && isDefiniteDbRejection(receiptError.dbError)) {
          await supabaseAdmin
            .from("purchase_order_items")
            .delete()
            .eq("purchase_order_id", newOrder.id);

          await supabaseAdmin
            .from("purchase_orders")
            .delete()
            .eq("id", newOrder.id)
            .eq("status", "APPROVED");

          return dbErrorResponse(receiptError.dbError, "direct purchase receive", "تعذر استلام الشراء المباشر.");
        }

        return apiError(
          503,
          "SERVICE_UNAVAILABLE",
          `تعذر التأكد من إتمام الشراء المباشر ${finalOrderNumber}. راجع قائمة المشتريات قبل إعادة المحاولة.`,
        );
      }
    }

    /* =====================================================
       WORKFLOW DRAFT
    ===================================================== */

    // المالك نفسه مش محتاج إشعار يعتمد طلبه
    if (purchaseType === "WORKFLOW" && !can(user.role, "purchases.approve")) {
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
      {
        status: 201,
      },
    );
  } catch (error: unknown) {
    console.error("Purchase order POST:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "خطأ في معالجة طلب الشراء",
      },
      {
        status: 500,
      },
    );
  }
}

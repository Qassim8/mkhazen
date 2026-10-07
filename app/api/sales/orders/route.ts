import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

const salesOrdersQuerySchema = z.object({
  search: z.string().trim().max(100, "عبارة البحث طويلة جدًا").optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MIXED"]).optional(),
  orderType: z.enum(["POS", "TAILORING"]).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ البداية غير صالح")
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ النهاية غير صالح")
    .optional(),
  sort: z.enum(["date-desc", "date-asc"]).default("date-desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

type SalesOrderRow = {
  id: string;
  order_number: string;
  branch_id: string;
  cashier_id: string | null;
  order_type: "POS" | "TAILORING";
  customer_id: string | null;
  tailor_id: string | null;
  tailoring_purpose: "CUSTOMER" | "PRODUCTION" | null;
  tailoring_status:
    | "NEW"
    | "UNDER_TAILORING"
    | "READY_FOR_PICKUP"
    | "RECEIVED"
    | "CANCELLED"
    | null;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  payment_method: "CASH" | "CARD" | "BANK_TRANSFER" | "MIXED";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "RETURNED";
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

type PaymentRow = {
  sales_order_id: string;
  amount: number | string;
};

type PersonRow = {
  id: string;
  name: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
};

function getCalculatedPaymentStatus(
  totalAmount: number,
  paidAmount: number,
): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= totalAmount) return "PAID";
  return "PARTIAL";
}

function getSaudiDayStart(date: string) {
  return new Date(`${date}T00:00:00+03:00`);
}

function getSaudiNextDayStart(date: string) {
  const start = getSaudiDayStart(date);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

function cleanSearch(value: string) {
  return value.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json(
        { error: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام" },
        { status: 500 },
      );
    }

    const session = await getSession();

    if (!session || String(session.role).toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "عذراً، صفحة المبيعات مقتصرة على المدير فقط" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);

    const validation = salesOrdersQuerySchema.safeParse({
      search: searchParams.get("search") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
      paymentMethod: searchParams.get("paymentMethod") || undefined,
      orderType: searchParams.get("orderType") || undefined,
      fromDate: searchParams.get("fromDate") || undefined,
      toDate: searchParams.get("toDate") || undefined,
      sort: searchParams.get("sort") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "معاملات البحث غير صالحة",
          details: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const {
      search,
      paymentStatus,
      paymentMethod,
      orderType,
      fromDate,
      toDate,
      sort,
      page,
      limit,
    } = validation.data;

    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json(
        { error: "تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية" },
        { status: 400 },
      );
    }

    let query = supabaseAdmin
      .from("sales_orders")
      .select(
        `
          id,
          order_number,
          branch_id,
          cashier_id,
          order_type,
          customer_id,
          tailor_id,
          tailoring_purpose,
          tailoring_status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          payment_method,
          payment_status,
          status,
          notes,
          created_at,
          completed_at,
          updated_at
        `,
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("status", "COMPLETED");

    if (orderType) {
      query = query.eq("order_type", orderType);
    }

    if (paymentMethod) {
      query = query.eq("payment_method", paymentMethod);
    }

    if (fromDate) {
      const from = getSaudiDayStart(fromDate);

      if (Number.isNaN(from.getTime())) {
        return NextResponse.json({ error: "تاريخ البداية غير صالح" }, { status: 400 });
      }

      query = query.gte("created_at", from.toISOString());
    }

    if (toDate) {
      const toExclusive = getSaudiNextDayStart(toDate);

      if (Number.isNaN(toExclusive.getTime())) {
        return NextResponse.json({ error: "تاريخ النهاية غير صالح" }, { status: 400 });
      }

      query = query.lt("created_at", toExclusive.toISOString());
    }

    const safeSearch = search ? cleanSearch(search) : "";

    if (safeSearch) {
      const { data: customerMatches, error: customerSearchError } =
        await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("branch_id", MAIN_BRANCH_ID)
          .ilike("name", `%${safeSearch}%`)
          .limit(100);

      if (customerSearchError) {
        return NextResponse.json(
          { error: `فشل البحث في العملاء: ${customerSearchError.message}` },
          { status: 500 },
        );
      }

      const customerIds = (customerMatches ?? []).map((row) => row.id);

      if (customerIds.length > 0) {
        query = query.or(
          `order_number.ilike.%${safeSearch}%,customer_id.in.(${customerIds.join(",")})`,
        );
      } else {
        query = query.ilike("order_number", `%${safeSearch}%`);
      }
    }

    const { data: rawOrders, error: ordersError } = await query.order(
      "created_at",
      { ascending: sort === "date-asc" },
    );

    if (ordersError) {
      return NextResponse.json(
        { error: `فشل جلب المبيعات: ${ordersError.message}` },
        { status: 500 },
      );
    }

    const orders = (rawOrders ?? []) as SalesOrderRow[];

    // صفحة المبيعات تعرض فقط البيع الفعلي:
    // POS مكتمل + طلب تفصيل لعميل تم استلامه.
    const actualSales = orders.filter((order) => {
      if (order.order_type === "POS") return true;
      return (
        order.order_type === "TAILORING" &&
        order.tailoring_purpose === "CUSTOMER" &&
        order.tailoring_status === "RECEIVED"
      );
    });

    const orderIds = actualSales.map((order) => order.id);

    let payments: PaymentRow[] = [];

    if (orderIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("sales_order_payments")
        .select("sales_order_id, amount")
        .in("sales_order_id", orderIds);

      if (error) {
        return NextResponse.json(
          { error: `فشل جلب دفعات المبيعات: ${error.message}` },
          { status: 500 },
        );
      }

      payments = (data ?? []) as PaymentRow[];
    }

    const paidAmountMap = new Map<string, number>();

    for (const payment of payments) {
      const current = paidAmountMap.get(payment.sales_order_id) ?? 0;
      paidAmountMap.set(
        payment.sales_order_id,
        Number((current + Number(payment.amount)).toFixed(2)),
      );
    }

    const filteredByPayment = actualSales.filter((order) => {
      if (!paymentStatus) return true;

      const totalAmount = Number(order.total_amount);
      const paidAmount = paidAmountMap.get(order.id) ?? 0;

      return getCalculatedPaymentStatus(totalAmount, paidAmount) === paymentStatus;
    });

    const customerIds = [
      ...new Set(
        filteredByPayment
          .map((order) => order.customer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const tailorIds = [
      ...new Set(
        filteredByPayment
          .map((order) => order.tailor_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const cashierIds = [
      ...new Set(
        filteredByPayment
          .map((order) => order.cashier_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [customersResult, tailorsResult, cashiersResult] = await Promise.all([
      customerIds.length
        ? supabaseAdmin
            .from("customers")
            .select("id, name, whatsapp_number")
            .in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      tailorIds.length
        ? supabaseAdmin.from("users").select("id, name").in("id", tailorIds)
        : Promise.resolve({ data: [], error: null }),
      cashierIds.length
        ? supabaseAdmin.from("users").select("id, name, email").in("id", cashierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (customersResult.error || tailorsResult.error || cashiersResult.error) {
      const error = customersResult.error || tailorsResult.error || cashiersResult.error;
      return NextResponse.json(
        { error: `فشل تحميل بيانات المبيعات الإضافية: ${error?.message ?? "خطأ غير معروف"}` },
        { status: 500 },
      );
    }

    const customerMap = new Map<string, PersonRow>(
      ((customersResult.data ?? []) as PersonRow[]).map((row) => [row.id, row]),
    );
    const tailorMap = new Map<string, PersonRow>(
      ((tailorsResult.data ?? []) as PersonRow[]).map((row) => [row.id, row]),
    );
    const cashierMap = new Map<string, PersonRow>(
      ((cashiersResult.data ?? []) as PersonRow[]).map((row) => [row.id, row]),
    );

    const enrichedOrders = filteredByPayment.map((order) => {
      const subtotal = Number(order.subtotal);
      const discountAmount = Number(order.discount_amount);
      const taxAmount = Number(order.tax_amount);
      const totalAmount = Number(order.total_amount);
      const paidAmount = paidAmountMap.get(order.id) ?? 0;
      const customer = order.customer_id ? customerMap.get(order.customer_id) : undefined;
      const tailor = order.tailor_id ? tailorMap.get(order.tailor_id) : undefined;
      const cashier = order.cashier_id ? cashierMap.get(order.cashier_id) : undefined;

      return {
        id: order.id,
        orderNumber: order.order_number,
        orderType: order.order_type,
        tailoringPurpose: order.tailoring_purpose,
        tailoringStatus: order.tailoring_status,
        branchId: order.branch_id,
        customerId: order.customer_id,
        customerName: customer?.name ?? null,
        customerWhatsapp: customer?.whatsapp_number ?? null,
        tailorId: order.tailor_id,
        tailorName: tailor?.name ?? null,
        cashierId: order.cashier_id,
        cashierName: cashier?.name ?? null,
        cashierEmail: cashier?.email ?? null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        discountPercentage:
          subtotal > 0 ? Number(((discountAmount / subtotal) * 100).toFixed(2)) : 0,
        paidAmount: Number(paidAmount.toFixed(2)),
        remainingAmount: Number(Math.max(totalAmount - paidAmount, 0).toFixed(2)),
        paymentMethod: order.payment_method,
        paymentStatus: getCalculatedPaymentStatus(totalAmount, paidAmount),
        status: order.status,
        notes: order.notes,
        createdAt: order.created_at,
        completedAt: order.completed_at,
        updatedAt: order.updated_at,
      };
    });

    const total = enrichedOrders.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    return NextResponse.json({
      data: enrichedOrders.slice(offset, offset + limit),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/sales/orders error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء جلب المبيعات",
      },
      { status: 500 },
    );
  }
}

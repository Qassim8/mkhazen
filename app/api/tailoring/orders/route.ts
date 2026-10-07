import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyTailoringUpdate } from "@/app/api/tailoring/_lib/notify";
import { fetchAll } from "@/lib/supabase-fetch-all";

import { createTailoringOrderSchema } from "@/app/dashboard/tailoring/schemas/tailoring.schemas";

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  purpose: z.enum(["CUSTOMER", "PRODUCTION"]).optional(),
  status: z.enum(["NEW", "UNDER_TAILORING", "READY_FOR_PICKUP", "RECEIVED", "CANCELLED"]).optional(),
  tailorId: z.string().uuid().optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

function measurementMeters(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return Number(
    value.reduce((sum: number, item: unknown) => {
      if (!item || typeof item !== "object") return sum;
      const row = item as Record<string, unknown>;
      const numericValue = Number(row.value ?? 0);
      if (!Number.isFinite(numericValue) || numericValue <= 0) return sum;
      return sum + (row.unit === "M" ? numericValue : numericValue / 100);
    }, 0).toFixed(2),
  );
}

function todayInSudan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Khartoum",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });
    }

    const user = await getSession();
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 });

    const role = String(user.role).toLowerCase();
    const canManageAll = can(role, "tailoring.manage");
    const isCashier = role === "cashier";
    const isTailor = role === "tailor";
    if (!canManageAll && !isTailor && !isCashier) {
      return NextResponse.json({ message: "ليس لديك صلاحية عرض طلبات التفصيل." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const validation = listQuerySchema.safeParse({
      search: searchParams.get("search") || undefined,
      purpose: searchParams.get("purpose") || undefined,
      status: searchParams.get("status") || undefined,
      tailorId: searchParams.get("tailorId") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
      fromDate: searchParams.get("fromDate") || undefined,
      toDate: searchParams.get("toDate") || undefined,
      overdue: searchParams.get("overdue") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!validation.success) {
      return NextResponse.json({ message: "فلاتر طلبات التفصيل غير صالحة.", errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const params = validation.data;
    if (params.fromDate && params.toDate && params.fromDate > params.toDate) {
      return NextResponse.json({ message: "تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية." }, { status: 400 });
    }

    if (isTailor && params.tailorId && params.tailorId !== user.userId) {
      return NextResponse.json({ message: "لا يمكنك عرض طلبات ترزي آخر." }, { status: 403 });
    }

    const requestedTailorId = isTailor ? user.userId : params.tailorId;
    const safeSearch = canManageAll
      ? params.search?.replace(/[,%()]/g, " ").trim()
      : undefined;
    // كل العملاء المطابقين (من غير حد 100)
    const matchingCustomerIds = new Set<string>();

    if (safeSearch && !isTailor) {
      const customerRows = await fetchAll<{ id: string }>((from, to) =>
        supabaseAdmin
          .from("customers")
          .select("id")
          .eq("branch_id", MAIN_BRANCH_ID)
          .or(`name.ilike.%${safeSearch}%,whatsapp_number.ilike.%${safeSearch}%`)
          .order("id")
          .range(from, to),
      );
      for (const row of customerRows) matchingCustomerIds.add(row.id);
    }

    let query = supabaseAdmin
      .from("sales_orders")
      .select(
        `
          id,
          order_number,
          tailoring_item_name,
          tailoring_item_description,
          cancellation_reason,
          converted_to_product_at,
          branch_id,
          cashier_id,
          order_type,
          tailoring_purpose,
          customer_id,
          tailor_id,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          total_amount_usd,
          exchange_rate_used,
          tailoring_cost_sdg,
          payment_method,
          payment_status,
          status,
          notes,
          created_at,
          completed_at,
          updated_at,
          tailoring_status,
          intake_date,
          expected_delivery_date,
          measurements,
          fabric_variant_id,
          fabric_quantity,
          tailoring_cost,
          tailoring_fabric_cost,
          tailoring_material_journal_entry_id,
          tailoring_labor_journal_entry_id,
          customer_advance_journal_entry_id,
          cogs_journal_entry_id,
          tailoring_cogs_journal_entry_id,
          produced_product_template_id,
          produced_product_variant_id,
          produced_quantity,
          production_total_cost,
          production_material_journal_entry_id,
          production_labor_journal_entry_id,
          production_inventory_journal_entry_id
        `,
        { count: "exact" },
      )
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("order_type", "TAILORING");

    if (requestedTailorId) query = query.eq("tailor_id", requestedTailorId);
    if (isCashier) {
      query = query.eq("tailoring_purpose", "CUSTOMER");
    } else if (params.purpose) {
      query = query.eq("tailoring_purpose", params.purpose);
    }
    if (params.status) query = query.eq("tailoring_status", params.status);
    if (params.paymentStatus && canManageAll) {
      query = query.eq("payment_status", params.paymentStatus);
    }
    if (params.fromDate) query = query.gte("intake_date", params.fromDate);
    if (params.toDate) query = query.lte("intake_date", params.toDate);

    if (params.overdue === "true") {
      query = query.lt("expected_delivery_date", todayInSudan());
      query = query.not("tailoring_status", "in", "(RECEIVED,CANCELLED)");
    }

    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    const sortedQuery = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    let orders: Awaited<typeof sortedQuery>["data"];
    let count: number | null;

    if (safeSearch) {
      // البحث بيشمل العميل (قائمة IDs ممكن تبقى كبيرة)، فبنطابق في الكود
      // بدل .in() طويل في الرابط، وبعدين بنقسم الصفحات
      const needle = safeSearch.toLowerCase();
      const allOrders = await fetchAll<NonNullable<typeof orders>[number]>((rangeFrom, rangeTo) =>
        sortedQuery.range(rangeFrom, rangeTo),
      );
      const matched = allOrders.filter((order) => {
        const texts = [order.order_number, order.tailoring_item_name, order.tailoring_item_description];
        return (
          texts.some((value) => String(value ?? "").toLowerCase().includes(needle)) ||
          (!isTailor &&
            order.customer_id != null &&
            matchingCustomerIds.has(order.customer_id))
        );
      });
      orders = matched.slice(from, to + 1);
      count = matched.length;
    } else {
      const result = await sortedQuery.range(from, to);
      if (result.error) throw new Error(`فشل جلب طلبات التفصيل: ${result.error.message}`);
      orders = result.data;
      count = result.count;
    }

    const rows = orders ?? [];
    const orderIds = rows.map((row) => row.id);
    const customerIdList = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[];
    const tailorIdList = [...new Set(rows.map((row) => row.tailor_id).filter(Boolean))] as string[];
    const variantIds = [...new Set([
      ...rows.map((row) => row.fabric_variant_id).filter(Boolean),
      ...rows.map((row) => row.produced_product_variant_id).filter(Boolean),
    ])] as string[];
    const templateIds = [...new Set(rows.map((row) => row.produced_product_template_id).filter(Boolean))] as string[];
    const journalIds = [...new Set([
      ...rows.map((row) => row.cogs_journal_entry_id).filter(Boolean),
      ...rows.map((row) => row.tailoring_cogs_journal_entry_id).filter(Boolean),
      ...rows.map((row) => row.production_material_journal_entry_id).filter(Boolean),
    ])] as string[];

    if (isTailor || isCashier) {
      const customersQuery = async () => {
        if (!customerIdList.length) return [];

        const result = isCashier
          ? await supabaseAdmin
              .from("customers")
              .select("id, name, whatsapp_number")
              .in("id", customerIdList)
          : await supabaseAdmin
              .from("customers")
              .select("id, name")
              .in("id", customerIdList);

        if (result.error) throw new Error(result.error.message);
        return (result.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          whatsapp_number:
            "whatsapp_number" in row ? row.whatsapp_number : null,
        }));
      };
      const [customerRows, variantsResult, templatesResult, paymentsResult,
        transfersOutResult, transfersInResult, refundsResult] =
        await Promise.all([
          customersQuery(),
          variantIds.length
            ? supabaseAdmin
                .from("product_variants")
                .select("id, templateId")
                .in("id", variantIds)
            : Promise.resolve({ data: [], error: null }),
          templateIds.length
            ? supabaseAdmin
                .from("product_templates")
                .select("id, name, sellingUnit")
                .in("id", templateIds)
            : Promise.resolve({ data: [], error: null }),
          isCashier && orderIds.length
            ? supabaseAdmin
                .from("sales_order_payments")
                .select("sales_order_id, amount")
                .in("sales_order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          isCashier && orderIds.length
            ? supabaseAdmin
                .from("tailoring_customer_advance_transfers")
                .select("from_order_id, amount")
                .in("from_order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          isCashier && orderIds.length
            ? supabaseAdmin
                .from("tailoring_customer_advance_transfers")
                .select("to_order_id, amount")
                .in("to_order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          isCashier && orderIds.length
            ? supabaseAdmin
                .from("tailoring_customer_advance_refunds")
                .select("sales_order_id, amount")
                .in("sales_order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      const relationError =
        variantsResult.error || templatesResult.error ||
        paymentsResult.error || transfersOutResult.error ||
        transfersInResult.error || refundsResult.error;
      if (relationError) {
        throw new Error(
          `تعذر جلب تفاصيل طلبات الخياط: ${relationError.message}`,
        );
      }

      const customerMap = new Map(
        customerRows.map((row) => [row.id, row.name]),
      );
      const variantTemplateMap = new Map(
        (variantsResult.data ?? []).map((row) => [row.id, row.templateId]),
      );
      const templateMap = new Map(
        (templatesResult.data ?? []).map((row) => [
          row.id,
          { name: row.name, sellingUnit: row.sellingUnit },
        ]),
      );
      const paidByOrder = new Map<string, number>();
      const addAmount = (orderId: string, amount: number) =>
        paidByOrder.set(
          orderId,
          Number(((paidByOrder.get(orderId) ?? 0) + amount).toFixed(2)),
        );
      for (const payment of paymentsResult.data ?? []) {
        addAmount(payment.sales_order_id, Number(payment.amount));
      }
      for (const transfer of transfersInResult.data ?? []) {
        addAmount(transfer.to_order_id, Number(transfer.amount));
      }
      for (const transfer of transfersOutResult.data ?? []) {
        addAmount(transfer.from_order_id, -Number(transfer.amount));
      }
      for (const refund of refundsResult.data ?? []) {
        addAmount(refund.sales_order_id, -Number(refund.amount));
      }

      const data = rows.map((row) => {
        const fabricTemplateId = variantTemplateMap.get(
          row.fabric_variant_id ?? "",
        );
        const producedTemplateId =
          row.produced_product_template_id ??
          variantTemplateMap.get(row.produced_product_variant_id ?? "");

        const mapped = {
          id: row.id,
          order_number: row.order_number,
          tailoring_item_name: row.tailoring_item_name,
          tailoring_item_description: row.tailoring_item_description,
          tailoring_purpose: row.tailoring_purpose,
          tailoring_status: row.tailoring_status,
          intake_date: row.intake_date,
          expected_delivery_date: row.expected_delivery_date,
          measurements: row.measurements ?? [],
          fabric_quantity:
            row.fabric_quantity != null ? Number(row.fabric_quantity) : null,
          fabric_name: fabricTemplateId
            ? (templateMap.get(fabricTemplateId)?.name ?? null)
            : null,
          fabric_selling_unit: fabricTemplateId
            ? (templateMap.get(fabricTemplateId)?.sellingUnit ?? null)
            : null,
          customer_name: row.customer_id
            ? (customerMap.get(row.customer_id) ?? null)
            : null,
          customer_whatsapp: isCashier && row.customer_id
            ? customerRows.find(
                (customer) => customer.id === row.customer_id,
              )?.whatsapp_number ?? null
            : null,
          ...(isTailor
            ? {
                produced_quantity:
                  row.produced_quantity != null
                    ? Number(row.produced_quantity)
                    : null,
                produced_product_name: producedTemplateId
                  ? (templateMap.get(producedTemplateId)?.name ?? null)
                  : null,
                production_completed: Boolean(
                  row.produced_product_variant_id,
                ),
              }
            : {}),
        };
        if (!isCashier) return mapped;

        const paid = Number(Math.max(paidByOrder.get(row.id) ?? 0, 0).toFixed(2));
        const total = Number(row.total_amount ?? 0);
        return {
          ...mapped,
          total_amount: total,
          paid_amount: paid,
          remaining_amount: Number(Math.max(total - paid, 0).toFixed(2)),
        };
      });

      return NextResponse.json({
        data,
        meta: {
          total: count ?? 0,
          page: params.page,
          limit: params.limit,
          totalPages: count ? Math.ceil(count / params.limit) : 0,
        },
      });
    }

    const [customersResult, tailorsResult, paymentsResult, tailorPaymentsResult, transferFromResult, transferToResult, refundsResult, variantsResult, templatesResult, journalsResult] = await Promise.all([
      customerIdList.length
        ? supabaseAdmin.from("customers").select("id, name, whatsapp_number, measurements").in("id", customerIdList)
        : Promise.resolve({ data: [], error: null }),
      tailorIdList.length
        ? supabaseAdmin.from("users").select("id, name, phone").in("id", tailorIdList)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin.from("sales_order_payments").select("sales_order_id, amount").in("sales_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin.from("tailor_commission_payments").select("sales_order_id, amount").in("sales_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin.from("tailoring_customer_advance_transfers").select("from_order_id, amount").in("from_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin.from("tailoring_customer_advance_transfers").select("to_order_id, amount").in("to_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin.from("tailoring_customer_advance_refunds").select("sales_order_id, amount").in("sales_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      variantIds.length
        ? supabaseAdmin.from("product_variants").select('id, sku, barcode, stockQuantity, templateId, sellingPrice, averageCost').in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
      templateIds.length
        ? supabaseAdmin.from("product_templates").select('id, name, sellingUnit').in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      journalIds.length
        ? supabaseAdmin.from("journal_entries").select("id, amount").in("id", journalIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [customersResult, tailorsResult, paymentsResult, tailorPaymentsResult, transferFromResult, transferToResult, refundsResult, variantsResult, templatesResult, journalsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const customerMap = new Map((customersResult.data ?? []).map((row) => [row.id, row]));
    const tailorMap = new Map((tailorsResult.data ?? []).map((row) => [row.id, row]));
    const variantMap = new Map((variantsResult.data ?? []).map((row) => [row.id, row]));
    const templateMap = new Map((templatesResult.data ?? []).map((row) => [row.id, row]));
    const journalMap = new Map((journalsResult.data ?? []).map((row) => [row.id, Number(row.amount ?? 0)]));
    const paidMap = new Map<string, number>();
    const transferOutMap = new Map<string, number>();
    const transferInMap = new Map<string, number>();
    const refundMap = new Map<string, number>();
    const tailorPaidMap = new Map<string, number>();

    for (const payment of paymentsResult.data ?? []) {
      paidMap.set(payment.sales_order_id, Number(((paidMap.get(payment.sales_order_id) ?? 0) + Number(payment.amount)).toFixed(2)));
    }
    for (const transfer of transferFromResult.data ?? []) {
      transferOutMap.set(transfer.from_order_id, Number(((transferOutMap.get(transfer.from_order_id) ?? 0) + Number(transfer.amount)).toFixed(2)));
    }
    for (const transfer of transferToResult.data ?? []) {
      transferInMap.set(transfer.to_order_id, Number(((transferInMap.get(transfer.to_order_id) ?? 0) + Number(transfer.amount)).toFixed(2)));
    }
    for (const refund of refundsResult.data ?? []) {
      refundMap.set(refund.sales_order_id, Number(((refundMap.get(refund.sales_order_id) ?? 0) + Number(refund.amount)).toFixed(2)));
    }

    for (const payment of tailorPaymentsResult.data ?? []) {
      if (!payment.sales_order_id) continue;
      tailorPaidMap.set(payment.sales_order_id, Number(((tailorPaidMap.get(payment.sales_order_id) ?? 0) + Number(payment.amount)).toFixed(2)));
    }

    const mapped = rows.map((row) => {
      const purpose = row.tailoring_purpose === "PRODUCTION" ? "PRODUCTION" : "CUSTOMER";
      const customer = customerMap.get(row.customer_id);
      const tailor = tailorMap.get(row.tailor_id);
      const fabric = variantMap.get(row.fabric_variant_id);
      const fabricTemplate = fabric ? templateMap.get(fabric.templateId) : null;
      const producedVariant = variantMap.get(row.produced_product_variant_id);
      const producedTemplate = templateMap.get(row.produced_product_template_id);
      const directPaid = Number((paidMap.get(row.id) ?? 0).toFixed(2));
      const transferredIn = Number((transferInMap.get(row.id) ?? 0).toFixed(2));
      const transferredOut = Number((transferOutMap.get(row.id) ?? 0).toFixed(2));
      const refunded = Number((refundMap.get(row.id) ?? 0).toFixed(2));
      const paid = Number(Math.max(directPaid + transferredIn - transferredOut - refunded, 0).toFixed(2));
      const customerAdvanceAvailable = Number(Math.max(paid, 0).toFixed(2));
      const tailorPaid = Number((tailorPaidMap.get(row.id) ?? 0).toFixed(2));
      const fabricJournalId = purpose === "PRODUCTION"
        ? row.production_material_journal_entry_id ?? row.tailoring_material_journal_entry_id
        : row.tailoring_material_journal_entry_id ?? row.tailoring_cogs_journal_entry_id ?? row.cogs_journal_entry_id;
      const fabricCost = Number((Number(row.tailoring_fabric_cost ?? 0) || Number(journalMap.get(fabricJournalId) ?? 0)).toFixed(2));
      const tailoringCost = Number(row.tailoring_cost ?? 0);
      const productionTotalCost = row.production_total_cost == null ? null : Number(row.production_total_cost);
      const totalCost = Number((productionTotalCost ?? fabricCost + tailoringCost).toFixed(2));
      const measurementTotal = measurementMeters(row.measurements);

      return {
        ...row,
        tailoring_purpose: purpose,
        customer_name: customer?.name ?? null,
        customer_whatsapp: customer?.whatsapp_number ?? null,
        customer_measurements: customer?.measurements ?? null,
        customer_advance_available: row.tailoring_purpose === "CUSTOMER" && row.tailoring_status !== "RECEIVED" ? customerAdvanceAvailable : 0,
        customer_advance_transferred_in: transferredIn,
        customer_advance_transferred_out: transferredOut,
        customer_advance_refunded: refunded,
        tailor_name: tailor?.name ?? null,
        tailor_phone: tailor?.phone ?? null,
        fabric_name: fabricTemplate?.name ?? null,
        fabric_sku: fabric?.sku ?? null,
        fabric_stock_quantity: Number(fabric?.stockQuantity ?? 0),
        fabric_selling_unit: fabricTemplate?.sellingUnit ?? null,
        fabric_cost: fabricCost,
        production_total_cost: productionTotalCost,
        total_cost: totalCost,
        paid_amount: paid,
        remaining_amount: purpose === "CUSTOMER" && row.tailoring_status !== "CANCELLED" ? Number(Math.max(Number(row.total_amount) - paid, 0).toFixed(2)) : 0,
        tailor_paid_amount: tailorPaid,
        measurement_meters: measurementTotal,
        max_fabric_quantity: Number((measurementTotal + 1).toFixed(2)),
        produced_product_name: producedTemplate?.name ?? null,
        produced_product_sku: producedVariant?.sku ?? null,
        produced_product_barcode: producedVariant?.barcode ?? null,
        produced_product_selling_price: Number(producedVariant?.sellingPrice ?? 0),
        produced_product_average_cost: Number(producedVariant?.averageCost ?? 0),
      };
    });

    return NextResponse.json({
      data: mapped,
      meta: {
        total: count ?? 0,
        page: params.page,
        limit: params.limit,
        totalPages: count ? Math.ceil(count / params.limit) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/tailoring/orders:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ أثناء جلب طلبات التفصيل." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!MAIN_BRANCH_ID) {
      return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });
    }

    const user = await getSession();
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (!can(role, "tailoring.operate")) {
      return NextResponse.json({ message: "إنشاء طلبات التفصيل متاح للكاشير أو الإدارة فقط." }, { status: 403 });
    }

    const body = await request.json();
    const validation = createTailoringOrderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: "بيانات طلب التفصيل غير صالحة.", errors: validation.error.flatten().fieldErrors }, { status: 422 });
    }

    const value = validation.data;
    if (
      !can(role, "tailoring.manage") &&
      (value.tailoringPurpose !== "CUSTOMER" ||
        value.customerAdvanceSourceOrderId)
    ) {
      return NextResponse.json(
        { message: "يمكن للكاشير إنشاء طلبات العملاء فقط دون نقل عربون سابق." },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("create_tailoring_order", {
      p_branch_id: MAIN_BRANCH_ID,
      p_user_id: user.userId,
      p_tailoring_item_name: value.tailoringItemName,
      p_tailoring_item_description: value.tailoringItemDescription,
      p_customer_advance_source_order_id: value.customerAdvanceSourceOrderId,
      p_tailor_id: value.tailorId,
      p_tailoring_purpose: value.tailoringPurpose,
      p_customer_name: value.customerName,
      p_customer_whatsapp: value.customerWhatsapp,
      p_measurements: value.measurements,
      p_intake_date: value.intakeDate,
      p_expected_delivery_date: value.expectedDeliveryDate,
      p_fabric_variant_id: value.fabricVariantId,
      p_fabric_quantity: value.fabricQuantity,
      p_total_amount: value.totalAmount,
      p_deposit_amount: value.depositAmount,
      p_tailoring_cost: value.tailoringCost,
      p_payment_method: value.paymentMethod,
      p_notes: value.notes,
    });

    if (error) {
      console.error("create_tailoring_order RPC:", error);
      return NextResponse.json({ message: error.message || "تعذر إنشاء طلب التفصيل." }, { status: 400 });
    }

    await notifyTailoringUpdate({ orderId: data.id, event: "CREATED", actor: user });

    return NextResponse.json({
      message: `تم إنشاء الطلب ${data.order_number} بنجاح.`,
      data: {
        ...(can(role, "tailoring.manage")
          ? {
              ...data,
              total_amount: Number(data.total_amount ?? 0),
              deposit_amount: Number(data.deposit_amount ?? 0),
              remaining_amount: Number(data.remaining_amount ?? 0),
              tailoring_cost: Number(data.tailoring_cost ?? 0),
              tailoring_fabric_cost: Number(data.tailoring_fabric_cost ?? 0),
              measurement_meters: Number(data.measurement_meters ?? 0),
              max_fabric_quantity: Number(data.max_fabric_quantity ?? 0),
            }
          : { id: data.id, order_number: data.order_number }),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/tailoring/orders:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع في السيرفر." }, { status: 500 });
  }
}

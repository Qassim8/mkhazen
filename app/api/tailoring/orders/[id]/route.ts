import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase";

function calculateMeasurementMeters(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return Number(
    value
      .reduce((sum: number, item: unknown) => {
        if (!item || typeof item !== "object") return sum;
        const row = item as Record<string, unknown>;
        const numericValue = Number(row.value ?? 0);
        if (!Number.isFinite(numericValue) || numericValue <= 0) return sum;
        return sum + (row.unit === "M" ? numericValue : numericValue / 100);
      }, 0)
      .toFixed(2),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!MAIN_BRANCH_ID) return NextResponse.json({ message: "معرف الفرع الرئيسي غير مُعرّف في إعدادات النظام." }, { status: 500 });

    const user = await getSession();
    if (!user) return NextResponse.json({ message: "يرجى تسجيل الدخول أولاً." }, { status: 401 });

    const role = String(user.role).toLowerCase();
    if (!["admin", "cashier", "tailor"].includes(role)) {
      return NextResponse.json({ message: "ليس لديك صلاحية عرض طلبات التفصيل." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ message: "معرف طلب التفصيل مطلوب." }, { status: 400 });

    const { data: order, error: orderError } = await supabaseAdmin
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
      )
      .eq("id", id)
      .eq("branch_id", MAIN_BRANCH_ID)
      .eq("order_type", "TAILORING")
      .single();

    if (orderError || !order) return NextResponse.json({ message: "طلب التفصيل غير موجود." }, { status: 404 });

    if (role === "tailor" && order.tailor_id !== user.userId) {
      return NextResponse.json({ message: "لا يمكنك عرض طلب مسند إلى ترزي آخر." }, { status: 403 });
    }

    const paymentQuery = supabaseAdmin
      .from("sales_order_payments")
      .select("id, amount, payment_date, payment_method, reference, notes, journal_entry_id, created_by, created_at")
      .eq("sales_order_id", id)
      .order("payment_date", { ascending: true });

    const tailorPaymentQuery = supabaseAdmin
      .from("tailor_commission_payments")
      .select("id, amount, payment_type, payment_method, notes, journal_entry_id, created_by, created_at")
      .eq("sales_order_id", id)
      .order("created_at", { ascending: true });

    const advanceTransferQuery = supabaseAdmin
      .from("tailoring_customer_advance_transfers")
      .select("id, from_order_id, to_order_id, amount, created_at, created_by, notes")
      .or(`from_order_id.eq.${id},to_order_id.eq.${id}`)
      .order("created_at", { ascending: true });

    const advanceRefundQuery = supabaseAdmin
      .from("tailoring_customer_advance_refunds")
      .select("id, sales_order_id, amount, payment_method, journal_entry_id, created_at, created_by, notes")
      .eq("sales_order_id", id)
      .order("created_at", { ascending: true });

    const customerQuery = order.customer_id
      ? supabaseAdmin.from("customers").select("id, name, whatsapp_number, measurements").eq("id", order.customer_id).single()
      : Promise.resolve({ data: null, error: null });

    const tailorQuery = order.tailor_id
      ? supabaseAdmin.from("users").select("id, name, phone").eq("id", order.tailor_id).single()
      : Promise.resolve({ data: null, error: null });

    const cashierQuery = order.cashier_id
      ? supabaseAdmin.from("users").select("id, name").eq("id", order.cashier_id).single()
      : Promise.resolve({ data: null, error: null });

    const fabricQuery = order.fabric_variant_id
      ? supabaseAdmin
          .from("product_variants")
          .select("id, sku, stockQuantity, templateId, product_templates(name, sellingUnit)")
          .eq("id", order.fabric_variant_id)
          .single()
      : Promise.resolve({ data: null, error: null });

    const producedVariantQuery = order.produced_product_variant_id
      ? supabaseAdmin
          .from("product_variants")
          .select('id, sku, barcode, sellingPrice, averageCost, stockQuantity, templateId')
          .eq("id", order.produced_product_variant_id)
          .single()
      : Promise.resolve({ data: null, error: null });

    const producedTemplateQuery = order.produced_product_template_id
      ? supabaseAdmin.from("product_templates").select("id, name, sellingUnit").eq("id", order.produced_product_template_id).single()
      : Promise.resolve({ data: null, error: null });

    const journalIds = [
      order.cogs_journal_entry_id,
      order.tailoring_cogs_journal_entry_id,
      order.production_material_journal_entry_id,
    ].filter(Boolean) as string[];

    const journalQuery = journalIds.length
      ? supabaseAdmin.from("journal_entries").select("id, amount").in("id", journalIds)
      : Promise.resolve({ data: [], error: null });

    const [paymentsResult, tailorPaymentsResult, transferResult, refundResult, customerResult, tailorResult, cashierResult, fabricResult, producedVariantResult, producedTemplateResult, journalResult] = await Promise.all([
      paymentQuery,
      tailorPaymentQuery,
      advanceTransferQuery,
      advanceRefundQuery,
      customerQuery,
      tailorQuery,
      cashierQuery,
      fabricQuery,
      producedVariantQuery,
      producedTemplateQuery,
      journalQuery,
    ]);

    for (const result of [paymentsResult, tailorPaymentsResult, transferResult, refundResult, customerResult, tailorResult, cashierResult, fabricResult, producedVariantResult, producedTemplateResult, journalResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const relatedOrderIds = [...new Set((transferResult.data ?? []).map((row) =>
      row.from_order_id === id ? row.to_order_id : row.from_order_id
    ))];

    const relatedOrdersResult = relatedOrderIds.length
      ? await supabaseAdmin.from("sales_orders").select("id, order_number").in("id", relatedOrderIds)
      : { data: [], error: null };

    if (relatedOrdersResult.error) throw new Error(relatedOrdersResult.error.message);

    const journalMap = new Map((journalResult.data ?? []).map((row) => [row.id, Number(row.amount ?? 0)]));
    const directPaidAmount = Number((paymentsResult.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2));
    const transferredInAmount = Number((transferResult.data ?? []).filter((row) => row.to_order_id === id).reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2));
    const transferredOutAmount = Number((transferResult.data ?? []).filter((row) => row.from_order_id === id).reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2));
    const refundedAmount = Number((refundResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2));
    const paidAmount = Number(Math.max(directPaidAmount + transferredInAmount - transferredOutAmount - refundedAmount, 0).toFixed(2));
    const customerAdvanceAvailable = Number((order.tailoring_purpose === "CUSTOMER" && order.tailoring_status !== "RECEIVED" ? paidAmount : 0).toFixed(2));
    const tailorPaidAmount = Number((tailorPaymentsResult.data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2));
    const totalAmount = Number(order.total_amount);
    const tailoringCost = Number(order.tailoring_cost ?? 0);
    const purpose = order.tailoring_purpose === "PRODUCTION" ? "PRODUCTION" : "CUSTOMER";
    const materialJournalId = purpose === "PRODUCTION"
      ? order.production_material_journal_entry_id ?? order.tailoring_material_journal_entry_id
      : order.tailoring_material_journal_entry_id ?? order.tailoring_cogs_journal_entry_id ?? order.cogs_journal_entry_id;
    const fabricCost = Number((Number(order.tailoring_fabric_cost ?? 0) || Number(journalMap.get(materialJournalId) ?? 0)).toFixed(2));
    const productionTotalCost = order.production_total_cost == null ? null : Number(order.production_total_cost);
    const totalCost = Number((productionTotalCost ?? fabricCost + tailoringCost).toFixed(2));
    const remainingAmount = purpose === "CUSTOMER" && order.tailoring_status !== "CANCELLED"
      ? Number(Math.max(totalAmount - paidAmount, 0).toFixed(2))
      : 0;
    const tailorRemainingAmount = Number(Math.max(tailoringCost - tailorPaidAmount, 0).toFixed(2));
    const measurementTotal = calculateMeasurementMeters(order.measurements);
    const fabricTemplate = Array.isArray(fabricResult.data?.product_templates) ? fabricResult.data?.product_templates?.[0] : fabricResult.data?.product_templates;
    const relatedOrderMap = new Map((relatedOrdersResult.data ?? []).map((row) => [row.id, row.order_number]));
    const customerAdvanceMovements = [
      ...(transferResult.data ?? []).map((row) => ({
        direction: row.to_order_id === id ? "IN" : "OUT",
        amount: Number(row.amount),
        relatedOrderId: row.to_order_id === id ? row.from_order_id : row.to_order_id,
        relatedOrderNumber: relatedOrderMap.get(row.to_order_id === id ? row.from_order_id : row.to_order_id) ?? null,
        createdAt: row.created_at,
      })),
      ...(refundResult.data ?? []).map((row) => ({
        direction: "REFUND",
        amount: Number(row.amount),
        relatedOrderId: null,
        relatedOrderNumber: null,
        createdAt: row.created_at,
      })),
    ].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    return NextResponse.json({
      data: {
        id: order.id,
        order_number: order.order_number,
        tailoring_item_name: order.tailoring_item_name,
        tailoring_item_description: order.tailoring_item_description,
        cancellation_reason: order.cancellation_reason,
        converted_to_product_at: order.converted_to_product_at,
        cashier_id: order.cashier_id,
        cashier_name: cashierResult.data?.name ?? null,
        customer_id: order.customer_id,
        tailor_id: order.tailor_id,
        tailoring_purpose: purpose,
        tailoring_status: order.tailoring_status,
        intake_date: order.intake_date,
        expected_delivery_date: order.expected_delivery_date,
        measurements: order.measurements ?? [],
        measurement_meters: measurementTotal,
        max_fabric_quantity: Number((measurementTotal + 1).toFixed(2)),
        fabric_variant_id: order.fabric_variant_id,
        fabric_quantity: order.fabric_quantity != null ? Number(order.fabric_quantity) : null,
        fabric_name: fabricTemplate?.name ?? null,
        fabric_sku: fabricResult.data?.sku ?? null,
        fabric_selling_unit: fabricTemplate?.sellingUnit ?? null,
        fabric_stock_quantity: Number(fabricResult.data?.stockQuantity ?? 0),
        fabric_cost: fabricCost,
        tailoring_fabric_cost: fabricCost,
        tailoring_cost: tailoringCost,
        total_cost: totalCost,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        customer_advance_available: customerAdvanceAvailable,
        customer_advance_transferred_in: transferredInAmount,
        customer_advance_transferred_out: transferredOutAmount,
        customer_advance_refunded: refundedAmount,
        customer_advance_movements: customerAdvanceMovements,
        tailor_paid_amount: tailorPaidAmount,
        tailor_remaining_amount: tailorRemainingAmount,
        tailoring_material_journal_entry_id: order.tailoring_material_journal_entry_id,
        tailoring_labor_journal_entry_id: order.tailoring_labor_journal_entry_id,
        customer_advance_journal_entry_id: order.customer_advance_journal_entry_id,
        tailoring_cogs_journal_entry_id: order.tailoring_cogs_journal_entry_id,
        production_material_journal_entry_id: order.production_material_journal_entry_id,
        production_labor_journal_entry_id: order.production_labor_journal_entry_id,
        production_inventory_journal_entry_id: order.production_inventory_journal_entry_id,
        produced_product_template_id: order.produced_product_template_id,
        produced_product_variant_id: order.produced_product_variant_id,
        produced_quantity: order.produced_quantity != null ? Number(order.produced_quantity) : null,
        production_total_cost: productionTotalCost,
        produced_product_name: producedTemplateResult.data?.name ?? null,
        produced_product_sku: producedVariantResult.data?.sku ?? null,
        produced_product_barcode: producedVariantResult.data?.barcode ?? null,
        produced_product_selling_price: Number(producedVariantResult.data?.sellingPrice ?? 0),
        produced_product_average_cost: Number(producedVariantResult.data?.averageCost ?? 0),
        gross_profit: purpose === "CUSTOMER" ? Number((totalAmount - totalCost).toFixed(2)) : null,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        status: order.status,
        notes: order.notes,
        created_at: order.created_at,
        updated_at: order.updated_at,
        completed_at: order.completed_at,
        customer_name: customerResult.data?.name ?? null,
        customer_whatsapp: customerResult.data?.whatsapp_number ?? null,
        customer_measurements: customerResult.data?.measurements ?? null,
        tailor_name: tailorResult.data?.name ?? null,
        tailor_phone: tailorResult.data?.phone ?? null,
        payments: (paymentsResult.data ?? []).map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          reference: payment.reference,
          notes: payment.notes,
          journal_entry_id: payment.journal_entry_id,
          created_by: payment.created_by,
          created_at: payment.created_at,
        })),
        tailor_payments: (tailorPaymentsResult.data ?? []).map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          payment_type: payment.payment_type,
          payment_method: payment.payment_method,
          notes: payment.notes,
          journal_entry_id: payment.journal_entry_id,
          created_by: payment.created_by,
          created_at: payment.created_at,
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/tailoring/orders/[id]:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء جلب طلب التفصيل." }, { status: 500 });
  }
}

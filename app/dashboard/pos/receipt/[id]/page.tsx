import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import ReceiptPrintClient from "./ReceiptPrintClient";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

interface SalesOrderItemRow {
  id: string;
  template_id: string;
  variant_id: string;
  quantity: number | string;
  unit_price: number | string;
  total_price: number | string;
  is_gift: boolean;
  gift_note: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
}

interface VariantRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  packBarcode: string | null;
  colorName: string | null;
  size: string | null;
  length: number | string | null;
  width: number | string | null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getVariantLabel(variant: {
  colorName?: string | null;
  size?: string | null;
  length?: number | string | null;
  width?: number | string | null;
}) {
  return [
    variant.colorName && `اللون: ${variant.colorName}`,
    variant.size && `المقاس: ${variant.size}`,
    variant.length != null && `الطول: ${variant.length}`,
    variant.width != null && `العرض: ${variant.width}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

export default async function SalesReceiptPage({ params }: Props) {
  const session = await getSession();
  if (!session) notFound();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  // ---------------------------------------------------------
  // 1. Order
  // ---------------------------------------------------------
  const { data: order, error: orderError } = await supabaseAdmin
    .from("sales_orders")
    .select(
      `
        id,
        order_number,
        order_type,
        branch_id,
        created_at,
        completed_at,
        cashier_id,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        payment_method,
        payment_status,
        exchange_rate_used,
        status,
        notes
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    console.error("Sales receipt order query error:", {
      orderId: id,
      code: orderError.code,
      message: orderError.message,
      details: orderError.details,
      hint: orderError.hint,
    });
    throw new Error("تعذر قراءة بيانات الفاتورة.");
  }

  if (!order || order.status !== "COMPLETED") {
    notFound();
  }

  // ---------------------------------------------------------
  // 2. Items
  // ---------------------------------------------------------
  const { data: itemRows, error: itemsError } = await supabaseAdmin
    .from("sales_order_items")
    .select(
      `
        id,
        template_id,
        variant_id,
        quantity,
        unit_price,
        total_price,
        is_gift,
        gift_note
      `,
    )
    .eq("sales_order_id", order.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("Sales receipt items query error:", {
      orderId: order.id,
      code: itemsError.code,
      message: itemsError.message,
      details: itemsError.details,
      hint: itemsError.hint,
    });
    throw new Error("تعذر قراءة عناصر الفاتورة.");
  }

  const items = (itemRows ?? []) as SalesOrderItemRow[];
  if (items.length === 0) {
    throw new Error("الفاتورة لا تحتوي على أي أصناف.");
  }

  // ---------------------------------------------------------
  // 3. Product templates
  // ---------------------------------------------------------
  const templateIds = [...new Set(items.map((item) => item.template_id))];
  const { data: templateRows, error: templatesError } = await supabaseAdmin
    .from("product_templates")
    .select("id, name")
    .in("id", templateIds);

  if (templatesError) {
    console.error("Sales receipt templates query error:", {
      orderId: order.id,
      code: templatesError.code,
      message: templatesError.message,
      details: templatesError.details,
      hint: templatesError.hint,
    });
    throw new Error("تعذر قراءة أسماء المنتجات في الفاتورة.");
  }

  const templateMap = new Map<string, TemplateRow>();
  for (const template of (templateRows ?? []) as TemplateRow[]) {
    templateMap.set(template.id, template);
  }

  // ---------------------------------------------------------
  // 4. Product variants
  // ---------------------------------------------------------
  const variantIds = [...new Set(items.map((item) => item.variant_id))];
  const { data: variantRows, error: variantsError } = await supabaseAdmin
    .from("product_variants")
    .select(
      `
        id,
        sku,
        barcode,
        "packBarcode",
        "colorName",
        size,
        length,
        width
      `,
    )
    .in("id", variantIds);

  if (variantsError) {
    console.error("Sales receipt variants query error:", {
      orderId: order.id,
      code: variantsError.code,
      message: variantsError.message,
      details: variantsError.details,
      hint: variantsError.hint,
    });
    throw new Error("تعذر قراءة تفاصيل المنتجات في الفاتورة.");
  }

  const variantMap = new Map<string, VariantRow>();
  for (const variant of (variantRows ?? []) as VariantRow[]) {
    variantMap.set(variant.id, variant);
  }

  // ---------------------------------------------------------
  // 5. Branch
  // ---------------------------------------------------------
  let branchName = "الفرع الرئيسي";
  const { data: branch, error: branchError } = await supabaseAdmin
    .from("branches")
    .select("id, name")
    .eq("id", order.branch_id)
    .maybeSingle();

  if (branchError) {
    console.error("Sales receipt branch query error:", {
      orderId: order.id,
      branchId: order.branch_id,
      code: branchError.code,
      message: branchError.message,
      details: branchError.details,
      hint: branchError.hint,
    });
  } else if (branch?.name?.trim()) {
    branchName = branch.name.trim();
  }

  // ---------------------------------------------------------
  // 6. Cashier
  // ---------------------------------------------------------
  let cashierName = "الكاشير";
  if (order.cashier_id) {
    const { data: cashier, error: cashierError } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .eq("id", order.cashier_id)
      .maybeSingle();

    if (cashierError) {
      console.error("Sales receipt cashier query error:", {
        orderId: order.id,
        cashierId: order.cashier_id,
        code: cashierError.code,
        message: cashierError.message,
        details: cashierError.details,
        hint: cashierError.hint,
      });
    }

    cashierName = cashier?.name?.trim() || cashier?.email?.trim() || "الكاشير";
  }

  // ---------------------------------------------------------
  // 7. Money
  // ---------------------------------------------------------
  const subtotal = Number(order.subtotal);
  const discountAmount = Number(order.discount_amount);
  const taxAmount = Number(order.tax_amount);
  const totalAmount = Number(order.total_amount);
  const discountPercentage =
    subtotal > 0
      ? Number(((discountAmount / subtotal) * 100).toFixed(2))
      : 0;

  // POS checkout is always PAID.
  const paidAmount = totalAmount;
  const remainingAmount = 0;

  // ---------------------------------------------------------
  // 8. Receipt items
  // ---------------------------------------------------------
  const receiptItems = items.map((item) => {
    const template = templateMap.get(item.template_id);
    const variant = variantMap.get(item.variant_id);

    return {
      id: item.id,
      productName: template?.name ?? "منتج",
      sku: variant?.sku ?? null,
      variantLabel: variant
        ? getVariantLabel({
            colorName: variant.colorName,
            size: variant.size,
            length: variant.length,
            width: variant.width,
          })
        : null,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
      isGift: Boolean(item.is_gift),
      giftNote: item.gift_note ?? null,
    };
  });

  return (
    <ReceiptPrintClient
      receipt={{
        id: order.id,
        orderNumber: order.order_number,
        orderType: order.order_type,
        createdAt: order.created_at,
        completedAt: order.completed_at ?? null,
        branchName,
        cashierName,
        customerName: null,
        subtotal,
        discountAmount,
        discountPercentage,
        taxAmount,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod: order.payment_method,
        exchangeRate:
          order.exchange_rate_used != null ? Number(order.exchange_rate_used) : null,
        paymentStatus: order.payment_status,
        status: order.status,
        notes: order.notes ?? null,
        items: receiptItems,
      }}
    />
  );
}

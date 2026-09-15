import { supabaseAdmin } from "@/lib/supabase";

export interface CheckoutItemInput {
  variantId: string;
  quantity: number;
}

export interface CheckoutPaymentSplit {
  method: "CASH" | "CARD" | "BANK_TRANSFER";
  amount: number;
  reference?: string | null;
  notes?: string | null;
}

export interface CheckoutTransactionInput {
  cashierId: string;
  branchId: string;

  orderType: "POS" | "TAILORING";

  customerId?: string | null;
  tailorId?: string | null;

  discountAmount: number;
  taxAmount: number;

  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MIXED";

  paymentSplits?: CheckoutPaymentSplit[];

  notes?: string | null;

  items: CheckoutItemInput[];
}

export interface CheckoutTransactionResult {
  id: string;
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: "PAID";
  status: "COMPLETED";
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MIXED";
  createdAt: string;
}

export async function completeSalesCheckout(
  input: CheckoutTransactionInput,
): Promise<CheckoutTransactionResult> {
  const { data, error } = await supabaseAdmin.rpc("complete_sales_checkout", {
    p_branch_id: input.branchId,
    p_cashier_id: input.cashierId,

    p_order_type: input.orderType,

    p_customer_id: input.customerId ?? null,
    p_tailor_id: input.tailorId ?? null,

    p_discount_amount: input.discountAmount,
    p_tax_amount: input.taxAmount,

    p_payment_method: input.paymentMethod,

    p_payment_splits: input.paymentSplits ?? [],

    p_notes: input.notes ?? null,

    p_items: input.items,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("لم يتم إرجاع نتيجة من عملية إتمام البيع");
  }

  return {
    id: data.id,
    orderNumber: data.order_number,
    subtotal: Number(data.subtotal),
    discountAmount: Number(data.discount_amount),
    taxAmount: Number(data.tax_amount),
    totalAmount: Number(data.total_amount),
    paidAmount: Number(data.paid_amount),
    paymentStatus: data.payment_status,
    status: data.status,
    paymentMethod: data.payment_method,
    createdAt: data.created_at,
  };
}

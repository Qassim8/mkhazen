import { supabaseAdmin } from "@/lib/supabase";

/** خطأ راجع من دالة قاعدة البيانات (المعاملة اترجعت بالكامل) — بيحتفظ بالكود */
export class CheckoutRpcError extends Error {
  readonly dbError: { code?: string; message?: string };
  constructor(dbError: { code?: string; message?: string }) {
    super(dbError.message || "تعذر إتمام عملية البيع");
    this.name = "CheckoutRpcError";
    this.dbError = dbError;
  }
}

export interface CheckoutItemInput {
  variantId: string;
  quantity: number;
  isGift: boolean;
  giftNote?: string | null;
}

export interface CheckoutPaymentSplit {
  method: "CASH" | "CARD" | "BANK_TRANSFER";
  amount: number;
  reference?: string | null;
  notes?: string | null;
}

export interface CheckoutTransactionInput {
  branchId: string;
  cashierId: string;
  orderType: "POS" | "TAILORING";
  customerId?: string | null;
  tailorId?: string | null;
  discountAmount: number;
  taxAmount: number;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MIXED";
  paymentSplits?: CheckoutPaymentSplit[];
  notes?: string | null;
  items: CheckoutItemInput[];
  /** سعر الصرف المعروض على شاشة الكاشير (حماية من تغيّر السعر أثناء البيع) */
  expectedExchangeRate?: number | null;
}

export interface CheckoutTransactionResult {
  id: string;
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountUsd: number;
  exchangeRateUsed: number;
  paidAmount: number;
  paymentStatus: "PAID";
  status: "COMPLETED";
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MIXED";
  createdAt: string;
}

interface CheckoutRpcResult {
  id?: unknown;
  order_number?: unknown;
  subtotal?: unknown;
  discount_amount?: unknown;
  tax_amount?: unknown;
  total_amount?: unknown;
  total_amount_usd?: unknown;
  exchange_rate_used?: unknown;
  paid_amount?: unknown;
  payment_status?: unknown;
  status?: unknown;
  payment_method?: unknown;
  created_at?: unknown;
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
    p_items: input.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      isGift: item.isGift,
      giftNote: item.giftNote ?? null,
    })),
    p_expected_exchange_rate: input.expectedExchangeRate ?? null,
  });

  if (error) {
    throw new CheckoutRpcError(error);
  }

  if (!data || typeof data !== "object") {
    throw new Error("لم يتم إرجاع نتيجة صالحة من عملية إتمام البيع.");
  }

  const result = data as CheckoutRpcResult;

  if (
    typeof result.id !== "string" ||
    typeof result.order_number !== "string" ||
    typeof result.created_at !== "string"
  ) {
    throw new Error("استجابة عملية البيع غير مكتملة.");
  }

  if (result.payment_status !== "PAID" || result.status !== "COMPLETED") {
    throw new Error("عملية البيع لم تكتمل بالحالة المتوقعة.");
  }

  return {
    id: result.id,
    orderNumber: result.order_number,
    subtotal: Number(result.subtotal ?? 0),
    discountAmount: Number(result.discount_amount ?? 0),
    taxAmount: Number(result.tax_amount ?? 0),
    totalAmount: Number(result.total_amount ?? 0),
    totalAmountUsd: Number(result.total_amount_usd ?? 0),
    exchangeRateUsed: Number(result.exchange_rate_used ?? 0),
    paidAmount: Number(result.paid_amount ?? 0),
    paymentStatus: "PAID",
    status: "COMPLETED",
    paymentMethod:
      result.payment_method === "MIXED" ||
      result.payment_method === "CASH" ||
      result.payment_method === "CARD" ||
      result.payment_method === "BANK_TRANSFER"
        ? result.payment_method
        : input.paymentMethod,
    createdAt: result.created_at,
  };
}

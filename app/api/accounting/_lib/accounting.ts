import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/currency";
import {
  AccountingAccount,
  JournalEntryType,
} from "@/app/dashboard/accounting/schemas/accounting.schema";

/* =========================================================
   ACCOUNT LABELS
========================================================= */

export const ACCOUNT_LABELS: Record<AccountingAccount, string> = {
  CASH: "الخزينة",
  BANK: "البنك",
  INVENTORY: "المخزون",
  SUPPLIERS: "الموردون",
  CAPITAL: "رأس المال",
  SALES: "المبيعات",
  CUSTOMER_ADVANCES: "عربون العملاء",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  ASSETS: "الأصول",
  TAILORS_PAYABLE: "تسجيل مستحقات الخياطين",
  TAILOR_ADVANCES: "دفعات مقدمة للخياطين",
  COGS: "تكلفة المنتجات المباعة",
  WORK_IN_PROGRESS: "انتاج تحت التشغيل",
  UTILITIES: "الفواتير والخدمات",
  RENTS: "الايجار",
  OTHER_EXPENSE: "مصروفات أخرى",
  OTHER_INCOME: "إيرادات أخرى",
  GIFTS: "هدايا للعملاء",
  CURRENCY_EXCHANGE: "تحويل عملة (فروق صرف)",
};

/* =========================================================
   PAYMENT ACCOUNT
========================================================= */

export function getPaymentAccount(
  paymentMethod: "CASH" | "BANK",
): AccountingAccount {
  return paymentMethod === "BANK" ? "BANK" : "CASH";
}

/* =========================================================
   ENTRY NUMBER
========================================================= */

export function generateEntryNumber() {
  const date = new Date();

  const year = date.getFullYear();

  const random = crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase();

  return `JE-${year}-${random}`;
}

/* =========================================================
   CREATE JOURNAL ENTRY
========================================================= */

interface CreateJournalEntryParams {
  entryType: JournalEntryType;

  amount: number;

  debitAccount: AccountingAccount;

  creditAccount: AccountingAccount;

  description?: string | null;

  reference?: string | null;

  purchaseOrderId?: string | null;

  createdBy?: string | null;

  /**
   * عملة المبلغ. لو مش محددة، الـ trigger في الداتابيز يحددها من
   * الحسابات (قيود الزبون = جنيه، غير كده = دولار).
   * لو SDG، سعر الصرف والقيمة بالدولار بيتحسبوا تلقائيًا بالسعر الحالي.
   */
  currency?: CurrencyCode;
}

export async function createJournalEntry({
  entryType,
  amount,
  debitAccount,
  creditAccount,
  description,
  reference,
  purchaseOrderId,
  createdBy,
  currency,
}: CreateJournalEntryParams) {
  if (amount <= 0) {
    throw new Error("مبلغ القيد يجب أن يكون أكبر من صفر");
  }

  if (debitAccount === creditAccount) {
    throw new Error("الحساب المدين والدائن يجب أن يكونا مختلفين");
  }

  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .insert({
      entry_number: generateEntryNumber(),

      purchase_order_id: purchaseOrderId ?? null,

      created_by: createdBy ?? null,

      branch_id: MAIN_BRANCH_ID,

      entry_type: entryType,

      amount,

      description: description ?? null,

      reference: reference ?? null,

      debit_account: debitAccount,

      credit_account: creditAccount,

      ...(currency ? { currency } : {}),
    })
    .select(
      `
        id,
        entry_number,
        purchase_order_id,
        created_by,
        branch_id,
        entry_type,
        amount,
        description,
        reference,
        debit_account,
        credit_account,
        currency,
        exchange_rate_used,
        amount_usd,
        created_at
      `,
    )
    .single();

  if (error || !data) {
    console.error("Create journal entry:", error);

    throw new Error(error?.message || "تعذر إنشاء القيد المحاسبي");
  }

  return data;
}

/* =========================================================
   CHECK BALANCE — رصيد الخزينة/البنك لعملة محددة
   (الجنيه والدولار فلوس مختلفة في الدرج، ما ينفعش يتجمعوا)
========================================================= */

export async function getAccountBalance(
  account: "BANK" | "CASH",
  currency: CurrencyCode = "USD",
) {
  const { data, error } = await supabaseAdmin.rpc("get_account_balance", {
    p_branch_id: MAIN_BRANCH_ID,
    p_account: account,
    p_currency: currency,
  });

  if (error) {
    throw new Error(`تعذر قراءة رصيد الحساب: ${error.message}`);
  }

  return Number(data ?? 0);
}

export function formatBalanceMessage(
  account: "BANK" | "CASH",
  currency: CurrencyCode,
  balance: number,
) {
  const accountLabel = account === "BANK" ? "البنك" : "الخزينة";
  const symbol = currency === "USD" ? "$" : "ج.س";
  const currencyLabel = currency === "USD" ? "دولار" : "جنيه";

  return `الرصيد غير كافٍ في ${accountLabel} (${currencyLabel}). الرصيد الحالي ${balance.toFixed(2)} ${symbol}`;
}

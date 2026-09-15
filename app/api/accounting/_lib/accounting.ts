import { supabaseAdmin } from "@/lib/supabase";
import { MAIN_BRANCH_ID } from "@/lib/constants";
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
  ELECTRICITY: "الكهرباء",
  WATER: "الماء",
  INTERNET: "الإنترنت",
  SALARIES: "الرواتب",
  MAINTENANCE: "الصيانة",
  ASSETS: "الأصول",
  OTHER_EXPENSE: "مصروفات أخرى",
  OTHER_INCOME: "إيرادات أخرى",
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
   Check Balance
========================================================= */
export async function getAccountBalance(account: "BANK" | "CASH") {
  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .select("amount, debit_account, credit_account")
    .eq("branch_id", MAIN_BRANCH_ID);

  if (error) {
    throw new Error(`تعذر قراءة رصيد الحساب: ${error.message}`);
  }

  return (data ?? []).reduce((balance, entry) => {
    const amount = Number(entry.amount ?? 0);

    if (entry.debit_account === account) {
      return balance + amount;
    }

    if (entry.credit_account === account) {
      return balance - amount;
    }

    return balance;
  }, 0);
}

/**
 * =====================================================================
 * api/accounting/_lib/ledger.ts
 * حسابات الأرصدة والأرباح بنظام العملتين (مشتركة بين overview و summary)
 * =====================================================================
 * • كل أرقام الأداء (إيراد/تكلفة/مصروف/ربح) والالتزامات والمخزون
 *   بالدولار من amount_usd.
 * • الخزينة والبنك برصيدين منفصلين لكل عملة (فلوس حقيقية في الدرج).
 * • فروق العملة:
 *   - محققة: رصيد حساب CURRENCY_EXCHANGE (فرق سعر تحويل الجنيه لدولار)
 *   - غير محققة: الجنيه المحفوظ اتسجّل بقيمة دولارية وقت دخوله، وقيمته
 *     النهارده بالسعر الحالي أقل/أكثر → ده أثر تدهور الجنيه.
 */

export interface LedgerEntry {
  amount: number | string;
  amount_usd: number | string;
  currency: "USD" | "SDG";
  debit_account: string;
  credit_account: string;
  entry_type?: string;
  created_at?: string;
}

export const EXPENSE_CONFIG: Record<string, { label: string; color: string }> = {
  UTILITIES: { label: "فواتير وخدمات (كهرباء، ماء، إنترنت)", color: "var(--primary-red)" },
  RENTS: { label: "الإيجار", color: "#0EA5E9" },
  SALARIES: { label: "الرواتب والأجور", color: "var(--primary-pink)" },
  MAINTENANCE: { label: "الصيانة والإصلاحات", color: "#F59E0B" },
  GIFTS: { label: "هدايا للعملاء", color: "#10B981" },
  OTHER_EXPENSE: { label: "مصروفات أخرى", color: "#8B5CF6" },
};

// حسابات قديمة (من نسخ سابقة لدوال قاعدة البيانات) تتجمع تحت الحساب الحالي.
// من غيرها القيد بيختفي من الأرباح والميزانية وتطلع الأرقام غلط.
const ACCOUNT_MAPPING: Record<string, string> = {
  ELECTRICITY: "UTILITIES",
  WATER: "UTILITIES",
  INTERNET: "UTILITIES",
  TAILOR_COMMISSION: "OTHER_EXPENSE",
  // تكلفة الهدايا اتسجلت بالاسم ده في دالة البيع القديمة
  GIFT_EXPENSE: "GIFTS",
  // سداد أجرة خياط اتسجلت تكلفتها زمان على حساب الموردين (COGS ← SUPPLIERS)
  TAILOR_PAYMENT: "SUPPLIERS",
};

export function normalizeAccount(account: string | null | undefined) {
  if (!account) return "";
  return ACCOUNT_MAPPING[account] ?? account;
}

export const MONTH_LABELS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const usd = (entry: LedgerEntry) => Number(entry.amount_usd ?? 0) || 0;
const original = (entry: LedgerEntry) => Number(entry.amount ?? 0) || 0;
const round2 = (value: number) => Number(value.toFixed(2));

/** رصيد مدين بالدولار (أصول ومصروفات) */
export function debitBalanceUsd(entries: LedgerEntry[], account: string) {
  return entries.reduce((sum, entry) => {
    if (normalizeAccount(entry.debit_account) === account) return sum + usd(entry);
    if (normalizeAccount(entry.credit_account) === account) return sum - usd(entry);
    return sum;
  }, 0);
}

/** رصيد حساب بعملته الأصلية (للخزينة/البنك) */
export function moneyBalance(
  entries: LedgerEntry[],
  account: "CASH" | "BANK",
  currency: "USD" | "SDG",
) {
  return entries.reduce((sum, entry) => {
    if (entry.currency !== currency) return sum;
    if (entry.debit_account === account) return sum + original(entry);
    if (entry.credit_account === account) return sum - original(entry);
    return sum;
  }, 0);
}

/** القيمة الدفترية بالدولار لرصيد الجنيه (حسب أسعار وقت الدخول) */
function sdgBookValueUsd(entries: LedgerEntry[]) {
  return entries.reduce((sum, entry) => {
    if (entry.currency !== "SDG") return sum;
    const isDebit = entry.debit_account === "CASH" || entry.debit_account === "BANK";
    const isCredit = entry.credit_account === "CASH" || entry.credit_account === "BANK";
    if (isDebit && !isCredit) return sum + usd(entry);
    if (isCredit && !isDebit) return sum - usd(entry);
    return sum;
  }, 0);
}

export function computeBalances(allEntries: LedgerEntry[], currentRate: number | null) {
  const cashUsd = moneyBalance(allEntries, "CASH", "USD");
  const cashSdg = moneyBalance(allEntries, "CASH", "SDG");
  const bankUsd = moneyBalance(allEntries, "BANK", "USD");
  const bankSdg = moneyBalance(allEntries, "BANK", "SDG");

  const sdgTotal = cashSdg + bankSdg;
  const sdgBookUsd = sdgBookValueUsd(allEntries);
  const sdgCurrentUsd = currentRate && currentRate > 0 ? sdgTotal / currentRate : sdgBookUsd;

  return {
    cashUsd: round2(cashUsd),
    cashSdg: round2(cashSdg),
    bankUsd: round2(bankUsd),
    bankSdg: round2(bankSdg),
    // إجمالي السيولة مقوّمة بالدولار بالسعر الحالي
    totalLiquidityUsd: round2(cashUsd + bankUsd + sdgCurrentUsd),
    // خسارة/ربح غير محقق من تغيّر سعر الجنيه على الجنيه المحفوظ
    unrealizedFxUsd: round2(sdgCurrentUsd - sdgBookUsd),
    capital: round2(Math.abs(debitBalanceUsd(allEntries, "CAPITAL"))),
    supplierDebts: round2(Math.max(0, -debitBalanceUsd(allEntries, "SUPPLIERS"))),
    tailorsPayable: round2(Math.max(0, -debitBalanceUsd(allEntries, "TAILORS_PAYABLE"))),
    customerAdvances: round2(Math.max(0, -debitBalanceUsd(allEntries, "CUSTOMER_ADVANCES"))),
    assets: round2(Math.max(0, debitBalanceUsd(allEntries, "ASSETS"))),
    inventory: round2(Math.max(0, debitBalanceUsd(allEntries, "INVENTORY"))),
    workInProgress: round2(Math.max(0, debitBalanceUsd(allEntries, "WORK_IN_PROGRESS"))),
    // دفعات اتدفعت للخياط قبل ما تكلفة الطلب تتثبت (أصل لحين التسوية)
    tailorAdvances: round2(Math.max(0, debitBalanceUsd(allEntries, "TAILOR_ADVANCES"))),
  };
}

export function computePerformance(yearEntries: LedgerEntry[]) {
  const monthly = MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    revenue: 0,
    cogs: 0,
    expenses: 0,
  }));

  const expenseTotals: Record<string, number> = Object.fromEntries(
    Object.keys(EXPENSE_CONFIG).map((key) => [key, 0]),
  );

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;
  let realizedFx = 0;

  for (const entry of yearEntries) {
    const value = usd(entry);
    // الشهر بتوقيت السودان (UTC+2)
    const monthIndex = entry.created_at
      ? new Date(new Date(entry.created_at).getTime() + SUDAN_OFFSET_MS).getUTCMonth()
      : 0;

    // الإيراد (ومرتجع البيع يطرح منه)
    if (entry.credit_account === "SALES" || entry.credit_account === "OTHER_INCOME") {
      revenue += value;
      monthly[monthIndex].revenue += value;
    }
    if (entry.debit_account === "SALES" || entry.debit_account === "OTHER_INCOME") {
      revenue -= value;
      monthly[monthIndex].revenue -= value;
    }

    // تكلفة المبيعات (وعكسها عند المرتجع)
    if (entry.debit_account === "COGS") {
      cogs += value;
      monthly[monthIndex].cogs += value;
    }
    if (entry.credit_account === "COGS") {
      cogs -= value;
      monthly[monthIndex].cogs -= value;
    }

    // المصروفات التشغيلية
    const debitTarget = normalizeAccount(entry.debit_account);
    if (debitTarget in expenseTotals) {
      expenseTotals[debitTarget] += value;
      expenses += value;
      monthly[monthIndex].expenses += value;
    }

    // فروق العملة المحققة (الطرف المدين للحساب الوسيط = اللي خرج)
    if (entry.debit_account === "CURRENCY_EXCHANGE") realizedFx -= value;
    if (entry.credit_account === "CURRENCY_EXCHANGE") realizedFx += value;
  }

  const expenseBreakdown = Object.entries(expenseTotals)
    .filter(([, value]) => value > 0)
    .map(([account, value]) => ({
      account,
      label: EXPENSE_CONFIG[account]?.label ?? account,
      value: round2(value),
      color: EXPENSE_CONFIG[account]?.color ?? "#6B7280",
    }));

  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    expenses: round2(expenses),
    grossProfit: round2(revenue - cogs),
    realizedFx: round2(realizedFx),
    netProfit: round2(revenue - cogs - expenses + realizedFx),
    monthly: monthly.map((month) => ({
      ...month,
      revenue: round2(month.revenue),
      cogs: round2(month.cogs),
      expenses: round2(month.expenses),
    })),
    expenseBreakdown,
  };
}

export const LEDGER_SELECT =
  "amount, amount_usd, currency, debit_account, credit_account, entry_type, created_at";

/** حدود السنة بتوقيت السودان (UTC+2) — نفس توقيت التقارير */
const SUDAN_OFFSET_MS = 2 * 60 * 60 * 1000;

export function sudanYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1) - SUDAN_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year + 1, 0, 1) - SUDAN_OFFSET_MS).toISOString(),
  };
}

/** السنة الحالية بتوقيت السودان */
export function currentSudanYear() {
  return new Date(Date.now() + SUDAN_OFFSET_MS).getUTCFullYear();
}

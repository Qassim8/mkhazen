import { z } from "zod";

/* =========================================================
   COMMON
========================================================= */

const requiredString = (message: string) => z.string().trim().min(1, message);

const nullableOptionalString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.string().trim().nullable().optional(),
);

const positiveAmount = z
  .number({
    message: "المبلغ مطلوب",
  })
  .positive("المبلغ يجب أن يكون أكبر من صفر");

/* =========================================================
   ACCOUNTS
   (المرجع الكامل — لازم يطابق ACCOUNT_LABELS في services.ts)
========================================================= */

export const accountingAccountEnum = z.enum([
  "CASH",
  "BANK",
  "CAPITAL",
  "INVENTORY",

  "WORK_IN_PROGRESS",

  "SUPPLIERS",

  "CUSTOMER_ADVANCES",

  "TAILOR_ADVANCES",
  "TAILORS_PAYABLE",

  "SALES",
  "COGS",

  "ASSETS",
  "SALARIES",
  "MAINTENANCE",
  "UTILITIES",
  "RENTS",
  "OTHER_EXPENSE",
  "OTHER_INCOME",

  "GIFTS",
  "CURRENCY_EXCHANGE",
] as const);

/* =========================================================
   ENTRY TYPES
========================================================= */

export const journalEntryTypeEnum = z.enum([
  "CAPITAL",

  "PURCHASE",
  "PURCHASE_PAYMENT",

  "SALE",
  "SALE_PAYMENT",

  "CUSTOMER_ADVANCE",
  "CUSTOMER_ADVANCE_REFUND",

  "TAILOR_ADVANCE",
  "TAILOR_COST",
  "TAILOR_ADVANCE_APPLICATION",
  "TAILOR_PAYMENT",

  "TAILORING_MATERIAL",
  "PRODUCTION",

  "COGS",

  "EXPENSE",
  "ASSET",

  "INVENTORY_ADJUSTMENT",
  "SALES_RETURN",

  "GIFT",
  "CURRENCY_EXCHANGE",

  "OTHER",
]);

/* =========================================================
   PAYMENT METHOD
========================================================= */

export const accountingPaymentMethodEnum = z.enum(["CASH", "BANK"], {
  message: "طريقة الدفع يجب أن تكون خزينة أو بنك",
});

/* =========================================================
   CURRENCY
   USD = عملة الحسابات، SDG = عملة التعامل مع الزبون
========================================================= */

export const currencyEnum = z.enum(["USD", "SDG"], {
  message: "العملة يجب أن تكون دولار أو جنيه",
});

export type Currency = z.infer<typeof currencyEnum>;

/* =========================================================
   JOURNAL ENTRY
========================================================= */

export const journalEntrySchema = z
  .object({
    id: z.string().uuid(),

    entryNumber: requiredString("رقم القيد مطلوب").max(
      50,
      "رقم القيد طويل جدًا",
    ),

    purchaseOrderId: z
      .string()
      .uuid("معرف أمر الشراء غير صالح")
      .nullable()
      .optional(),

    createdBy: z.string().uuid("معرف المستخدم غير صالح").nullable().optional(),

    branchId: z.string().uuid("معرف الفرع غير صالح"),

    entryType: journalEntryTypeEnum,

    amount: positiveAmount,

    description: nullableOptionalString,

    reference: nullableOptionalString.refine(
      (value) => value === null || value === undefined || value.length <= 100,
      {
        message: "المرجع طويل جدًا",
      },
    ),

    debitAccount: accountingAccountEnum,

    creditAccount: accountingAccountEnum,

    currency: currencyEnum.optional(),

    exchangeRateUsed: z.number().nullable().optional(),

    amountUsd: z.number().optional(),

    createdAt: z.string().optional(),
  })
  .refine((data) => data.debitAccount !== data.creditAccount, {
    message: "الحساب المدين والدائن يجب أن يكونا مختلفين",
    path: ["creditAccount"],
  });

/* =========================================================
   MANUAL JOURNAL ENTRY
========================================================= */

export const createManualJournalEntrySchema = z
  .object({
    entryType: z.enum(["CAPITAL", "EXPENSE", "OTHER"], {
      message: "نوع القيد غير صالح",
    }),

    amount: positiveAmount,

    paymentMethod: accountingPaymentMethodEnum.nullable().optional(),

    account: accountingAccountEnum.nullable().optional(),

    reference: nullableOptionalString.refine(
      (value) => value === null || value === undefined || value.length <= 100,
      {
        message: "المرجع طويل جدًا",
      },
    ),

    description: requiredString("البيان مطلوب").max(500, "البيان طويل جدًا"),

    // عملة الحركة: المصروفات المحلية غالبًا بالجنيه، رأس المال غالبًا بالدولار
    currency: currencyEnum.default("USD"),
  })
  .superRefine((data, ctx) => {
    if (data.entryType === "EXPENSE" && !data.paymentMethod) {
      ctx.addIssue({
        code: "custom",
        message: "يجب تحديد طريقة الدفع للمصروف",
        path: ["paymentMethod"],
      });
    }

    if (data.entryType === "CAPITAL" && !data.paymentMethod) {
      ctx.addIssue({
        code: "custom",
        message: "يجب تحديد مكان إيداع رأس المال",
        path: ["paymentMethod"],
      });
    }

    if (data.entryType === "EXPENSE" && !data.account) {
      ctx.addIssue({
        code: "custom",
        message: "يجب تحديد نوع المصروف",
        path: ["account"],
      });
    }
  });

/* =========================================================
   PURCHASE PAYMENT
========================================================= */

export const createPurchasePaymentSchema = z.object({
  purchaseOrderId: z.string().uuid("معرف أمر الشراء غير صالح"),

  amount: positiveAmount,

  paymentDate: requiredString("تاريخ الدفعة مطلوب"),

  paymentMethod: accountingPaymentMethodEnum,

  reference: nullableOptionalString.refine(
    (value) => value === null || value === undefined || value.length <= 100,
    {
      message: "رقم العملية طويل جدًا",
    },
  ),

  notes: nullableOptionalString,
});

/* =========================================================
   ASSETS
========================================================= */

export const assetCategoryEnum = z.enum([
  "MACHINE",
  "AIR_CONDITIONER",
  "COMPUTER",
  "PRINTER",
  "FURNITURE",
  "OTHER",
]);

export const assetSchema = z.object({
  name: requiredString("اسم الأصل مطلوب").max(255, "اسم الأصل طويل جدًا"),
  category: assetCategoryEnum,
  purchaseValue: positiveAmount,
  purchaseDate: z.coerce.date({
    error: "تاريخ الشراء غير صالح",
  }),
  paymentMethod: accountingPaymentMethodEnum,
  currency: currencyEnum.default("USD"),
  reference: nullableOptionalString.refine(
    (value) => value === null || value === undefined || value.length <= 100,
    {
      message: "المرجع طويل جدًا",
    },
  ),
  notes: nullableOptionalString,
});

export const createAssetSchema = assetSchema;

/* =========================================================
   CURRENCY EXCHANGE (تحويل جنيه ⇄ دولار)
========================================================= */

export const currencyExchangeSchema = z
  .object({
    fromCurrency: currencyEnum,
    fromAccount: accountingPaymentMethodEnum,
    fromAmount: positiveAmount,
    toAccount: accountingPaymentMethodEnum,
    toAmount: positiveAmount,
    notes: nullableOptionalString,
  })
  .superRefine((data, ctx) => {
    const sdg = data.fromCurrency === "SDG" ? data.fromAmount : data.toAmount;
    const usd = data.fromCurrency === "SDG" ? data.toAmount : data.fromAmount;
    const rate = sdg / usd;

    if (!Number.isFinite(rate) || rate < 1) {
      ctx.addIssue({
        code: "custom",
        message: "سعر التحويل الناتج غير منطقي، راجع المبالغ",
        path: ["toAmount"],
      });
    }
  });

export type CurrencyExchangeInput = z.input<typeof currencyExchangeSchema>;

// إضافة أنواع مستقلة للـ Form والـ Output
export type AssetFormInput = z.input<typeof createAssetSchema>;
export type AssetInput = z.output<typeof createAssetSchema>;

/* =========================================================
   ACCOUNTING QUERY (journal entries)
========================================================= */

export const accountingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  entryType: journalEntryTypeEnum.or(z.literal("ALL")).default("ALL"),

  year: z.coerce.number().int().min(2000).max(2100).optional(),

  search: z.string().trim().max(100, "نص البحث طويل جدًا").optional(),
});

/* =========================================================
   ASSETS QUERY (جديد)
========================================================= */

export const assetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  category: assetCategoryEnum.or(z.literal("ALL")).default("ALL"),

  paymentMethod: accountingPaymentMethodEnum
    .or(z.literal("ALL"))
    .default("ALL"),

  search: z.string().trim().max(100, "نص البحث طويل جدًا").optional(),
});

/* =========================================================
   TYPES
========================================================= */

export interface Asset {
  id: string;
  branchId: string;
  createdBy: string | null;

  name: string;
  category:
    | "MACHINE"
    | "AIR_CONDITIONER"
    | "COMPUTER"
    | "PRINTER"
    | "FURNITURE"
    | "OTHER"
    | string;

  purchaseValue: number;
  purchaseValueUsd: number;
  currency: "USD" | "SDG";
  exchangeRateUsed: number | null;
  purchaseDate: string;

  paymentMethod: "CASH" | "BANK";

  reference: string | null;
  notes: string | null;

  createdAt: string;
}

export type AccountingAccount = z.infer<typeof accountingAccountEnum>;

export type JournalEntryType = z.infer<typeof journalEntryTypeEnum>;

export type AccountingPaymentMethod = z.infer<
  typeof accountingPaymentMethodEnum
>;

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export type JournalEntryInput = JournalEntry;

export type CreateManualJournalEntryInput = z.infer<
  typeof createManualJournalEntrySchema
>;

export type CreatePurchasePaymentInput = z.infer<
  typeof createPurchasePaymentSchema
>;

export type AccountingQueryInput = z.infer<typeof accountingQuerySchema>;

export type AssetsQueryInput = z.infer<typeof assetsQuerySchema>;

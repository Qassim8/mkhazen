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
========================================================= */

export const accountingAccountEnum = z.enum([
  "CASH",
  "BANK",
  "INVENTORY",
  "SUPPLIERS",
  "CAPITAL",
  "SALES",
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "SALARIES",
  "MAINTENANCE",
  "ASSETS",
  "OTHER_EXPENSE",
  "OTHER_INCOME",
]);

/* =========================================================
   ENTRY TYPES
========================================================= */

export const journalEntryTypeEnum = z.enum([
  "CAPITAL",
  "PURCHASE",
  "PURCHASE_PAYMENT",
  "SALE",
  "EXPENSE",
  "ASSET",
  "OTHER",
]);

/* =========================================================
   PAYMENT METHOD
========================================================= */

export const accountingPaymentMethodEnum = z.enum(["CASH", "BANK"], {
  message: "طريقة الدفع يجب أن تكون خزينة أو بنك",
});

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

  purchaseDate: requiredString("تاريخ الشراء مطلوب"),

  paymentMethod: accountingPaymentMethodEnum,

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
   ACCOUNTING QUERY
========================================================= */

export const accountingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  entryType: journalEntryTypeEnum.or(z.literal("ALL")).default("ALL"),

  year: z.coerce.number().int().min(2000).max(2100).optional(),

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

export type AssetInput = z.infer<typeof assetSchema>;

export type AccountingQueryInput = z.infer<typeof accountingQuerySchema>;

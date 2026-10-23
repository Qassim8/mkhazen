"use client";

import BackLink from "@/components/shared/BackLink";
import { useEffect } from "react";
import { LuGift, LuPrinter } from "react-icons/lu";
import ImageWithFallback from "@/components/shared/ImageWithFallback";
import { STORE_INFO } from "@/lib/store";
import { formatPercent, formatQuantity, formatRate, formatSDG } from "@/lib/currency";
import CreditValuationBlock from "../_components/CreditValuationBlock";

interface ReceiptItem {
  id: string;
  productName: string;
  sku?: string | null;
  variantLabel?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isGift: boolean;
  giftNote?: string | null;
  /** السعر الأصلي للوحدة وقت البيع */
  listUnitPrice?: number | null;
  priceOverridden?: boolean;
}

/** بيانات الفاتورة الآجلة (للعميل): بدون أي تكلفة أو ربح */
interface ReceiptCredit {
  customerName: string;
  customerPhone: string;
  dueDate: string | null;
  /** سعر الصرف يوم الشراء */
  saleRate: number | null;
  /** سعر الصرف اليوم */
  currentRate: number | null;
  closedReason: "PAID" | "BAD_DEBT" | null;
}

interface ReceiptData {
  id: string;
  orderNumber: string;
  orderType: string;
  createdAt: string;
  completedAt?: string | null;
  branchName: string;
  cashierName: string;
  customerName?: string | null;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  exchangeRate?: number | null;
  paymentStatus: string;
  status: string;
  notes?: string | null;
  items: ReceiptItem[];
  credit?: ReceiptCredit | null;
}

interface Props {
  receipt: ReceiptData;
}

function formatMoney(value: number) {
  return formatSDG(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("ar-SA-u-nu-latn", {
      timeZone: "Africa/Khartoum",
    }),
    time: date.toLocaleTimeString("ar-SA-u-nu-latn", {
      timeZone: "Africa/Khartoum",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function getPaymentMethodLabel(method: string) {
  switch (method) {
    case "CASH":
      return "نقداً / الخزينة";
    case "CARD":
      return "بطاقة";
    case "BANK_TRANSFER":
      return "حوالة / البنك";
    case "MIXED":
      return "دفع مختلط";
    default:
      return method;
  }
}

export default function ReceiptPrintClient({ receipt }: Props) {
  const { date, time } = formatDateTime(receipt.createdAt);
  const giftOnly =
    receipt.items.length > 0 && receipt.items.every((item) => item.isGift);

  // وفّرت اليوم = تخفيضات الأسعار المعدّلة + خصم الفاتورة
  const savedToday =
    receipt.items.reduce((sum, item) => {
      if (item.isGift || !item.priceOverridden || item.listUnitPrice == null) return sum;
      const diff = item.listUnitPrice - item.unitPrice;
      return diff > 0 ? sum + diff * item.quantity : sum;
    }, 0) + receipt.discountAmount;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print();
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b bg-white px-4 py-3 shadow-sm print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          <LuPrinter className="h-4 w-4" />
          طباعة الفاتورة
        </button>
        <BackLink href="/dashboard/pos" label="العودة إلى الكاشير" />
      </div>

      <main className="min-h-screen bg-gray-100 py-20 print:min-h-0 print:bg-white print:p-0">
        <section
          className="receipt mx-auto w-[80mm] bg-white px-4 py-5 text-black print:m-0 print:w-[80mm] print:px-3 print:py-2"
          dir="rtl"
        >
          <div className="border-b border-dashed border-black pb-3 text-center">
            <ImageWithFallback
              src={STORE_INFO.logo}
              alt={STORE_INFO.name}
              width={48}
              height={48}
              unoptimized
              className="mx-auto mb-1 h-12 w-12 object-contain"
            />
            <h1 className="font-semibold text-sm">{STORE_INFO.name}</h1>
            <p className="mt-1 text-xs">
              {giftOnly
                ? "فاتورة هدايا"
                : receipt.credit
                  ? "فاتورة بيع بالتقسيط"
                  : "فاتورة بيع"}
            </p>
            {giftOnly && (
              <p className="mx-auto mt-1 inline-flex items-center gap-1 rounded border border-black px-2 py-0.5 text-xs font-black">
                <LuGift className="h-3 w-3" />
                هدية من المتجر
              </p>
            )}
          </div>

          <div className="space-y-1 border-b border-dashed border-black py-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>رقم الطلب</span>
              <span className="font-mono font-bold">{receipt.orderNumber}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>التاريخ</span>
              <div>
                <span>{date}</span> _ <span>{time}</span>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span>الكاشير</span>
              <span>{receipt.cashierName}</span>
            </div>
            {!giftOnly && (
              <div className="flex justify-between gap-3">
                <span>طريقة الدفع</span>
                <span>{getPaymentMethodLabel(receipt.paymentMethod)}</span>
              </div>
            )}
          </div>

          <div className="py-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 border-b border-black pb-2 text-[10px] font-bold">
              <span>الصنف</span>
              <span>الكمية</span>
              <span>الإجمالي</span>
            </div>

            <div className="space-y-3">
              {receipt.items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-dashed border-gray-400 pb-2 last:border-0"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    {item.isGift && <LuGift className="h-3 w-3 shrink-0" />}
                    <span>{item.productName}</span>
                    {item.isGift && (
                      <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-bold">
                        هدية
                      </span>
                    )}
                  </div>

                  {item.variantLabel && (
                    <div className="mt-0.5 text-[9px] text-gray-600">
                      {item.variantLabel}
                    </div>
                  )}

                  {item.sku && (
                    <div className="mt-0.5 font-mono text-[9px] text-gray-500">
                      SKU: {item.sku}
                    </div>
                  )}

                  {item.isGift && item.giftNote && (
                    <div className="mt-1 text-[9px] text-gray-600">
                      السبب: {item.giftNote}
                    </div>
                  )}

                  <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px]">
                    <span>
                      {item.priceOverridden &&
                        item.listUnitPrice != null &&
                        item.listUnitPrice > item.unitPrice && (
                          <span className="ml-1 text-gray-500 line-through">
                            {formatMoney(item.listUnitPrice)}
                          </span>
                        )}
                      {formatMoney(item.unitPrice)}
                    </span>
                    <span className="text-center">
                      {formatQuantity(item.quantity)}
                    </span>
                    <span className="font-semibold">
                      {formatMoney(item.totalPrice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-dashed border-black pt-3 text-[11px]">
            <div className="flex justify-between">
              <span>المجموع الفرعي</span>
              <span>{formatMoney(receipt.subtotal)}</span>
            </div>

            {receipt.discountAmount > 0 && (
              <>
                <div className="flex justify-between">
                  <span>الخصم</span>
                  <span>-{formatMoney(receipt.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-600">
                  <span>نسبة الخصم</span>
                  <span>{formatPercent(receipt.discountPercentage)}</span>
                </div>
              </>
            )}

            {receipt.taxAmount > 0 && (
              <div className="flex justify-between">
                <span>الضريبة</span>
                <span>{formatMoney(receipt.taxAmount)}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-black pt-2 text-sm font-bold">
              <span>الإجمالي</span>
              <span>{formatMoney(receipt.totalAmount)}</span>
            </div>

            {receipt.credit && (
              <>
                <div className="flex justify-between">
                  <span>المدفوع</span>
                  <span>{formatMoney(receipt.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-black">
                  <span>المتبقي</span>
                  <span>{formatMoney(receipt.remainingAmount)}</span>
                </div>
              </>
            )}

            {savedToday >= 0.01 && (
              <div className="flex justify-between text-[11px] font-bold">
                <span>وفّرت اليوم</span>
                <span>{formatMoney(Math.round(savedToday * 100) / 100)}</span>
              </div>
            )}
          </div>

          {receipt.credit && (
            <>
              <div className="space-y-1 border-t border-dashed border-black py-3 text-[11px]">
                <p className="text-[10px] font-bold">بيانات العميل</p>
                <div className="flex justify-between gap-3">
                  <span>الاسم</span>
                  <span className="font-bold">{receipt.credit.customerName}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>الهاتف</span>
                  <span dir="ltr">{receipt.credit.customerPhone}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>سعر الصرف يوم الشراء</span>
                  <span dir="ltr">{formatRate(receipt.credit.saleRate)}</span>
                </div>
                {receipt.credit.dueDate && (
                  <div className="flex justify-between gap-3 font-bold">
                    <span>تاريخ الاستحقاق</span>
                    <span>{receipt.credit.dueDate}</span>
                  </div>
                )}
                {receipt.credit.closedReason === "BAD_DEBT" && (
                  <p className="text-center font-bold">أُغلقت الفاتورة</p>
                )}
                {receipt.credit.closedReason === "PAID" && (
                  <p className="text-center font-bold">تم سداد الفاتورة بالكامل</p>
                )}
              </div>

              {!receipt.credit.closedReason && (
                <CreditValuationBlock
                  remainingSdg={receipt.remainingAmount}
                  saleRate={receipt.credit.saleRate}
                  currentRate={receipt.credit.currentRate}
                />
              )}
            </>
          )}

          <footer className="border-t border-dashed border-black pt-4 text-center text-[10px]">
            <p className="font-semibold">شكرًا لزيارتكم</p>
            <p className="mt-1" dir="ltr">
              للتواصل: {STORE_INFO.phone}
            </p>
          </footer>
        </section>
      </main>

      <style jsx global>{`
        @page {
          size: 80mm auto;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: white;
          }
          aside,
          nav,
          header,
          .print\:hidden {
            display: none !important;
          }

          .receipt {
            break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
